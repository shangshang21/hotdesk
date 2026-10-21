import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { mkdirSync, existsSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const WORKER_PY = resolve(__dirname, '../scripts/video_worker.py');

/**
 * Execute video_worker.py via uv run with dependencies.
 */
async function runWorker(args, withPackages = ['demucs', 'faster-whisper', 'edge-tts', 'pyJianYingDraft', 'numpy']) {
  const withArgs = withPackages.flatMap(p => ['--with', p]);
  const fullArgs = ['run', '--python', '3.12', ...withArgs, 'python', WORKER_PY, ...args];
  const { stdout, stderr } = await execFileAsync('uv', fullArgs, {
    maxBuffer: 50 * 1024 * 1024,
    windowsHide: true,
    encoding: 'utf8'
  });
  return stdout.trim();
}

export function projectDir(store, id) {
  const dir = join(store.dir, 'videos', id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function createProject(store, { title, source_url = '', video_path = '', route = 'A', voice = 'zh-CN-YunxiNeural' }) {
  const project = store.createVideoProject({
    title,
    source_url,
    video_path,
    route,
    voice
  });

  const dir = projectDir(store, project.id);
  const targetVideo = join(dir, 'raw_video.mp4');

  // If local video path provided, copy to project dir
  if (video_path && existsSync(video_path)) {
    copyFileSync(video_path, targetVideo);
    // Probe video specs
    try {
      const probeOut = await runWorker(['probe', '--video', targetVideo], []);
      const probe = JSON.parse(probeOut);
      store.updateVideoProject(project.id, {
        video_path: targetVideo,
        duration: probe.duration || 0,
        width: probe.width || 1920,
        height: probe.height || 1080,
        stage: 'ingest',
        status: 'ready'
      });
    } catch (e) {
      store.updateVideoProject(project.id, {
        video_path: targetVideo,
        status: 'ready'
      });
    }
  }

  return store.getVideoProject(project.id);
}

export async function separateAudio(store, id) {
  const p = store.getVideoProject(id);
  const dir = projectDir(store, id);
  const rawWav = join(dir, 'raw_audio.wav');
  const demucsDir = join(dir, 'demucs');

  // 1. Extract PCM audio from video
  await execFileAsync('ffmpeg', ['-y', '-i', p.video_path, '-vn', '-acodec', 'pcm_s16le', rawWav]);

  // 2. Demucs vocal separation
  const outStr = await runWorker(['separate', '--audio', rawWav, '--outdir', demucsDir], ['demucs', 'numpy']);
  const res = JSON.parse(outStr);

  const topVocals = join(dir, 'vocals.wav');
  const topNoVocals = join(dir, 'no_vocals.wav');
  if (existsSync(res.vocals)) copyFileSync(res.vocals, topVocals);
  if (existsSync(res.no_vocals)) copyFileSync(res.no_vocals, topNoVocals);

  store.updateVideoProject(id, {
    stage: 'separated',
    metadata: {
      ...p.data,
      vocals_path: topVocals,
      no_vocals_path: topNoVocals
    }
  });

  return store.getVideoProject(id);
}

export async function transcribeAudio(store, id) {
  const p = store.getVideoProject(id);
  const dir = projectDir(store, id);
  const vocals = p.data?.vocals_path || join(dir, 'demucs', 'htdemucs', 'raw_audio', 'vocals.wav');
  const audioSource = existsSync(vocals) ? vocals : join(dir, 'raw_audio.wav');
  const outJson = join(dir, 'transcript.json');

  await runWorker(['transcribe', '--audio', audioSource, '--outjson', outJson], ['faster-whisper', 'numpy']);
  const segments = JSON.parse(readFileSync(outJson, 'utf8'));

  store.updateVideoProject(id, {
    stage: 'transcribed',
    metadata: {
      ...p.data,
      transcript_path: outJson,
      segments
    }
  });

  return store.getVideoProject(id);
}

export async function updateScript(store, id, segments) {
  const p = store.getVideoProject(id);
  const dir = projectDir(store, id);
  const scriptPath = join(dir, 'script_zh.json');
  writeFileSync(scriptPath, JSON.stringify(segments, null, 2), 'utf8');

  store.updateVideoProject(id, {
    stage: 'scripted',
    metadata: {
      ...p.data,
      script_path: scriptPath,
      segments
    }
  });

  return store.getVideoProject(id);
}

export async function synthesizeVoiceover(store, id, voice) {
  const p = store.getVideoProject(id);
  const activeVoice = voice || p.voice || 'zh-CN-YunxiNeural';
  const dir = projectDir(store, id);
  const scriptPath = p.data?.script_path || join(dir, 'script_zh.json');
  const ttsDir = join(dir, 'tts_clips');
  const outWav = join(dir, 'full_dubbing_track.wav');
  const outClips = join(dir, 'clips_meta.json');

  const outStr = await runWorker([
    'tts',
    '--script', scriptPath,
    '--outdir', ttsDir,
    '--voice', activeVoice,
    '--total-dur', String(p.duration || 60),
    '--outwav', outWav,
    '--outclips', outClips
  ], ['edge-tts']);

  const res = JSON.parse(outStr);

  store.updateVideoProject(id, {
    voice: activeVoice,
    stage: 'synthesized',
    metadata: {
      ...p.data,
      dub_track_path: outWav,
      clips_meta_path: outClips,
      clips_count: res.clips_count
    }
  });

  return store.getVideoProject(id);
}

export async function mixAudio(store, id) {
  const p = store.getVideoProject(id);
  const dir = projectDir(store, id);
  const noVocals = p.data?.no_vocals_path || join(dir, 'demucs', 'htdemucs', 'raw_audio', 'no_vocals.wav');
  const dubTrack = p.data?.dub_track_path || join(dir, 'full_dubbing_track.wav');
  const mixedOut = join(dir, 'mixed_final_audio.wav');

  await runWorker([
    'mix',
    '--bgm', noVocals,
    '--voice', dubTrack,
    '--total-dur', String(p.duration || 60),
    '--outwav', mixedOut
  ], []);

  store.updateVideoProject(id, {
    stage: 'mixed',
    metadata: {
      ...p.data,
      mixed_audio_path: mixedOut
    }
  });

  return store.getVideoProject(id);
}

export async function renderAndExport(store, id, { mask_orig_sub = false } = {}) {
  const p = store.getVideoProject(id);
  const dir = projectDir(store, id);
  const mixedAudio = p.data?.mixed_audio_path || join(dir, 'mixed_final_audio.wav');
  const clipsJson = p.data?.clips_meta_path || join(dir, 'clips_meta.json');
  const noVocals = p.data?.no_vocals_path || join(dir, 'demucs', 'htdemucs', 'raw_audio', 'no_vocals.wav');
  const masterMp4 = join(dir, 'master_1080p.mp4');
  const draftDir = join(dir, 'jianying_draft');
  const srtPath = join(dir, 'subtitles.srt');
  const assPath = join(dir, 'subtitles.ass');

  // 1. Generate subtitles
  await runWorker([
    'subtitles',
    '--clips', clipsJson,
    '--outsrt', srtPath,
    '--outass', assPath,
    '--width', String(p.width || 1920),
    '--height', String(p.height || 1080)
  ], []);

  // 2. Render MP4
  const workerArgs = [
    'render',
    '--video', p.video_path,
    '--audio', mixedAudio,
    '--ass', assPath,
    '--outmp4', masterMp4
  ];
  if (mask_orig_sub) workerArgs.push('--mask-sub');
  await runWorker(workerArgs, []);

  // 3. Export JianYing draft
  await runWorker([
    'draft',
    '--video', p.video_path,
    '--bgm', noVocals,
    '--clips', clipsJson,
    '--outdir', draftDir,
    '--name', `hotdesk_${p.id}`
  ], ['pyJianYingDraft']);

  store.updateVideoProject(id, {
    stage: 'completed',
    status: 'completed',
    metadata: {
      ...p.data,
      master_mp4_path: masterMp4,
      jianying_draft_path: join(draftDir, `hotdesk_${p.id}`),
      srt_path: srtPath,
      ass_path: assPath
    }
  });

  return store.getVideoProject(id);
}

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hotdesk Video Worker (自媒体短视频二创内核引擎)
==============================================
Subcommands:
  - probe: 获取视频分辨率、时长、码率等元数据
  - separate: Demucs v4 AI 人声与伴奏分离 (路线 A)
  - transcribe: Faster-Whisper 毫秒级语音转录
  - tts: Edge-TTS 中文神经配音合成与时间槽嵌合 (atempo)
  - mix: EBU R128 (-14.8 LUFS) 广播级音频混音
  - render: 压制 1080P MP4 视频与烧录 ASS 样式字幕
  - draft: 生成剪映 4 轨本地工程 (pyJianYingDraft)
  - all: 一键全流程端到端执行
"""

import os
import sys
import json
import asyncio
import argparse
import subprocess
from pathlib import Path

# Ensure UTF-8 in Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Clash proxy for overseas services (TTS, etc.)
os.environ["HTTP_PROXY"] = "http://127.0.0.1:7897"
os.environ["HTTPS_PROXY"] = "http://127.0.0.1:7897"

def get_media_duration(file_path: str) -> float:
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", file_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, check=True)
    return float(res.stdout.strip())

def probe_video(video_path: str) -> dict:
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration,r_frame_rate,bit_rate",
        "-show_entries", "format=duration,size,bit_rate",
        "-of", "json", video_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, check=True)
    info = json.loads(res.stdout)
    stream = info.get("streams", [{}])[0]
    fmt = info.get("format", {})
    return {
        "width": stream.get("width", 1920),
        "height": stream.get("height", 1080),
        "duration": float(fmt.get("duration") or stream.get("duration") or 0.0),
        "bit_rate": int(fmt.get("bit_rate") or stream.get("bit_rate") or 0),
        "size": int(fmt.get("size") or 0),
        "fps": stream.get("r_frame_rate", "30/1")
    }

def separate_demucs(audio_path: str, output_dir: str) -> tuple[str, str]:
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    cmd = [
        "demucs", "--two-stems", "vocals", "-d", "cpu", "-o", str(out_path), audio_path
    ]
    subprocess.run(cmd, check=True)
    track_name = Path(audio_path).stem
    model_dir = out_path / "htdemucs" / track_name
    vocals = model_dir / "vocals.wav"
    no_vocals = model_dir / "no_vocals.wav"
    return str(vocals), str(no_vocals)

def transcribe_whisper(audio_path: str, output_json: str):
    import numpy as np
    from faster_whisper import WhisperModel

    cmd = [
        "ffmpeg", "-nostdin", "-threads", "0", "-i", audio_path,
        "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000", "-"
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True)
    pcm = np.frombuffer(proc.stdout, np.int16).flatten().astype(np.float32) / 32768.0

    model = WhisperModel("tiny", device="cpu", compute_type="int8")
    raw_segments, info = model.transcribe(pcm, beam_size=5)

    results = []
    for s in raw_segments:
        results.append({
            "start": round(s.start, 2),
            "end": round(s.end, 2),
            "en_text": s.text.strip(),
            "zh_text": ""
        })

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

async def synthesize_edge_tts(segments: list[dict], output_dir: str, voice: str = "zh-CN-YunxiNeural") -> list[dict]:
    import edge_tts
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    clips = []

    for i, seg in enumerate(segments):
        zh_text = seg.get("zh_text") or seg.get("en_text")
        target_duration = seg["end"] - seg["start"]
        raw_clip = out_path / f"clip_{i:03d}_raw.mp3"
        fitted_clip = out_path / f"clip_{i:03d}_fitted.mp3"

        communicate = edge_tts.Communicate(zh_text, voice)
        await communicate.save(str(raw_clip))

        raw_dur = get_media_duration(str(raw_clip))
        tempo = raw_dur / target_duration if target_duration > 0.5 else 1.0
        tempo = max(0.85, min(1.35, tempo))

        cmd = [
            "ffmpeg", "-y", "-i", str(raw_clip),
            "-filter:a", f"atempo={tempo:.3f}",
            "-vn", str(fitted_clip)
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        actual_dur = get_media_duration(str(fitted_clip))
        clips.append({
            "index": i,
            "start": seg["start"],
            "end": seg["start"] + actual_dur,
            "target_end": seg["end"],
            "zh_text": zh_text,
            "en_text": seg.get("en_text", ""),
            "clip_path": str(fitted_clip),
            "duration": actual_dur
        })

    return clips

def assemble_dubbing_track(clips: list[dict], total_duration: float, output_path: str):
    inputs = []
    filter_complex = []
    for i, clip in enumerate(clips):
        inputs.extend(["-i", clip["clip_path"]])
        delay_ms = int(clip["start"] * 1000)
        filter_complex.append(f"[{i}:a]adelay={delay_ms}|{delay_ms}[a{i}];")

    mix_str = "".join(f"[a{i}]" for i in range(len(clips)))
    filter_complex.append(f"{mix_str}amix=inputs={len(clips)}:dropout_transition=0:normalize=0[aout]")

    cmd = ["ffmpeg", "-y"] + inputs + [
        "-filter_complex", "".join(filter_complex),
        "-map", "[aout]",
        "-t", str(total_duration),
        output_path
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

def mix_route_a(no_vocals_audio: str, dub_track: str, total_duration: float, output_path: str, bgm_volume: float = 0.40):
    filter_complex = (
        f"[0:a]volume={bgm_volume}[bgm];"
        f"[1:a]volume=1.0[voice];"
        f"[bgm][voice]amix=inputs=2:normalize=0[mixed];"
        f"[mixed]loudnorm=I=-14:TP=-1.5:LRA=11[out]"
    )
    cmd = [
        "ffmpeg", "-y",
        "-i", no_vocals_audio,
        "-i", dub_track,
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-t", str(total_duration),
        output_path
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

def format_timestamp_srt(seconds: float) -> str:
    millis = int((seconds - int(seconds)) * 1000)
    mins, secs = divmod(int(seconds), 60)
    hours, mins = divmod(mins, 60)
    return f"{hours:02d}:{mins:02d}:{secs:02d},{millis:03d}"

def format_timestamp_ass(seconds: float) -> str:
    centis = int((seconds - int(seconds)) * 100)
    mins, secs = divmod(int(seconds), 60)
    hours, mins = divmod(mins, 60)
    return f"{hours:d}:{mins:02d}:{secs:02d}.{centis:02d}"

def generate_subtitles(clips: list[dict], out_srt: str, out_ass: str, video_w: int = 1920, video_h: int = 1080):
    # 1. SRT
    srt_lines = []
    for i, clip in enumerate(clips, 1):
        s_srt = format_timestamp_srt(clip["start"])
        e_srt = format_timestamp_srt(clip["end"])
        srt_lines.append(f"{i}\n{s_srt} --> {e_srt}\n{clip['zh_text']}\n")
    Path(out_srt).write_text("\n".join(srt_lines), encoding="utf-8")

    # 2. ASS
    header = f"""[Script Info]
Title: Hotdesk AI Recreated Subtitles
ScriptType: v4.00+
PlayResX: {video_w}
PlayResY: {video_h}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,54,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,40,40,65,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for clip in clips:
        s_ass = format_timestamp_ass(clip["start"])
        e_ass = format_timestamp_ass(clip["end"])
        text = clip["zh_text"].replace("\n", "\\N")
        events.append(f"Dialogue: 0,{s_ass},{e_ass},Default,,0,0,0,,{text}")

    Path(out_ass).write_text(header + "\n".join(events), encoding="utf-8")

def render_master_mp4(video_path: str, mixed_audio: str, ass_subtitles: str, output_path: str, mask_orig_sub: bool = False):
    safe_ass = str(Path(ass_subtitles).resolve()).replace("\\", "/").replace(":", "\\:")
    if mask_orig_sub:
        filter_complex = (
            f"[0:v]split[v_base][v_crop];"
            f"[v_crop]crop=iw:ih*0.14:0:ih*0.75,boxblur=10:5[v_blur];"
            f"[v_base][v_blur]overlay=0:H*0.75,ass='{safe_ass}'[v_out]"
        )
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", mixed_audio,
            "-filter_complex", filter_complex,
            "-map", "[v_out]",
            "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            output_path
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", mixed_audio,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-vf", f"ass='{safe_ass}'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            output_path
        ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

def export_jianying(video_path: str, clips: list[dict], bgm_wav: str, output_draft_dir: str, project_name: str = "hotdesk_video_draft"):
    import pyJianYingDraft as draft
    from pyJianYingDraft import trange_seconds, trange

    os.makedirs(output_draft_dir, exist_ok=True)
    draft_folder = draft.DraftFolder(output_draft_dir)
    script = draft_folder.create_draft(project_name, 1920, 1080, allow_replace=True)

    script.append_tracks([
        draft.TrackSpec(draft.TrackType.video, "main_video"),
        draft.TrackSpec(draft.TrackType.audio, "original_bgm"),
        draft.TrackSpec(draft.TrackType.audio, "zh_voiceover"),
        draft.TrackSpec(draft.TrackType.text, "zh_subtitles"),
    ])

    video_mat = draft.VideoMaterial(video_path)
    video_seg = draft.VideoSegment(video_mat, trange(0, video_mat.duration))
    script.add_segment(video_seg, "main_video")

    if os.path.exists(bgm_wav):
        audio_mat = draft.AudioMaterial(bgm_wav)
        bgm_seg = draft.AudioSegment(audio_mat, trange(0, audio_mat.duration), volume=0.35)
        script.add_segment(bgm_seg, "original_bgm")

    last_audio_end = 0.0
    last_text_end = 0.0
    for clip in clips:
        audio_start = max(clip["start"], last_audio_end + 0.05)
        clip_mat = draft.AudioMaterial(clip["clip_path"])
        audio_seg = draft.AudioSegment(clip_mat, trange(0, clip_mat.duration), volume=1.0)
        audio_seg.target_timerange = trange_seconds(audio_start, duration=clip["duration"])
        script.add_segment(audio_seg, "zh_voiceover")
        last_audio_end = audio_start + clip["duration"]

        text_start = max(clip["start"], last_text_end + 0.05)
        text_seg = draft.TextSegment(
            clip["zh_text"],
            trange_seconds(text_start, duration=clip["duration"]),
            style=draft.TextStyle(color=(1.0, 1.0, 0.0)),
            clip_settings=draft.ClipSettings(transform_y=-0.75)
        )
        script.add_segment(text_seg, "zh_subtitles")
        last_text_end = text_start + clip["duration"]

    script.save()

# ==================== CLI Entrypoints ====================
def main():
    parser = argparse.ArgumentParser(description="Hotdesk Video Worker")
    subparsers = parser.add_subparsers(dest="cmd")

    # probe
    p_probe = subparsers.add_parser("probe")
    p_probe.add_argument("--video", required=True)

    # separate
    p_sep = subparsers.add_parser("separate")
    p_sep.add_argument("--audio", required=True)
    p_sep.add_argument("--outdir", required=True)

    # transcribe
    p_trans = subparsers.add_parser("transcribe")
    p_trans.add_argument("--audio", required=True)
    p_trans.add_argument("--outjson", required=True)

    # tts
    p_tts = subparsers.add_parser("tts")
    p_tts.add_argument("--script", required=True)
    p_tts.add_argument("--outdir", required=True)
    p_tts.add_argument("--voice", default="zh-CN-YunxiNeural")
    p_tts.add_argument("--total-dur", type=float, required=True)
    p_tts.add_argument("--outwav", required=True)
    p_tts.add_argument("--outclips", required=True)

    # mix
    p_mix = subparsers.add_parser("mix")
    p_mix.add_argument("--bgm", required=True)
    p_mix.add_argument("--voice", required=True)
    p_mix.add_argument("--total-dur", type=float, required=True)
    p_mix.add_argument("--outwav", required=True)

    # render
    p_ren = subparsers.add_parser("render")
    p_ren.add_argument("--video", required=True)
    p_ren.add_argument("--audio", required=True)
    p_ren.add_argument("--ass", required=True)
    p_ren.add_argument("--outmp4", required=True)
    p_ren.add_argument("--mask-sub", action="store_true")

    # subtitles
    p_sub = subparsers.add_parser("subtitles")
    p_sub.add_argument("--clips", required=True)
    p_sub.add_argument("--outsrt", required=True)
    p_sub.add_argument("--outass", required=True)
    p_sub.add_argument("--width", type=int, default=1920)
    p_sub.add_argument("--height", type=int, default=1080)

    # draft
    p_draft = subparsers.add_parser("draft")
    p_draft.add_argument("--video", required=True)
    p_draft.add_argument("--bgm", required=True)
    p_draft.add_argument("--clips", required=True)
    p_draft.add_argument("--outdir", required=True)
    p_draft.add_argument("--name", default="hotdesk_video_draft")

    args = parser.parse_args()

    if args.cmd == "probe":
        data = probe_video(args.video)
        print(json.dumps(data, ensure_ascii=False))

    elif args.cmd == "separate":
        vocals, no_vocals = separate_demucs(args.audio, args.outdir)
        print(json.dumps({"vocals": vocals, "no_vocals": no_vocals}, ensure_ascii=False))

    elif args.cmd == "transcribe":
        transcribe_whisper(args.audio, args.outjson)
        print(json.dumps({"saved": args.outjson}, ensure_ascii=False))

    elif args.cmd == "tts":
        with open(args.script, "r", encoding="utf-8") as f:
            segments = json.load(f)
        clips = asyncio.run(synthesize_edge_tts(segments, args.outdir, voice=args.voice))
        assemble_dubbing_track(clips, args.total_dur, args.outwav)
        with open(args.outclips, "w", encoding="utf-8") as f:
            json.dump(clips, f, ensure_ascii=False, indent=2)
        print(json.dumps({"clips_count": len(clips), "dub_track": args.outwav}, ensure_ascii=False))

    elif args.cmd == "mix":
        mix_route_a(args.bgm, args.voice, args.total_dur, args.outwav)
        print(json.dumps({"mixed_audio": args.outwav}, ensure_ascii=False))

    elif args.cmd == "render":
        render_master_mp4(args.video, args.audio, args.ass, args.outmp4, mask_orig_sub=args.mask_sub)
        print(json.dumps({"master_mp4": args.outmp4}, ensure_ascii=False))

    elif args.cmd == "subtitles":
        with open(args.clips, "r", encoding="utf-8") as f:
            clips = json.load(f)
        generate_subtitles(clips, args.outsrt, args.outass, video_w=args.width, video_h=args.height)
        print(json.dumps({"srt": args.outsrt, "ass": args.outass}, ensure_ascii=False))

    elif args.cmd == "draft":
        with open(args.clips, "r", encoding="utf-8") as f:
            clips = json.load(f)
        export_jianying(args.video, clips, args.bgm, args.outdir, project_name=args.name)
        print(json.dumps({"draft_dir": args.outdir}, ensure_ascii=False))

    else:
        parser.print_help()

if __name__ == "__main__":
    main()

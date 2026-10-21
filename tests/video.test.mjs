import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store.mjs';
import { callTool, toolDefinitions } from '../src/tools.mjs';

test('Video Studio: Store CRUD operations and MCP tool calling', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'hotdesk-video-test-'));
  const store = new Store(dir);

  try {
    // 1. Tool definitions exist
    assert.ok(toolDefinitions.list_video_projects);
    assert.ok(toolDefinitions.create_video_project);
    assert.ok(toolDefinitions.get_video_project);
    assert.ok(toolDefinitions.separate_video_audio);
    assert.ok(toolDefinitions.transcribe_video_audio);
    assert.ok(toolDefinitions.rewrite_video_script);
    assert.ok(toolDefinitions.synthesize_video_voiceover);
    assert.ok(toolDefinitions.mix_video_audio);
    assert.ok(toolDefinitions.render_video_master);
    assert.ok(toolDefinitions.delete_video_project);

    // 2. Create project
    const created = await callTool(store, 'create_video_project', {
      title: '英伟达 2026 机器人发布会',
      url: 'https://example.com/demo.mp4'
    });

    assert.ok(created.id);
    assert.equal(created.title, '英伟达 2026 机器人发布会');
    assert.equal(created.stage, 'ingest');

    // 3. List projects
    const listRes = await callTool(store, 'list_video_projects', {});
    assert.equal(listRes.projects.length, 1);
    assert.equal(listRes.projects[0].id, created.id);

    // 4. Get project
    const fetched = await callTool(store, 'get_video_project', { project_id: created.id });
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.title, created.title);

    // 5. Update script
    const segments = [
      { start: 0.0, end: 3.5, en_text: 'Look at this new humanoid robot.', zh_text: '兄弟们看这个全新人形机器人！' },
      { start: 3.5, end: 7.2, en_text: 'It moves so fast and accurately.', zh_text: '它的动作不仅快得惊人，而且极其精准。' }
    ];
    const scripted = await callTool(store, 'rewrite_video_script', {
      project_id: created.id,
      segments
    });
    assert.equal(scripted.stage, 'scripted');
    assert.equal(scripted.data.segments.length, 2);
    assert.equal(scripted.data.segments[0].zh_text, '兄弟们看这个全新人形机器人！');

    // 6. Delete project
    const delRes = await callTool(store, 'delete_video_project', { project_id: created.id });
    assert.equal(delRes.deleted, true);

    const afterDel = await callTool(store, 'list_video_projects', {});
    assert.equal(afterDel.projects.length, 0);

  } finally {
    store.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

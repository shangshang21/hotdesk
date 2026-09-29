import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const now = () => new Date().toISOString();
export const uid = (prefix) => `${prefix}_${randomUUID().slice(0, 12)}`;
export const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const STAGES = ['collect', 'editor', 'research', 'opinion', 'benchmark', 'angles', 'write', 'review'];
export const dataDir = resolve(process.env.HOTDESK_DATA || fileURLToPath(new URL('../data', import.meta.url)));
export function canonical(url) {
  if (!url) return '';
  const u = new URL(url);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('仅支持无凭据的 HTTP(S) 地址');
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) if (/^(utm_|spm$|from$|share_source$|share_medium$)/.test(k)) u.searchParams.delete(k);
  return u.href;
}
export const normalize = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
// Source provenance: collected = fetched by Hotdesk itself; human = pasted by the user in the web UI;
// verified = agent import whose text was found on the live page; anything else is unverified.
export const TRUSTED_ORIGINS = ['collected', 'human', 'verified'];
export const verificationOf = (s) => s.metadata?.verification?.status || (s.metadata?.imported ? 'unverified' : 'collected');

export class Store {
  constructor(dir = dataDir) {
    this.dir = resolve(dir); mkdirSync(this.dir, { recursive: true }); mkdirSync(join(this.dir, 'raw'), { recursive: true });
    this.db = new DatabaseSync(join(this.dir, 'hotdesk.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS topics(id TEXT PRIMARY KEY,title TEXT NOT NULL,norm TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,selected_angle TEXT,paused INTEGER NOT NULL DEFAULT 0,approved_artifact TEXT,merged_into TEXT);
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id),dedup TEXT NOT NULL,platform TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,url TEXT NOT NULL,body TEXT NOT NULL,published_at TEXT,observed_at TEXT NOT NULL,raw_hash TEXT,metadata TEXT NOT NULL,UNIQUE(topic_id,dedup));
      CREATE TABLE IF NOT EXISTS source_versions(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id),platform TEXT NOT NULL,url TEXT NOT NULL,rank INTEGER,observed_at TEXT NOT NULL,raw_hash TEXT,UNIQUE(topic_id,platform,url,observed_at));
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL REFERENCES topics(id),stage TEXT NOT NULL,version INTEGER NOT NULL,valid INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,actor TEXT NOT NULL,basis TEXT NOT NULL,content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,topic_id TEXT,at TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,topic_id TEXT,kind TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,input TEXT NOT NULL,result TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS claims(id TEXT PRIMARY KEY,topic_id TEXT NOT NULL,stage TEXT NOT NULL,actor TEXT NOT NULL,basis TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sources_topic ON sources(topic_id); CREATE INDEX IF NOT EXISTS artifacts_topic ON artifacts(topic_id,stage,valid);
      PRAGMA user_version=1;`);
  }
  close() { this.db.close(); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const out = fn(); this.db.exec('COMMIT'); return out; } catch(e) { this.db.exec('ROLLBACK'); throw e; } }
  event(topic, kind, payload = {}) { this.db.prepare('INSERT INTO events(topic_id,at,kind,payload) VALUES(?,?,?,?)').run(topic, now(), kind, JSON.stringify(payload)); }
  setting(key, fallback = null) { const v = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return v ? JSON.parse(v.value) : fallback; }
  setSetting(key, value) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key, JSON.stringify(value)); }
  raw(body, meta = {}) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const digest = hash(text); const path = join(this.dir, 'raw', `${digest}.txt`);
    if (!existsSync(path)) writeFileSync(path, text, 'utf8');
    this.event(null, 'raw_saved', { hash: digest, ...meta }); return digest;
  }
  readRaw(digest) { if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('无效快照'); return readFileSync(join(this.dir, 'raw', `${digest}.txt`), 'utf8'); }
  topic(id) { const t = this.db.prepare('SELECT * FROM topics WHERE id=?').get(id); if (!t) throw new Error('话题不存在'); return t; }
  createTopic(title) {
    title = normalize(title); if (!title || title.length > 300) throw new Error('标题需为 1–300 字符');
    const id = uid('t'); const time = now();
    this.db.prepare('INSERT INTO topics(id,title,norm,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, title, title.toLowerCase().replace(/[\p{P}\p{Z}]/gu, ''), time, time);
    this.event(id, 'topic_created', { title }); return this.topic(id);
  }
  findTopic(title, url) {
    if (url) { const s = this.db.prepare('SELECT t.* FROM sources s JOIN topics t ON t.id=s.topic_id WHERE s.url=? AND t.merged_into IS NULL LIMIT 1').get(canonical(url)); if (s) return s; }
    const norm = normalize(title).toLowerCase().replace(/[\p{P}\p{Z}]/gu, '');
    return this.db.prepare("SELECT * FROM topics WHERE norm=? AND merged_into IS NULL AND created_at>=? ORDER BY created_at DESC LIMIT 1").get(norm, new Date(Date.now() - 3 * 86400000).toISOString());
  }
  sources(id) { return this.db.prepare('SELECT * FROM sources WHERE topic_id=? ORDER BY observed_at,id').all(id).map(s => ({ ...s, metadata: JSON.parse(s.metadata) })); }
  invalidate(id, from = 1, reason = 'input_changed') {
    this.db.prepare(`UPDATE artifacts SET valid=0 WHERE topic_id=? AND stage IN (${STAGES.slice(from).map(() => '?').join(',')})`).run(id, ...STAGES.slice(from));
    this.db.prepare('UPDATE topics SET approved_artifact=NULL,updated_at=? WHERE id=?').run(now(), id);
    this.db.prepare("UPDATE claims SET status='stale' WHERE topic_id=? AND status='active'").run(id);
    this.event(id, 'downstream_invalidated', { from: STAGES[from], reason });
  }
  addSource(id, input) {
    this.topic(id);
    const title = normalize(input.title).slice(0, 1000); const body = String(input.body || '').slice(0, 100000);
    const url = canonical(input.url || ''); const kind = input.kind || 'article'; const platform = input.platform || 'web';
    if (!['article', 'post', 'comment', 'hotlist', 'benchmark'].includes(kind)) throw new Error('不支持的素材类型');
    if (!title && !body) throw new Error('素材正文和标题不能同时为空');
    const dedup = hash([platform, kind, input.external_id || (kind === 'comment' ? [url, normalize(body)] : url || normalize(body || title))]);
    const old = this.db.prepare('SELECT * FROM sources WHERE topic_id=? AND dedup=?').get(id, dedup);
    if (old && old.title === title && old.body === body) return { ...old, duplicate: true };
    const sid = old?.id || uid('s'); const observed = input.observed_at && !isNaN(Date.parse(input.observed_at)) ? new Date(input.observed_at).toISOString() : now();
    const published = input.published_at && !isNaN(Date.parse(input.published_at)) ? new Date(input.published_at).toISOString() : null;
    const rawHash = input.raw_hash || this.raw(input, { origin: 'import', url });
    const meta = JSON.stringify({original_url:input.url||'',external_id:input.external_id||null,...input.metadata});
    this.transaction(() => {
      this.db.prepare(`INSERT INTO sources VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(topic_id,dedup) DO UPDATE SET title=excluded.title,body=excluded.body,published_at=excluded.published_at,observed_at=excluded.observed_at,raw_hash=excluded.raw_hash,metadata=excluded.metadata`).run(sid,id,dedup,platform,kind,title,url,body,published,observed,rawHash,meta);
      this.db.prepare('INSERT INTO source_versions VALUES(?,?,?,?)').run(uid('sv'),sid,now(),JSON.stringify({...input,id:sid,raw_hash:rawHash}));
      this.db.prepare('UPDATE topics SET revision=revision+1 WHERE id=?').run(id);
      this.invalidate(id, kind === 'benchmark' ? STAGES.indexOf('benchmark') : 1, kind === 'benchmark' ? '对标文章新增或更新' : '素材新增或更新'); this.event(id, 'source_saved', { id: sid, platform, kind, raw_hash: rawHash });
    });
    return this.db.prepare('SELECT * FROM sources WHERE id=?').get(sid);
  }
  ingest(items, rawHash) {
    const out = [];
    for (const item of items.slice(0, 100)) {
      const t = this.findTopic(item.title, item.url) || this.createTopic(item.title);
      this.addSource(t.id, { ...item, kind: 'hotlist', raw_hash: rawHash });
      if (Number.isInteger(item.rank) && item.rank >= 0) this.db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?)').run(uid('o'),t.id,item.platform,item.url || '',item.rank,item.observed_at || now(),rawHash);
      out.push(t.id);
    }
    return [...new Set(out)];
  }
  latest(id, stage) { const a = this.db.prepare('SELECT * FROM artifacts WHERE topic_id=? AND stage=? AND valid=1 ORDER BY version DESC LIMIT 1').get(id,stage); return a ? { ...a, content: JSON.parse(a.content) } : null; }
  artifacts(id) { return this.db.prepare('SELECT * FROM artifacts WHERE topic_id=? ORDER BY created_at DESC,version DESC').all(id).map(a => ({...a,content:JSON.parse(a.content)})); }
  basis(id, stage) { const t = this.topic(id); return hash({ revision: t.revision, selected_angle: stage === 'write' || stage === 'review' ? t.selected_angle : null, upstream: STAGES.slice(1, STAGES.indexOf(stage)).map(s => this.latest(id,s)?.id || null) }); }
  next(id) { if (this.topic(id).paused) return 'paused'; if (!this.sources(id).some(s => !['hotlist','benchmark'].includes(s.kind) && normalize(s.body).length>=5)) return 'collect'; return STAGES.slice(1).find(s => !this.latest(id,s)) || 'done'; }
  detail(id) {
    const t = this.topic(id); const artifacts = this.artifacts(id); const sources = this.sources(id);
    const observations = this.db.prepare('SELECT * FROM observations WHERE topic_id=? ORDER BY observed_at').all(id);
    const by = new Map(); for (const o of observations) { const k = `${o.platform}:${o.url}`; if (!by.has(k)) by.set(k, []); by.get(k).push(o); }
    const movements = [...by].flatMap(([k,v]) => v.length > 1 && v[0].rank > 0 && v.at(-1).rank > 0 && v[0].observed_at !== v.at(-1).observed_at ? [{ platform: v[0].platform, from:v[0].rank, to:v.at(-1).rank, delta:v[0].rank-v.at(-1).rank }] : []);
    return { ...t, sources, artifacts, observations, movements, images:this.setting(`images:${id}`,[]), platform_count: new Set(sources.filter(s=>s.kind==='hotlist'||s.kind==='post'||s.kind==='comment').map(s=>s.platform)).size, next: this.next(id), events: this.db.prepare('SELECT * FROM events WHERE topic_id=? ORDER BY id DESC LIMIT 100').all(id).map(e=>({...e,payload:JSON.parse(e.payload)})) };
  }
  list() {
    return this.db.prepare('SELECT * FROM topics WHERE merged_into IS NULL ORDER BY updated_at DESC LIMIT 300').all().map(t => {
      const d = this.detail(t.id); const ed = this.latest(t.id,'editor');
      return {...t,next:d.next,source_count:d.sources.length,platform_count:d.platform_count,movements:d.movements,grade:ed?.content.grade || null,editor:ed?.content || null};
    });
  }
  saveArtifact(id, stage, content, actor, basis, claimId) {
    return this.transaction(() => {
      if (basis !== this.basis(id,stage)) throw new Error('资料或上游结果已变化，请重新领取任务');
      if (this.topic(id).paused) throw new Error('任务已暂停');
      if (claimId) { const c=this.db.prepare('SELECT * FROM claims WHERE id=?').get(claimId); if (!c||c.topic_id!==id||c.stage!==stage||c.status!=='active'||c.expires_at<now()) throw new Error('任务租约无效或已过期'); }
      const index = STAGES.indexOf(stage); if (index<1) throw new Error('无效工序');
      const missing = STAGES.slice(1,index).find(s=>!this.latest(id,s)); if (missing) throw new Error(`请先完成 ${missing}`);
      const version = this.db.prepare('SELECT COALESCE(MAX(version),0)+1 AS v FROM artifacts WHERE topic_id=? AND stage=?').get(id,stage).v;
      this.invalidate(id,index,'工序结果更新'); const aid=uid('a');
      this.db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,1,?,?,?,?)').run(aid,id,stage,version,now(),actor,basis,JSON.stringify(content));
      if (claimId) this.db.prepare("UPDATE claims SET status='completed' WHERE id=?").run(claimId);
      this.event(id,'artifact_saved',{id:aid,stage,version,actor}); return this.latest(id,stage);
    });
  }
  claim(id, stage, actor) {
    return this.transaction(() => {
      if (this.next(id)!==stage) throw new Error(`当前可执行工序为 ${this.next(id)}`);
      this.db.prepare("UPDATE claims SET status='expired' WHERE status='active' AND expires_at<?").run(now());
      if (this.db.prepare("SELECT id FROM claims WHERE topic_id=? AND status='active'").get(id)) throw new Error('已有 Agent 正在处理此话题');
      const c={id:uid('claim'),topic_id:id,stage,actor,basis:this.basis(id,stage),expires_at:new Date(Date.now()+20*60000).toISOString(),status:'active'};
      this.db.prepare('INSERT INTO claims VALUES(?,?,?,?,?,?,?)').run(c.id,id,stage,actor,c.basis,c.expires_at,c.status); this.event(id,'task_claimed',c); return c;
    });
  }
  release(id, reason='Agent 主动释放') { const c=this.db.prepare('SELECT * FROM claims WHERE id=?').get(id); if(!c) throw new Error('租约不存在'); this.db.prepare("UPDATE claims SET status='released' WHERE id=? AND status='active'").run(id); this.event(c.topic_id,'task_released',{id,reason}); }
  reset(id,stage) { if(!STAGES.slice(1).includes(stage)) throw new Error('无效工序'); this.transaction(()=>this.invalidate(id,STAGES.indexOf(stage),'用户要求重跑')); }
  selectAngle(id,angle) { const a=this.latest(id,'angles'); if(!a?.content.angles.some(x=>x.id===angle)) throw new Error('角度不存在'); this.transaction(()=>{this.db.prepare('UPDATE topics SET selected_angle=? WHERE id=?').run(angle,id); this.invalidate(id,STAGES.indexOf('write'),'切入角度变更');}); }
  pause(id,value) {this.topic(id); this.db.prepare('UPDATE topics SET paused=?,updated_at=? WHERE id=?').run(value?1:0,now(),id); if(value)this.db.prepare("UPDATE claims SET status='stale' WHERE topic_id=? AND status='active'").run(id); this.event(id,value?'paused':'resumed');}
  approve(id) { const w=this.latest(id,'write'),r=this.latest(id,'review'); if(!w||!r||r.content.verdict!=='pass') throw new Error('须先完成草稿检查并通过；有问题请修改后重审'); this.db.prepare('UPDATE topics SET approved_artifact=? WHERE id=?').run(w.id,id);this.event(id,'human_approved',{artifact:w.id});return w.id; }
  merge(from,to) {
    if(from===to)throw new Error('不能合并到自身');const a=this.topic(from),b=this.topic(to);if(a.merged_into||b.merged_into)throw new Error('已归档合并的话题不能再次合并');
    for(const s of this.sources(from))this.addSource(to,{...s,metadata:{...s.metadata,merged_from:from}});
    this.transaction(()=>{for(const o of this.db.prepare('SELECT * FROM observations WHERE topic_id=?').all(from))this.db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?,?,?,?,?)').run(uid('o'),to,o.platform,o.url,o.rank,o.observed_at,o.raw_hash);this.db.prepare('UPDATE topics SET merged_into=?,paused=1 WHERE id=?').run(to,from);this.invalidate(from,1,'话题已合并');this.event(to,'topic_merged',{from});});return this.detail(to);
  }
  job(kind,topic,input) {const id=uid('j'),t=now();this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?)').run(id,topic,kind,'running',t,t,JSON.stringify(input),null,null);return id;}
  finishJob(id,result,error) {const status=error?'failed':result?.status==='needs_browser'?'needs_input':result?.status==='partial'?'partial':result?.status==='empty'?'empty':'completed';this.db.prepare('UPDATE jobs SET status=?,updated_at=?,result=?,error=? WHERE id=?').run(status,now(),result?JSON.stringify(result):null,error||null,id);}
  jobs() {return this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50').all().map(j=>({...j,input:JSON.parse(j.input),result:j.result?JSON.parse(j.result):null}));}
}

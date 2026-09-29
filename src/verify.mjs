import { load } from 'cheerio';
import { fetchRaw } from './adapters.mjs';
import { canonical, now, normalize } from './store.mjs';

// Compare on letters/digits only, so punctuation or spacing changes don't matter.
export const squash = (s) => normalize(s).replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

// Pick up to 3 evenly spaced 12-char probes from the imported text.
export function probes(body, size = 12) {
  const t = squash(body);
  if (t.length <= size) return t ? [t] : [];
  const n = Math.min(3, Math.floor(t.length / size));
  return Array.from({ length: n }, (_, i) => { const at = Math.floor((t.length - size) * (n === 1 ? 0 : i / (n - 1))); return t.slice(at, at + size); });
}
export function matches(body, pageText) {
  const page = squash(pageText), list = probes(body);
  const hit = list.filter(p => page.includes(p)).length;
  return { hit, total: list.length, ok: list.length > 0 && hit >= Math.max(1, Math.ceil(list.length * 2 / 3)) };
}

// Agent imports are untrusted until the live page shows the same text.
// Web UI imports come from the user and are trusted as human input.
export async function verifySources(store, items, origin) {
  if (origin === 'web') return items.map(s => ({ ...s, verification: { status: 'human', at: now() } }));
  const pages = new Map();
  const out = [];
  for (const s of items) {
    let v;
    if (!s.url) v = { status: 'unverified', reason: '缺少原始链接' };
    else {
      let key; try { key = canonical(s.url).replace(/#.*$/, ''); } catch { key = s.url; }
      if (!pages.has(key)) pages.set(key, fetchRaw(store, key).then(r => ({ text: load(r.body).text() + '\n' + r.body })).catch(e => ({ error: e.message })));
      const page = await pages.get(key);
      if (page.error) v = { status: 'unverified', reason: `原链接无法打开：${page.error}` };
      else { const m = matches(`${s.body || ''}` || s.title, page.text); v = m.ok ? { status: 'verified', probes: `${m.hit}/${m.total}` } : { status: 'unverified', reason: `原链接页面里找不到这段内容（命中 ${m.hit}/${m.total}）`, probes: `${m.hit}/${m.total}` }; }
    }
    out.push({ ...s, verification: { ...v, at: now() } });
  }
  return out;
}

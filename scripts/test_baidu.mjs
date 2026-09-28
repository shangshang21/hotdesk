import { load } from 'cheerio';

async function testBaidu() {
  const r = await fetch('https://top.baidu.com/board?tab=realtime', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await r.text();
  const $ = load(html);
  const list = [];
  $('.category-wrap_iQLoo').each((i, el) => {
    const title = $(el).find('.c-single-text-ellipsis').text().trim();
    const desc = $(el).find('.hot-desc_1m_jR').text().trim();
    const url = $(el).find('a.img-wrapper_29V7w, a.item-wrap_1cu6e').attr('href') || 'https://top.baidu.com';
    if (title) list.push({ rank: i + 1, title, desc, url });
  });
  console.log('Parsed Baidu count:', list.length);
  console.log('Top 5 Baidu items:\n', JSON.stringify(list.slice(0, 5), null, 2));
}

testBaidu().catch(console.error);

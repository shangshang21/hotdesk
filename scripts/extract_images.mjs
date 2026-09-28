import fs from 'fs';
import * as cheerio from 'cheerio';

const content = fs.readFileSync('C:/Users/16118/.gemini/antigravity/brain/68b99b31-ca1b-4fbd-ab7e-05fc40de4541/.system_generated/steps/230/content.md', 'utf8');
const $ = cheerio.load(content);
const imgs = [];
$('img').each((_, el) => {
  const src = $(el).attr('src');
  if (src && !src.includes('qrcode') && !src.includes('ewm') && !src.includes('logo')) {
    imgs.push(src);
  }
});
console.log('Real news images count:', imgs.length);
console.log('Images:', imgs);

const text = $('body').text().replace(/\s+/g, ' ').trim();
console.log('Text snippet:', text.slice(0, 300));

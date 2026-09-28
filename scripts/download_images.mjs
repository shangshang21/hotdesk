import fs from 'fs';
import path from 'path';

const targetDir = 'D:\\营销号图片';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const images = [
  {
    name: '01_亚运男单决赛_王楚钦vs林诗栋_对决封面.jpg',
    url: 'https://img1.baidu.com/it/u=4208995601,2188993885&fm=253&fmt=auto&app=120&f=JPEG?w=766&h=500'
  },
  {
    name: '02_林诗栋反手暴力变线攻球.jpg',
    url: 'https://img0.baidu.com/it/u=1695035800,1392952397&fm=253&fmt=auto&app=120&f=JPEG?w=1291&h=800'
  },
  {
    name: '03_王楚钦局点失误低头擦汗.jpg',
    url: 'https://img0.baidu.com/it/u=1626110746,54975242&fm=253&fmt=auto&app=120&f=JPEG?w=828&h=500'
  },
  {
    name: '04_林诗栋4比0王楚钦夺冠加冕三冠王.jpg',
    url: 'https://img0.baidu.com/it/u=36143562,3154155048&fm=253&fmt=auto&app=120&f=JPEG?w=889&h=500'
  }
];

async function downloadAll() {
  for (const item of images) {
    const filePath = path.join(targetDir, item.name);
    console.log(`Downloading: ${item.name}...`);
    const res = await fetch(item.url);
    if (!res.ok) {
      console.error(`Failed to download ${item.name}: ${res.status}`);
      continue;
    }
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    const stats = fs.statSync(filePath);
    console.log(`Saved: ${item.name} (${stats.size} bytes)`);
  }
}

downloadAll().catch(console.error);

/** Renders every frame of the timeline to build/frames/NNNNNN.jpg */
import fs from 'fs';
import { chromium } from 'playwright-core';
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const tl = JSON.parse(fs.readFileSync(new URL('./build/timeline.json', import.meta.url)));
const dir = new URL('./build/frames/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
const fps = tl.fps;
const total = Math.ceil(tl.duration * fps);
const b = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(new URL('./player/index.html', import.meta.url).href, { waitUntil: 'networkidle' });
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await p.evaluate(t => window.render(t), i / fps);
  await p.screenshot({ path: new URL(`${String(i).padStart(6, '0')}.jpg`, dir).pathname, type: 'jpeg', quality: 86 });
  if (i % 600 === 0) console.log(`frame ${i}/${total} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log(`done ${total} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await b.close();

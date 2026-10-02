import { chromium } from 'playwright-core';
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const b = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto(new URL('./player/index.html', import.meta.url).href, { waitUntil: 'networkidle' });
const times = process.argv.slice(2).map(Number);
for (const t of times) { await p.evaluate(t => window.render(t), t); await p.screenshot({ path: `build/preview-${t}.jpg`, quality: 80, type: 'jpeg' }); }
console.log('errors:', errs);
await b.close();

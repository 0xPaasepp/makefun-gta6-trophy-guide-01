// Take the 4 screenshots for Leonida Ledger. Run: node scripts/shots.mjs
// Serves the repo with `node serve.ts` on port 8080 and renders real UI states.
import { chromium } from '/home/hatch/workspace/makefun/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const BASE = 'http://localhost:8080/app/index.html';

function startServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['serve.ts'], { cwd: repo, stdio: 'ignore' });
    const t0 = Date.now();
    const tick = async () => {
      try {
        const r = await fetch(BASE);
        if (r.ok) return resolve(proc);
      } catch { /* not up yet */ }
      if (Date.now() - t0 > 15000) return reject(new Error('server did not start'));
      setTimeout(tick, 300);
    };
    tick();
  });
}

const server = await startServer();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.trow', { timeout: 10000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.trow');

  // 1. Cover: checklist + detail open (Cunning Stunts, counter + sources) + audit + filters.
  await page.click('.trow[data-id="15"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(repo, 'screenshots', '1-checklist.jpg'), type: 'jpeg', quality: 72 });

  // 2. Guide detail: Positive Mental Attitude — counter + missable box + dated sources.
  await page.click('.trow[data-id="28"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(repo, 'screenshots', '2-guide.jpg'), type: 'jpeg', quality: 72 });

  // 3. Roadmap tab (with Missable Watch summary at the top of the view).
  await page.click('[data-tab="roadmap"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(repo, 'screenshots', '3-roadmap.jpg'), type: 'jpeg', quality: 72 });

  // 4. Spoiler mode on, back on the checklist; export/import visible in the header.
  await page.click('[data-tab="checklist"]');
  await page.click('#spoiler-toggle');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(repo, 'screenshots', '4-spoiler.jpg'), type: 'jpeg', quality: 72 });

  const { statSync } = await import('node:fs');
  for (const f of ['1-checklist.jpg', '2-guide.jpg', '3-roadmap.jpg', '4-spoiler.jpg']) {
    const s = statSync(join(repo, 'screenshots', f)).size;
    console.log(f + ' ' + s + ' bytes' + (s > 262144 ? ' OVER 256 KiB!' : ''));
  }
  console.log('screenshots done');
} finally {
  await browser.close();
  server.kill();
}

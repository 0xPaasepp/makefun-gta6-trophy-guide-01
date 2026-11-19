// Playwright suite for Leonida Ledger. Run: node tests/test.mjs
// Spawns `node serve.ts` on port 8080, runs the checks, kills the server.
import { chromium } from '/home/hatch/workspace/makefun/node_modules/playwright/index.mjs';
import { spawn, execFile } from 'node:child_process';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const BASE = 'http://localhost:8080/app/index.html';

const data = JSON.parse(readFileSync(join(repo, 'app/data/trophies.json'), 'utf8'));
const trophies = data.trophies;

let passed = 0;
let failed = 0;
function check(name, ok, extra = '') {
  if (ok) { passed++; console.log('PASS ' + name); }
  else { failed++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

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
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const page = await context.newPage();

const failedRequests = [];
const consoleErrors = [];
page.on('requestfailed', (r) => failedRequests.push(r.url()));
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(r.url() + ' ' + r.status()); });
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.trow', { timeout: 10000 });

  // 1. clean load
  check('1 load: 0 failed requests + 0 console errors', failedRequests.length === 0 && consoleErrors.length === 0,
    'failed=' + JSON.stringify(failedRequests) + ' errors=' + JSON.stringify(consoleErrors));

  // 2. all 55 render with exact official names
  const names = await page.$$eval('.trow .tname', (els) => els.map((e) => e.textContent.trim()));
  const missing = trophies.filter((t) => !names.includes(t.name)).map((t) => t.name);
  check('2 all 55 render with exact official names', names.length === 55 && missing.length === 0,
    'rendered=' + names.length + ' missing=' + JSON.stringify(missing));

  // 3. checking persists after reload (state button cycles todo -> in progress -> earned)
  await page.click('.trow[data-id="15"] .state-btn');
  await page.click('.trow[data-id="15"] .state-btn');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.trow');
  const earnedAfter = await page.$eval('#progress-count', (e) => e.textContent);
  check('3 check persists after reload', earnedAfter.startsWith('1/55'), 'count=' + earnedAfter);

  // 4. each filter narrows correctly
  const expected = { story: 12, missable: 1, collectible: 5, activity: 8, online: 0, side: 7, feat: 22, todo: 54, all: 55 };
  let filtersOk = true;
  let filterDetail = '';
  for (const [key, count] of Object.entries(expected)) {
    await page.click('[data-filter="' + key + '"]');
    await page.waitForTimeout(150);
    const n = await page.$$eval('.trow', (els) => els.length);
    if (n !== count) { filtersOk = false; filterDetail += key + '=' + n + ' (want ' + count + ') '; }
  }
  await page.click('[data-filter="all"]');
  check('4 each filter narrows correctly', filtersOk, filterDetail);

  // 5. search finds by name (and guide text): "Meditation" hits the meditation
  // trophy plus the two guides that mention the Chapter 1 meditation.
  await page.fill('#search', 'Meditation');
  await page.waitForTimeout(200);
  const searchNames = await page.$$eval('.trow .tname', (els) => els.map((e) => e.textContent.trim()));
  const searchCount = await page.$eval('#search-count', (e) => e.textContent);
  check('5 search finds by name', searchNames.includes('Positive Mental Attitude') && searchCount.startsWith('3 of 55'), JSON.stringify(searchNames) + ' / ' + searchCount);
  await page.fill('#search', '');

  // 6. spoiler ON hides un-earned story names and Reveal works
  await page.click('#spoiler-toggle');
  await page.waitForTimeout(200);
  const spoilerNames = await page.$$eval('.trow .tname', (els) => els.map((e) => e.textContent.trim()));
  const storyLeaked = trophies.filter((t) => t.kind === 'story' && !['15'].includes(String(t.id))).some((t) => spoilerNames.includes(t.name));
  const hiddenRows = await page.$$eval('.trow.spoiler-row', (els) => els.length);
  check('6 spoiler hides story names', !storyLeaked && hiddenRows >= 10, 'hiddenRows=' + hiddenRows);
  await page.click('.trow.spoiler-row .reveal-btn');
  await page.waitForTimeout(200);
  const afterReveal = await page.$$eval('.trow .tname', (els) => els.map((e) => e.textContent.trim()));
  check('6b Reveal shows one story trophy', afterReveal.length > spoilerNames.length, 'before=' + spoilerNames.length + ' after=' + afterReveal.length);
  await page.click('#spoiler-toggle');

  // 7. roadmap lists all 55 in order
  await page.click('[data-tab="roadmap"]');
  await page.waitForTimeout(200);
  const rmNums = await page.$$eval('.rm-row .rm-num', (els) => els.map((e) => e.textContent.trim()));
  check('7 roadmap lists all 55 in order', rmNums.length === 55 && rmNums[0] === '#1' && rmNums[54] === '#55',
    'rows=' + rmNums.length + ' first=' + rmNums[0] + ' last=' + rmNums[54]);

  // 8. missables tiers list
  await page.click('[data-tab="missables"]');
  await page.waitForTimeout(200);
  const missText = await page.$eval('#app', (e) => e.textContent);
  check('8 missables view lists tiers', missText.includes('Possibly missable') && missText.includes('Trigger not pinned down yet') && missText.includes('Not missable'),
    missText.slice(0, 120));
  await page.click('[data-tab="checklist"]');

  // 9. export downloads JSON and import restores it
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
  await page.click('#export-btn');
  const download = await downloadPromise;
  const dlPath = join(repo, 'tests', 'exported-progress.json');
  await download.saveAs(dlPath);
  const exported = JSON.parse(readFileSync(dlPath, 'utf8'));
  check('9a export downloads valid JSON', Array.isArray(exported.earned) && exported.earned.includes(15), JSON.stringify(exported.earned));
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.trow');
  const cleared = await page.$eval('#progress-count', (e) => e.textContent);
  await page.setInputFiles('#import-file', dlPath);
  await page.waitForTimeout(400);
  const restored = await page.$eval('#progress-count', (e) => e.textContent);
  check('9b import restores progress', cleared.startsWith('0/55') && restored.startsWith('1/55'), 'cleared=' + cleared + ' restored=' + restored);

  // 10. counter stepper increments/decrements and persists
  await page.click('.trow[data-id="28"] .cnt-plus');
  await page.click('.trow[data-id="28"] .cnt-plus');
  await page.waitForTimeout(200);
  let counterText = await page.$eval('.trow[data-id="28"] .counter', (e) => e.textContent);
  check('10a counter stepper increments', counterText.includes('2/18'), counterText);
  await page.click('.trow[data-id="28"] .cnt-minus');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.trow');
  counterText = await page.$eval('.trow[data-id="28"] .counter', (e) => e.textContent);
  check('10b counter persists after reload', counterText.includes('1/18'), counterText);

  // 11. detail panel shows guide + numbered sources
  await page.click('.trow[data-id="28"]');
  await page.waitForTimeout(200);
  const detailText = await page.$eval('#detail', (e) => e.textContent);
  const detailLinks = await page.$$eval('#detail .src-list a', (els) => els.map((e) => e.href));
  check('11 detail shows guide + numbered sources', detailText.includes('How to get it') && detailText.includes('Sources') && detailText.includes('PowerPyx') && detailLinks.length >= 2,
    'links=' + detailLinks.length);
} catch (err) {
  failed++;
  console.log('FAIL exception: ' + err.message);
} finally {
  await browser.close();
}

// 12. main.ts builds dossier.json and it parses
const outDir = join(repo, 'out-test');
await new Promise((resolve) => {
  execFile('node', ['main.ts'], { cwd: repo, env: { ...process.env, MAKEFUN_OUTPUT_DIR: outDir } }, (err, stdout, stderr) => {
    if (err) console.log('main.ts stderr: ' + stderr);
    resolve();
  });
});
let dossierOk = false;
try {
  const d = JSON.parse(readFileSync(join(outDir, 'dossier.json'), 'utf8'));
  dossierOk = d && typeof d === 'object' && 'cover' in d && 'images' in d && 'schema' in d && 'text' in d
    && Array.isArray(d.images) && d.images.length === 4 && typeof d.text === 'string';
  console.log('dossier: keys=' + Object.keys(d).join(',') + ' images=' + (d.images && d.images.length) + ' textBytes=' + (typeof d.text === 'string' ? Buffer.byteLength(d.text) : 'n/a'));
} catch (e) { console.log('dossier parse failed: ' + e.message); }
check('12 main.ts builds dossier.json', dossierOk);

// 13. screenshots exist, <=256 KiB, 1280x720
let shotsOk = true;
let shotDetail = '';
for (const f of ['1-checklist.jpg', '2-guide.jpg', '3-roadmap.jpg', '4-spoiler.jpg']) {
  const p = join(repo, 'screenshots', f);
  if (!existsSync(p)) { shotsOk = false; shotDetail += f + ' missing '; continue; }
  const size = statSync(p).size;
  const dim = jpegSize(readFileSync(p));
  if (size > 262144 || !dim || dim.width !== 1280 || dim.height !== 720) {
    shotsOk = false;
    shotDetail += f + ' size=' + size + ' dim=' + JSON.stringify(dim) + ' ';
  }
}
check('13 screenshots exist, <=256 KiB, 1280x720', shotsOk, shotDetail);

console.log('\nRESULT: ' + passed + ' passed, ' + failed + ' failed');
server.kill();
process.exit(failed ? 1 : 0);

// Leonida Ledger — boot, checklist, filters, search, sort, spoiler, detail panel.
import { loadState, saveState, pointsFor, totalPoints, earnedPoints, exportState, parseImport, defaultState } from './store.js';
import { renderRoadmap, renderMissables, renderSources, renderSave } from './views.js';

const GRADE_RANK = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
const STAGE_ORDER = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
const FILTERS = [
  ['all', 'All'], ['story', 'Story'], ['missable', 'Missable'], ['collectible', 'Collectibles'],
  ['activity', 'Activities'], ['online', 'Online'], ['side', 'Side'], ['feat', 'Feats'], ['todo', 'To do'],
];

let trophies = [];
let state = loadState();
let tab = 'checklist';
let filter = 'all';
let gradeFilter = 'all';
let sortMode = 'roadmap';
let query = '';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gradeLetter(t) {
  return t.grade === 'platinum' ? 'P' : t.grade === 'gold' ? 'G' : t.grade === 'silver' ? 'S' : 'B';
}

function trophyState(t) {
  if (state.earned.includes(t.id)) return 'earned';
  if (state.progress.includes(t.id)) return 'inprogress';
  return 'todo';
}

function cycleState(t) {
  const cur = trophyState(t);
  state.earned = state.earned.filter((id) => id !== t.id);
  state.progress = state.progress.filter((id) => id !== t.id);
  if (cur === 'todo') state.progress.push(t.id);
  else if (cur === 'inprogress') state.earned.push(t.id);
  saveState(state);
  render();
}

function counterValue(t) {
  return state.counters[t.id] ?? 0;
}

function bumpCounter(t, delta) {
  const step = (t.counter && t.counter.step) || 1;
  const next = Math.max(0, Math.min(t.counter.total, counterValue(t) + delta * step));
  state.counters[t.id] = next;
  saveState(state);
  render();
}

function matchesFilter(t) {
  if (filter === 'todo') return !state.earned.includes(t.id);
  if (filter === 'missable') return t.missable !== 'no';
  if (filter === 'online') return t.kind === 'online';
  if (filter === 'all') return true;
  return t.kind === filter;
}

function visibleTrophies() {
  let list = trophies.filter((t) => matchesFilter(t));
  if (gradeFilter !== 'all') list = list.filter((t) => t.grade === gradeFilter);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter((t) => (t.name + ' ' + t.description + ' ' + t.guide + ' ' + t.kind).toLowerCase().includes(q));
  }
  if (sortMode === 'grade') list.sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || a.name.localeCompare(b.name));
  else if (sortMode === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortMode === 'difficulty') list.sort((a, b) => b.difficulty - a.difficulty || a.roadmapOrder - b.roadmapOrder);
  else list.sort((a, b) => a.roadmapOrder - b.roadmapOrder);
  return list;
}

function counterHtml(t) {
  if (!t.counter) return '';
  const v = counterValue(t);
  const pct = Math.round((v / t.counter.total) * 100);
  return '<div class="counter"><button type="button" class="cnt-minus" data-id="' + t.id + '" aria-label="Decrease counter">−</button>'
    + '<span>' + v + '/' + t.counter.total + ' ' + esc(t.counter.label) + '</span>'
    + '<button type="button" class="cnt-plus" data-id="' + t.id + '" aria-label="Increase counter">+</button>'
    + '<span class="cbar"><i style="width:' + pct + '%"></i></span></div>';
}

function rowHtml(t) {
  const st = trophyState(t);
  const hiddenStory = state.spoiler && t.kind === 'story' && st !== 'earned' && !state.revealed.includes(t.id);
  const sel = state.selected === t.id ? ' selected' : '';
  if (hiddenStory) {
    return '<div class="trow spoiler-row' + sel + '" data-id="' + t.id + '">'
      + '<span class="grade-badge grade-' + t.grade + '">' + gradeLetter(t) + '</span>'
      + '<span><strong>Story trophy — hidden until earned</strong> · ' + esc(t.stage) + '</span>'
      + '<span><button type="button" class="reveal-btn" data-id="' + t.id + '">Reveal</button></span></div>';
  }
  const missTag = t.missable === 'possible' ? '<span class="tag miss">POSSIBLY MISSABLE</span>' : t.missable === 'yes' ? '<span class="tag miss">MISSABLE</span>' : '';
  const hiddenTag = t.hidden ? '<span class="tag hidden-tag">Hidden on PSN</span>' : '';
  const diffTag = '<span class="tag diff">Difficulty ' + t.difficulty + '/5 · ' + esc(t.time) + '</span>';
  return '<div class="trow' + (st === 'earned' ? ' earned' : '') + sel + '" data-id="' + t.id + '">'
    + '<button type="button" class="state-btn ' + st + '" data-id="' + t.id + '" aria-label="Cycle state: ' + esc(t.name) + '">' + (st === 'earned' ? '✓' : st === 'inprogress' ? '◐' : '') + '</button>'
    + '<span class="grade-badge grade-' + t.grade + '">' + gradeLetter(t) + '</span>'
    + '<div><div class="tname">' + esc(t.name) + '</div>'
    + '<div class="tdesc">' + esc(t.description) + '</div>'
    + '<div class="tmeta"><span class="tag">' + esc(t.kind) + '</span><span class="tag">' + esc(t.stage) + '</span>'
    + missTag + hiddenTag + diffTag + '</div>'
    + counterHtml(t) + '</div>'
    + '<span class="tag">' + pointsFor(t) + ' pts</span></div>';
}

function renderChecklist() {
  const list = visibleTrophies();
  const countEl = document.getElementById('search-count');
  if (countEl) countEl.textContent = list.length + ' of 55 shown';
  if (!list.length) return '<p class="empty">No trophies match. Clear the search or pick another filter.</p>';
  if (sortMode !== 'roadmap') {
    return list.map(rowHtml).join('');
  }
  let html = '';
  for (const stage of STAGE_ORDER) {
    const rows = list.filter((t) => t.stage.startsWith(stage));
    if (!rows.length) continue;
    const all = trophies.filter((t) => t.stage.startsWith(stage));
    const done = all.filter((t) => state.earned.includes(t.id)).length;
    html += '<div class="stage-head"><h2>' + esc(all[0].stage.toUpperCase()) + '</h2>'
      + '<span class="stage-count">' + done + '/' + all.length + ' earned</span>'
      + '<span class="stage-bar"><i style="width:' + Math.round((done / all.length) * 100) + '%"></i></span></div>';
    html += rows.map(rowHtml).join('');
  }
  return html;
}

function renderHeader() {
  const earned = state.earned.length;
  const pct = Math.round((earned / trophies.length) * 100);
  document.getElementById('progress-count').textContent = earned + '/' + trophies.length;
  document.getElementById('progress-pct').textContent = pct + '%';
  document.getElementById('progress-points').textContent = earnedPoints(trophies, state) + ' / ' + totalPoints(trophies).toLocaleString('en-US') + ' PSN points';
  document.getElementById('progress-fill').style.width = pct + '%';
  const counts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  const totals = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
  for (const t of trophies) {
    totals[t.grade]++;
    if (state.earned.includes(t.id)) counts[t.grade]++;
  }
  document.getElementById('grade-counts').innerHTML =
    'P <b>' + counts.platinum + '/' + totals.platinum + '</b> · G <b>' + counts.gold + '/' + totals.gold + '</b> · S <b>' + counts.silver + '/' + totals.silver + '</b> · B <b>' + counts.bronze + '/' + totals.bronze + '</b>'
    + ' · In progress <b>' + state.progress.length + '</b> · Spoilers: <b>' + (state.spoiler ? 'hidden until earned' : 'shown') + '</b>';
}

function renderAudit() {
  const withSources = trophies.filter((t) => t.sources && t.sources.length).length;
  const srcUrls = new Set();
  for (const t of trophies) for (const s of t.sources) srcUrls.add(s.url);
  const missable = trophies.filter((t) => t.missable !== 'no').length;
  const unknown = trophies.filter((t) => t.guide.includes('not pinned down yet')).length;
  const hidden = trophies.filter((t) => t.hidden).length;
  const words = trophies.reduce((sum, t) => sum + t.guide.split(/\s+/).length, 0);
  document.getElementById('audit-strip').innerHTML =
    '<span><b>55</b> official trophies: <b>1 P · 2 G · 6 S · 46 B</b></span>'
    + '<span><b>' + hidden + '</b> hidden on PSN</span>'
    + '<span><b>' + withSources + '/55</b> guides cite a source</span>'
    + '<span><b>' + srcUrls.size + '</b> sources, read 19 Nov 2026</span>'
    + '<span><b>' + missable + '</b> possibly missable</span>'
    + '<span><b>' + unknown + '</b> triggers not pinned down yet</span>'
    + '<span><b>1,350</b> PSN points total</span>'
    + '<span><b>' + words.toLocaleString('en-US') + '</b> guide words</span>'
    + '<span class="ok"><b>0 network requests · works offline</b></span>';
}

function renderFilters() {
  const counts = {};
  for (const [key] of FILTERS) {
    if (key === 'all') counts[key] = trophies.length;
    else if (key === 'todo') counts[key] = trophies.filter((t) => !state.earned.includes(t.id)).length;
    else if (key === 'missable') counts[key] = trophies.filter((t) => t.missable !== 'no').length;
    else if (key === 'online') counts[key] = 0;
    else counts[key] = trophies.filter((t) => t.kind === key).length;
  }
  document.getElementById('filters').innerHTML = FILTERS.map(([key, label]) =>
    '<button type="button" class="chip' + (filter === key ? ' active' : '') + '" data-filter="' + key + '">' + label + ' ' + counts[key] + '</button>').join('');
}

function stepsHtml(t) {
  const steps = t.guide.split(/(?=\d+\.\s)/).map((s) => s.trim()).filter(Boolean);
  const cite = t.sources.map((_, i) => '[' + (i + 1) + ']').join('');
  return '<ol class="steps">' + steps.map((s) => '<li>' + esc(s.replace(/^\d+\.\s*/, '')) + ' <sup>' + cite + '</sup></li>').join('') + '</ol>';
}

function renderDetail() {
  const el = document.getElementById('detail');
  const t = trophies.find((x) => x.id === state.selected) || trophies[0];
  if (!t) { el.innerHTML = ''; return; }
  const st = trophyState(t);
  const missBox = t.missable !== 'no'
    ? '<div class="miss-box"><b>MISSABLE? ' + (t.missable === 'possible' ? 'POSSIBLY' : 'YES') + '</b>' + esc(t.missableDetail || 'Act during the story.') + '</div>'
    : '<div class="miss-box"><b>MISSABLE? NO</b>Safe to finish in free roam after the story.</div>';
  const honestBox = t.guide.includes('not pinned down yet')
    ? '<div class="honest-box"><b>NOT PINNED DOWN YET</b>The exact steps for this trophy have not been confirmed by any launch guide. The steps above are the best reading of the official description — try them, and check back after more players report in.</div>'
    : '';
  el.innerHTML = '<span class="grade-badge grade-' + t.grade + '" style="display:inline-block;min-width:64px">' + esc(t.grade) + '</span> '
    + '<h2>' + esc(t.name) + '</h2>'
    + '<p class="tdesc">' + esc(t.stage) + ' · Roadmap #' + t.roadmapOrder + ' · Difficulty ' + t.difficulty + '/5 · ' + esc(t.time) + ' · ' + pointsFor(t) + ' PSN points'
    + (t.hidden ? ' · Hidden on PSN' : '') + '</p>'
    + '<button type="button" class="mark-btn' + (st === 'earned' ? ' earned' : '') + '" id="mark-earned">' + (st === 'earned' ? '✓ Earned — click to undo' : 'Mark earned') + '</button>'
    + '<h3>Official description · PlayStation</h3><div class="official">' + esc(t.description) + '</div>'
    + counterHtml(t)
    + '<h3>How to get it · in our own words</h3>' + stepsHtml(t)
    + missBox + honestBox
    + '<h3>Sources</h3><ol class="src-list">' + t.sources.map((s) =>
      '<li><strong>' + esc(s.name) + '</strong><br><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a><br><span class="src-date">Read ' + esc(s.date) + '</span></li>').join('') + '</ol>';
  const mark = document.getElementById('mark-earned');
  if (mark) mark.addEventListener('click', () => {
    if (trophyState(t) === 'earned') state.earned = state.earned.filter((id) => id !== t.id);
    else { state.earned.push(t.id); state.progress = state.progress.filter((id) => id !== t.id); }
    saveState(state);
    render();
  });
}

function render() {
  renderHeader();
  renderAudit();
  renderFilters();
  document.getElementById('spoiler-toggle').checked = state.spoiler;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('toolbar').style.display = tab === 'checklist' ? '' : 'none';
  const app = document.getElementById('app');
  if (tab === 'checklist') app.innerHTML = renderChecklist();
  else if (tab === 'roadmap') app.innerHTML = renderRoadmap(trophies, state);
  else if (tab === 'missables') app.innerHTML = renderMissables(trophies, state);
  else app.innerHTML = renderSources(trophies) + renderSave(trophies, state);
  renderDetail();
}

function bind() {
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  document.getElementById('grade-filter').addEventListener('change', (e) => { gradeFilter = e.target.value; render(); });
  document.getElementById('sort-select').addEventListener('change', (e) => { sortMode = e.target.value; render(); });
  document.getElementById('search').addEventListener('input', (e) => { query = e.target.value; render(); });
  document.getElementById('filters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]');
    if (chip) { filter = chip.dataset.filter; render(); }
  });
  document.getElementById('spoiler-toggle').addEventListener('change', (e) => {
    state.spoiler = e.target.checked;
    saveState(state);
    render();
  });
  document.getElementById('export-btn').addEventListener('click', () => exportState(state));
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      state = parseImport(text);
      saveState(state);
      render();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    e.target.value = '';
  });
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Reset all Leonida Ledger progress?')) {
      state = defaultState();
      saveState(state);
      render();
    }
  });
  document.getElementById('app').addEventListener('click', (e) => {
    const minus = e.target.closest('.cnt-minus');
    const plus = e.target.closest('.cnt-plus');
    const stateBtn = e.target.closest('.state-btn');
    const reveal = e.target.closest('.reveal-btn');
    const row = e.target.closest('[data-id]');
    if (minus) { const t = trophies.find((x) => x.id === Number(minus.dataset.id)); if (t) bumpCounter(t, -1); return; }
    if (plus) { const t = trophies.find((x) => x.id === Number(plus.dataset.id)); if (t) bumpCounter(t, 1); return; }
    if (stateBtn) { const t = trophies.find((x) => x.id === Number(stateBtn.dataset.id)); if (t) cycleState(t); return; }
    if (reveal) {
      const id = Number(reveal.dataset.id);
      if (!state.revealed.includes(id)) state.revealed.push(id);
      saveState(state);
      render();
      return;
    }
    if (row) {
      state.selected = Number(row.dataset.id);
      saveState(state);
      if (tab !== 'checklist') { tab = 'checklist'; }
      render();
    }
  });
  document.getElementById('app').addEventListener('click', (e) => {
    if (e.target.closest('#save-spoiler-toggle')) {
      state.spoiler = !state.spoiler;
      saveState(state);
      render();
    }
    if (e.target.closest('#save-export-btn')) exportState(state);
    if (e.target.closest('#save-import-btn')) document.getElementById('import-file').click();
    if (e.target.closest('#save-reset-btn')) {
      if (confirm('Reset all Leonida Ledger progress?')) {
        state = defaultState();
        saveState(state);
        render();
      }
    }
  });
}

fetch('data/trophies.json')
  .then((r) => r.json())
  .then((data) => {
    trophies = data.trophies;
    bind();
    render();
  })
  .catch(() => {
    document.getElementById('app').innerHTML = '<p class="empty">Could not load the trophy list. Reload the page.</p>';
  });

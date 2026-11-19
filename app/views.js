// Roadmap, Missables and Sources views for Leonida Ledger.
// Each render function returns HTML and takes (trophies, state, helpers).
import { pointsFor } from './store.js';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gradeLabel(t) {
  return t.grade === 'platinum' ? 'P' : t.grade === 'gold' ? 'G' : t.grade === 'silver' ? 'S' : 'B';
}

export function roadmapNote(t) {
  if (t.id === 1) return 'Do first: nothing — this pops last, when the other 54 are done.';
  if (t.id === 14) return 'Do last but one: the 100% checklist is the final big block, after the story.';
  if (t.id === 28) return 'Do FIRST in Chapter 1: the balcony meditation with Lucia vanishes after the chapter.';
  if (t.kind === 'story') return 'Story — unlocks by playing the main missions in order.';
  if (t.id === 35 || t.id === 42) return 'Do during the story: scan and explore as you travel, it already counts.';
  if (t.id === 52 || t.id === 53) return 'Do alongside the robberies: money in, money out.';
  if (t.kind === 'side') return 'Do before the finale if you can, but all side characters return in free roam.';
  if (t.kind === 'collectible') return 'Do in free roam, region by region, after the story.';
  if (t.kind === 'activity') return 'Do in free roam, one activity at a time.';
  return 'Do in free roam, during cleanup.';
}

export function renderRoadmap(trophies, state) {
  const ordered = [...trophies].sort((a, b) => a.roadmapOrder - b.roadmapOrder);
  const earned = new Set(state.earned);
  const stages = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'];
  let html = '<h2 class="view-title">Platinum roadmap — 55 trophies, 1 playthrough, about 200 hours</h2>'
    + '<p class="view-intro">Step 1: finish the story (60–80 h) and do the Chapter 1 meditation. Step 2: the 100% checklist (about 100 h). Step 3: Strangers &amp; Freaks and cleanup (about 10 h). No mission replay, so keep a manual save at the start of every chapter.</p>'
    + '<div class="miss-box"><b>MISSABLE WATCH — 1 possibly missable</b>Positive Mental Attitude: do the Chapter 1 balcony meditation with Lucia after Down to Earth, before the chapter ends. Everything else is safe in free roam. 6 trophies have triggers not pinned down yet — see the Missables tab.</div>';
  for (const stage of stages) {
    const rows = ordered.filter((t) => t.stage.startsWith(stage));
    if (!rows.length) continue;
    const done = rows.filter((t) => earned.has(t.id)).length;
    const label = rows[0].stage;
    html += '<div class="stage-head"><h2>' + esc(label.toUpperCase()) + '</h2>'
      + '<span class="stage-count">' + done + '/' + rows.length + ' earned</span>'
      + '<span class="stage-bar"><i style="width:' + Math.round((done / rows.length) * 100) + '%"></i></span></div>';
    for (const t of rows) {
      html += '<div class="rm-row" data-id="' + t.id + '"><span class="rm-num">#' + t.roadmapOrder + '</span>'
        + '<span class="grade-badge grade-' + t.grade + '" style="display:inline-block;min-width:52px">' + esc(t.grade) + '</span> '
        + '<strong>' + esc(t.name) + '</strong> '
        + '<span class="tag">' + pointsFor(t) + ' pts</span> '
        + '<span class="tag">' + esc(t.time) + '</span> '
        + (earned.has(t.id) ? '<span class="tag">earned</span>' : '')
        + '<div class="rm-note">' + esc(roadmapNote(t)) + ' ' + esc(t.description) + '</div></div>';
    }
  }
  return html;
}

export function renderMissables(trophies, state) {
  const possible = trophies.filter((t) => t.missable !== 'no');
  const unknown = trophies.filter((t) => t.guide.includes('not pinned down yet'));
  const safe = trophies.filter((t) => t.missable === 'no' && !t.guide.includes('not pinned down yet'));
  let html = '<h2 class="view-title">Missable Watch</h2>'
    + '<p class="view-intro">Only one trophy is possibly missable. Everything else can be finished in free roam after the story, because there is no mission replay but the whole map stays open.</p>';
  html += '<h3 class="tier tier-possible">Possibly missable — ' + possible.length + '</h3>';
  if (!possible.length) html += '<p class="view-intro">None.</p>';
  for (const t of possible) {
    html += '<div class="miss-row" data-id="' + t.id + '"><strong>' + esc(t.name) + '</strong> '
      + '<span class="grade-badge grade-' + t.grade + '" style="display:inline-block;min-width:52px">' + esc(t.grade) + '</span>'
      + '<div class="rm-note">' + esc(t.missableDetail || 'Act during the story.') + '</div></div>';
  }
  html += '<h3 class="tier tier-unknown">Trigger not pinned down yet — ' + unknown.length + '</h3>'
    + '<p class="view-intro">No launch guide has confirmed the exact step for these. The guide gives the best reading of the official description and says so honestly.</p>';
  for (const t of unknown) {
    html += '<div class="miss-row" data-id="' + t.id + '"><strong>' + esc(t.name) + '</strong> '
      + '<span class="grade-badge grade-' + t.grade + '" style="display:inline-block;min-width:52px">' + esc(t.grade) + '</span>'
      + '<div class="rm-note">' + esc(t.description) + '</div></div>';
  }
  html += '<h3 class="tier tier-safe">Not missable — ' + safe.length + ' trophies</h3>'
    + '<p class="view-intro">Story trophies unlock by playing the missions, and every side, activity, collectible and feat trophy stays available in free roam after the credits. Optional missions that disappear do not affect any trophy.</p>';
  return html;
}

export function renderSources(trophies) {
  const byUrl = new Map();
  for (const t of trophies) {
    for (const s of t.sources) {
      if (!byUrl.has(s.url)) byUrl.set(s.url, { name: s.name, url: s.url, date: s.date, trophies: [] });
      byUrl.get(s.url).trophies.push(t.name);
    }
  }
  const list = [...byUrl.values()];
  let html = '<h2 class="view-title">Sources index — ' + list.length + ' sources</h2>'
    + '<p class="view-intro">Every guide in this ledger cites its sources by name, link and read date. Guides are written in our own words; no guide text is copied from any source. Where the exact steps are not pinned down yet, the guide says so.</p>';
  for (const s of list) {
    html += '<div class="src-row"><strong>' + esc(s.name) + '</strong><br>'
      + '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a><br>'
      + '<span class="src-date">Read ' + esc(s.date) + ' · cited by ' + s.trophies.length + ' trophies: ' + esc(s.trophies.slice(0, 8).join(', ')) + (s.trophies.length > 8 ? ', and ' + (s.trophies.length - 8) + ' more' : '') + '</span></div>';
  }
  return html;
}

export function renderSave(trophies, state) {
  const earned = state.earned.length;
  return '<h2 class="view-title">Spoilers &amp; save</h2>'
    + '<p class="view-intro">Your progress lives in this browser only. Export a backup before you clear browser data.</p>'
    + '<div class="save-grid">'
    + '<div class="save-card"><h3>Spoilers</h3><p>' + (state.spoiler ? 'ON — un-earned story trophies are hidden until you earn them. Use Reveal on a row to peek at one.' : 'OFF — all story trophy names and descriptions are shown.') + '</p>'
    + '<button type="button" id="save-spoiler-toggle">' + (state.spoiler ? 'Turn spoilers off' : 'Turn spoilers on') + '</button></div>'
    + '<div class="save-card"><h3>Your save</h3><p>' + earned + ' of 55 trophies earned · ' + state.progress.length + ' in progress · ' + Object.keys(state.counters).length + ' counters tracked.</p>'
    + '<button type="button" id="save-export-btn">Export JSON</button>'
    + '<button type="button" id="save-import-btn">Import JSON</button>'
    + '<button type="button" id="save-reset-btn">Reset progress</button></div>'
    + '<div class="save-card"><h3>Storage</h3><p>Saved in localStorage under the key <code>leonida-ledger-v1</code>. Nothing leaves your browser. No account, no cookies, no network requests at runtime — the guide works fully offline.</p></div>'
    + '</div>';
}

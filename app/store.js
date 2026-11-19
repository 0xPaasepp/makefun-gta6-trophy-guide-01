// Progress state for Leonida Ledger. Saved in localStorage, exportable as JSON.
export const STORAGE_KEY = 'leonida-ledger-v1';
export const POINTS = { bronze: 15, silver: 30, gold: 90, platinum: 300 };

export function defaultState() {
  return { earned: [], progress: [], counters: {}, spoiler: false, revealed: [], selected: 28 };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    // Clamp saved counters to integers inside each trophy's range on load,
    // so a hand-edited or stale save can never show an impossible count.
    const counters = parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : base.counters;
    for (const key of Object.keys(counters)) {
      const v = Number(counters[key]);
      counters[key] = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    }
    return {
      earned: Array.isArray(parsed.earned) ? parsed.earned.filter(Number.isInteger) : base.earned,
      progress: Array.isArray(parsed.progress) ? parsed.progress.filter(Number.isInteger) : base.progress,
      counters: parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : base.counters,
      spoiler: Boolean(parsed.spoiler),
      revealed: Array.isArray(parsed.revealed) ? parsed.revealed.filter(Number.isInteger) : base.revealed,
      selected: Number.isInteger(parsed.selected) ? parsed.selected : base.selected,
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full or unavailable: progress stays in memory */ }
  const stamp = document.getElementById('saved-stamp');
  if (stamp) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    stamp.textContent = 'Saved ' + hh + ':' + mm;
  }
}

export function pointsFor(trophy) {
  return POINTS[trophy.grade] ?? 0;
}

export function totalPoints(trophies) {
  return trophies.reduce((sum, t) => sum + pointsFor(t), 0);
}

export function earnedPoints(trophies, state) {
  const earned = new Set(state.earned);
  return trophies.reduce((sum, t) => sum + (earned.has(t.id) ? pointsFor(t) : 0), 0);
}

export function exportState(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'leonida-ledger-progress.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseImport(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Not a Leonida Ledger save file.');
  const base = defaultState();
  const state = {
    earned: Array.isArray(parsed.earned) ? parsed.earned.filter(Number.isInteger) : base.earned,
    progress: Array.isArray(parsed.progress) ? parsed.progress.filter(Number.isInteger) : base.progress,
    counters: parsed.counters && typeof parsed.counters === 'object' ? parsed.counters : base.counters,
    spoiler: Boolean(parsed.spoiler),
    revealed: Array.isArray(parsed.revealed) ? parsed.revealed.filter(Number.isInteger) : base.revealed,
    selected: Number.isInteger(parsed.selected) ? parsed.selected : base.selected,
  };
  if (!state.earned.length && !state.progress.length && !Object.keys(state.counters).length && !state.spoiler) {
    throw new Error('Save file has no progress in it.');
  }
  return state;
}

// AIUCD 2026 Companion · agenda personale (localStorage)

const STORAGE_KEY = "aiucd2026-agenda";

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function write(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch (e) {
    console.warn("agenda · localStorage non disponibile", e);
  }
}

let _set = read();
const _listeners = new Set();

export function isSaved(paperId) {
  return _set.has(paperId);
}

export function toggle(paperId) {
  if (_set.has(paperId)) _set.delete(paperId);
  else _set.add(paperId);
  write(_set);
  _listeners.forEach(fn => fn(paperId, _set.has(paperId)));
  return _set.has(paperId);
}

export function getAll() {
  return [..._set];
}

export function addMany(ids) {
  let added = 0;
  for (const id of ids) {
    if (!_set.has(id)) {
      _set.add(id);
      added++;
    }
  }
  if (added > 0) {
    write(_set);
    _listeners.forEach(fn => fn(null, true));
  }
  return added;
}

export function removeMany(ids) {
  let removed = 0;
  for (const id of ids) {
    if (_set.has(id)) {
      _set.delete(id);
      removed++;
    }
  }
  if (removed > 0) {
    write(_set);
    _listeners.forEach(fn => fn(null, false));
  }
  return removed;
}

export function clear() {
  if (_set.size === 0) return 0;
  const n = _set.size;
  _set.clear();
  write(_set);
  _listeners.forEach(fn => fn(null, false));
  return n;
}

export function onChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

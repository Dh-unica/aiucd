// AIUCD 2026 Companion · agenda personale
//
// Persistenza a due livelli:
//   1. localStorage — immediato, offline (chiave STORAGE_KEY).
//   2. cookie impostato dal server WordPress via endpoint REST.
//
// Perché il secondo livello: WebKit/Safari (Intelligent Tracking Prevention)
// cancella tutto lo "script-writable storage" — localStorage incluso — dopo
// ~7 giorni di uso del browser senza rivisita del sito come prima parte. Sui
// telefoni dei partecipanti questo svuota l'agenda dopo pochi giorni. Il cookie
// server-set (Set-Cookie da WordPress) NON è soggetto a quel limite, quindi lo
// usiamo come copia di sicurezza per ripristinare l'agenda dopo un wipe di ITP.

const STORAGE_KEY = "aiucd2026-agenda";
const REST_URL =
  (typeof window !== "undefined" && window.AIUCD_REST_AGENDA) || "";

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
  syncToServer(set);
}

let _set = read();
const _listeners = new Set();

// ── Sincronizzazione col cookie server-set ────────────────────────────────
let _syncTimer = null;
function syncToServer(set) {
  if (!REST_URL || typeof fetch !== "function") return;
  // Debounce: una sola POST anche con più toggle ravvicinati.
  clearTimeout(_syncTimer);
  const ids = [...set];
  _syncTimer = setTimeout(() => {
    try {
      fetch(REST_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        keepalive: true,
      }).catch(() => {});
    } catch (e) {
      /* offline o endpoint assente: localStorage resta la fonte primaria */
    }
  }, 400);
}

// All'avvio recupera l'agenda dal cookie server-set e la fonde con localStorage.
// Serve a ripristinare le voci quando il browser ha azzerato localStorage (cap
// ITP) ma il cookie di prima parte è sopravvissuto. L'unione non perde mai voci.
function restoreFromServer() {
  if (!REST_URL || typeof fetch !== "function") return;
  fetch(REST_URL, { method: "GET", credentials: "same-origin" })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      const ids = data && Array.isArray(data.ids) ? data.ids : [];
      let changed = false;
      for (const id of ids) {
        if (!_set.has(id)) {
          _set.add(id);
          changed = true;
        }
      }
      if (changed) {
        write(_set); // riallinea localStorage e ri-sincronizza il cookie
        _listeners.forEach(fn => fn(null, true));
      } else if (_set.size > 0) {
        syncToServer(_set); // rinfresca la scadenza (TTL) del cookie a ogni visita
      }
    })
    .catch(() => {});
}

if (typeof window !== "undefined") {
  // Dopo il caricamento, per non rallentare il boot dell'app.
  if (document.readyState === "complete") restoreFromServer();
  else window.addEventListener("load", restoreFromServer, { once: true });
}

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

// AIUCD 2026 Companion · i18n
//
// Dizionario in JSON con chiavi piatte. Esporta `t(key, vars)` che cerca prima
// nel dizionario della lingua attiva e fallback a `it`. Sostituisce placeholder
// `{name}` con i valori passati in `vars`.
//
// Lingua attiva: window.AIUCD_LANG (injettato dallo shortcode WP via Polylang),
// altrimenti ?lang=xx dall'URL, altrimenti `it`.
//
// Standalone: window.AIUCD_LANG è undefined → carica it.json. WP embed: matcha
// la lingua della Page Polylang.
//
// Path JSON:
//   - WP embed: window.AIUCD_BASE_URL + "assets/i18n/{lang}.json"
//   - Standalone: "assets/i18n/{lang}.json" (relativo a companion/index.html)

let dict = {};
let fallbackDict = {};

function detectLang() {
  if (typeof window === "undefined") return "it";
  if (window.AIUCD_LANG) return window.AIUCD_LANG;
  const p = new URLSearchParams(window.location.search).get("lang");
  return p || "it";
}

let _lang = detectLang();
let _loaded = false;

function basePath() {
  if (typeof window !== "undefined" && window.AIUCD_BASE_URL) {
    return window.AIUCD_BASE_URL.replace(/\/$/, "") + "/assets/i18n/";
  }
  return "assets/i18n/";
}

export async function loadI18n() {
  if (_loaded) return;
  const base = basePath();
  // Carica sempre IT come fallback. Se la lingua attiva è diversa, caricala
  // e mergeala sopra (le chiavi in lang attiva vincono).
  try {
    fallbackDict = await fetch(base + "it.json", { cache: "no-store" })
      .then(r => r.ok ? r.json() : {})
      .catch(() => ({}));
  } catch {
    fallbackDict = {};
  }
  if (_lang === "it") {
    dict = fallbackDict;
  } else {
    try {
      const active = await fetch(base + _lang + ".json", { cache: "no-store" })
        .then(r => r.ok ? r.json() : {})
        .catch(() => ({}));
      dict = { ...fallbackDict, ...active };
    } catch {
      dict = fallbackDict;
    }
  }
  _loaded = true;
}

/**
 * Lookup di una chiave, con interpolazione opzionale di placeholder.
 *
 *   t("topbar.t_minus_days", { n: 22 })  →  "T-22 giorni"
 *
 * Se la chiave non esiste in nessun dizionario, ritorna la chiave stessa
 * (utile in dev per scoprire chiavi mancanti).
 */
export function t(key, vars) {
  let s = dict[key];
  if (s === undefined || s === "") s = fallbackDict[key];
  if (s === undefined) return key;
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : "{" + k + "}"));
  }
  return s;
}

export function getLang() { return _lang; }

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

/**
 * Legge un campo localizzato da un oggetto JSON proveniente dalla pipeline
 * (papers, posters, paths, poi, program block, ecc.).
 *
 * Convenzione: se il JSON ha `{title, title_en}` la funzione ritorna `title_en`
 * quando la lingua attiva è "en" e il valore è presente e non vuoto. Altrimenti
 * fallback al campo IT canonico `title`.
 *
 *   field({title: "Programma", title_en: "Programme"}, "title")  // EN → "Programme"
 *   field({title: "Programma"}, "title")                         // EN → "Programma" (fallback IT)
 *   field({title: "Programma", title_en: ""}, "title")           // EN → "Programma" (fallback su empty)
 *
 * In questo modo l'aggiornamento dell'Excel sorgente non rompe nulla anche se
 * la traduzione EN è assente per un sottoinsieme di record.
 */
export function field(obj, name) {
  if (!obj || obj[name] === undefined) return undefined;
  if (_lang === "en") {
    const en = obj[name + "_en"];
    if (en !== undefined && en !== null && (typeof en !== "string" || en.trim() !== "")) {
      return en;
    }
  }
  return obj[name];
}

/**
 * Formatta una data nei formati corti localizzati usati dal companion
 * (es. "Mer 3 giu" / "Wed 3 Jun"). Wrapper attorno a Intl.DateTimeFormat
 * con locale derivato dalla lingua attiva.
 *
 *   formatDay("2026-06-04", "short")    // it → "Gio 4 giu", en → "Thu 4 Jun"
 *   formatDay("2026-06-04", "long")     // it → "Giovedì 4 giugno 2026", en → "Thursday 4 June 2026"
 */
export function formatDay(isoDate, style = "short") {
  const locale = _lang === "en" ? "en-GB" : "it-IT";
  const d = typeof isoDate === "string" ? new Date(isoDate + "T12:00:00") : isoDate;
  if (style === "long") {
    return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  }
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(d);
}

/**
 * Traduzione runtime di un nome aula proveniente dai dati (es. "Aula Capitini"
 * → "Capitini Room", "Aula 5A" → "Room 5A"). Pattern fisso, non serve campo
 * `_en` nei JSON. Lasciato esposto perché applicato lazy nelle view.
 */
export function translateRoom(roomName) {
  if (!roomName || _lang !== "en") return roomName;
  // "Aula Magna Capitini" → "Capitini Main Room"
  if (/^Aula\s+Magna\s+/i.test(roomName)) {
    return roomName.replace(/^Aula\s+Magna\s+(\S+)/i, '$1 Main Room');
  }
  // "Aula 5A" → "Room 5A"; "Aula Capitini" → "Capitini Room"
  if (/^Aula\s+\d/i.test(roomName)) {
    return roomName.replace(/^Aula\s+/i, 'Room ');
  }
  if (/^Aula\s+/i.test(roomName)) {
    const rest = roomName.replace(/^Aula\s+/i, '');
    return `${rest} Room`;
  }
  return roomName;
}

// AIUCD 2026 Companion · data loader
// Carica i 4 JSON generati da scripts/build.py + manifest.

// `window.AIUCD_DATA_URL` è injettato dallo shortcode WP quando il companion
// è ospitato dentro una pagina WordPress. In standalone (server statico)
// resta il path relativo storico.
const DATA_BASE = (typeof window !== "undefined" && window.AIUCD_DATA_URL)
  ? window.AIUCD_DATA_URL.replace(/\/$/, "")
  : "../data/generated";

export async function loadAllData() {
  // STEP 1 — manifest-first. Lo prendiamo con cache-buster aggressivo così
  // che nuove build siano sempre rilevate. La sua `version` viene poi usata
  // come query-string sulle altre risorse: una nuova build cambia version →
  // browser/CDN scaricano dati freschi senza dover svuotare la cache.
  const manifest = await fetch(`${DATA_BASE}/manifest.json?_=${Date.now()}`, { cache: "no-store" })
    .then(r => r.json())
    .catch(() => ({ version: String(Date.now()) }));
  const v = encodeURIComponent(manifest.version || Date.now());

  // STEP 2 — fetch dei JSON dati con il version-tag del manifest.
  const [program, papers, posters, paths, affGeo, poiPayload] = await Promise.all([
    fetch(`${DATA_BASE}/program.json?v=${v}`).then(r => r.json()),
    fetch(`${DATA_BASE}/papers.json?v=${v}`).then(r => r.json()),
    fetch(`${DATA_BASE}/posters.json?v=${v}`).then(r => r.json()),
    fetch(`${DATA_BASE}/paths.json?v=${v}`).then(r => r.json()),
    fetch(`${DATA_BASE}/affiliations_geo.json?v=${v}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch(`${DATA_BASE}/poi.json?v=${v}`).then(r => r.ok ? r.json() : { venue: null, pois: [] }).catch(() => ({ venue: null, pois: [] })),
  ]);

  // Indice per ID veloce
  const papersById = new Map(papers.map(p => [p.id, p]));
  const venue = poiPayload.venue || null;
  const pois = poiPayload.pois || [];
  return { program, papers, papersById, posters, paths, manifest, affGeo, venue, pois };
}

export const AREAS = [
  { code: "co-construction", label: "DH e co-costruzione", color: "#000060" },
  { code: "archives",        label: "Archivi ed edizioni", color: "#2a6fa1" },
  { code: "memories",        label: "Memorie e patrimonio", color: "#1f8a70" },
  { code: "data",            label: "Dati e conoscenza",   color: "#c2a990" },
  { code: "textualities",    label: "Testualità digitali", color: "#d8613c" },
  { code: "other",           label: "Altri contributi",    color: "#6b4c8a" },
];

export const AREA_BY_CODE = Object.fromEntries(AREAS.map(a => [a.code, a]));

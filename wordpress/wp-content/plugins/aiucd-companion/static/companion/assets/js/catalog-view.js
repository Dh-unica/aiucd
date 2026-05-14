// AIUCD 2026 Companion · vista Catalogo
// Porting del mockup_catalogo.html: mappa Leaflet hero + overlay, search,
// pannello filtri (modes/areas/affiliation/gigliozzi), cards, view switch.

import { AREAS, AREA_BY_CODE, areaLabel } from "./data.js?v=f4-4";
import * as agenda from "./agenda.js";
import { t, getLang } from "./i18n.js?v=f4-4";

let _state = {
  data: null,
  root: null,
  onTalkClick: null,
  query: "",
  selectedAreas: new Set(AREAS.map(a => a.code)),
  selectedModes: new Set(["Oral communication", "Poster"]),
  selectedAffiliation: "",
  onlyGigliozzi: false,
  view: "grid",   // "grid" | "by-area" | "posters"
  map: null,
  markerCluster: null,
};

const AREA_COLOR = Object.fromEntries(AREAS.map(a => [a.code, a.color]));

export function renderCatalog(rootEl, data, onTalkClick) {
  _state.data = data;
  _state.root = rootEl;
  _state.onTalkClick = onTalkClick;
  rootEl.classList.add("cat-host");

  const isEn = getLang() === "en";
  rootEl.innerHTML = `
    <section class="map-hero">
      <div id="cat-map" role="region" aria-label="${t("catalog.map_aria")}"></div>

      <aside class="map-overlay bg-pibiones" id="cat-map-overlay" style="--pibiones-color: #fff; --pibiones-opacity: 0.10;">
        <div class="map-overlay-inner" id="cat-map-overlay-inner">
          <div class="eyebrow">${t("catalog.eyebrow")}</div>
          <h1>${isEn
            ? `Browse the <span id="cat-hero-total">${data.papers.length}</span> contributions of the 15th conference on <em>Digital Humanities and Digital Culture</em>`
            : `Esplora i <span id="cat-hero-total">${data.papers.length}</span> contributi del XV convegno di <em>Informatica Umanistica e Cultura Digitale</em>`}</h1>
          <p class="lead">
            ${t("catalog.hero_subtitle")}
          </p>
          <div class="stats">
            <div class="stat"><div class="num" id="cat-stat-papers">${data.papers.length}</div><div class="lbl">${t("catalog.kpi.contributi")}</div></div>
            <div class="stat"><div class="num" id="cat-stat-areas">6</div><div class="lbl">${t("catalog.kpi.aree")}</div></div>
            <div class="stat"><div class="num" id="cat-stat-affs">${countAffiliations(data)}</div><div class="lbl">${t("catalog.kpi.affiliazioni")}</div></div>
            <div class="stat"><div class="num" id="cat-stat-countries">${countCountries(data)}</div><div class="lbl">${t("catalog.kpi.paesi")}</div></div>
          </div>
        </div>
      </aside>

      <div class="search-bar map-search">
        <input type="search" id="cat-search-input"
          placeholder=""
          autocomplete="off" inputmode="search">
      </div>

      <aside class="filters" id="cat-filters">
        <div class="filters-body" id="cat-filters-body">
        <h2>${t("catalog.filters")}</h2>
        <div class="filter-group">
          <h3>${t("catalog.modality")}</h3>
          <div id="cat-filter-modes"></div>
        </div>
        <div class="filter-group">
          <h3>${t("catalog.thematic_area")}</h3>
          <div id="cat-filter-areas"></div>
        </div>
        <div class="filter-group">
          <h3>${isEn ? "Affiliation" : "Affiliazione"}</h3>
          <select id="cat-filter-aff" class="filter-select">
            <option value="">${isEn ? "All affiliations" : "Tutte le affiliazioni"}</option>
          </select>
        </div>
        <div class="filter-group">
          <h3>${isEn ? "Awards" : "Premi"}</h3>
          <label class="filter-option">
            <input type="checkbox" id="cat-filter-gigliozzi">
            <span>${isEn ? "★ Only Gigliozzi Award candidates" : "★ Solo candidati Premio Gigliozzi"}</span>
          </label>
        </div>
        <button class="filter-reset" id="cat-filter-reset">${isEn ? "Reset filters" : "Azzera filtri"}</button>
        </div>
      </aside>

      <div class="map-legend" id="cat-map-legend">
        <button class="map-legend-toggle" id="cat-map-legend-toggle" type="button" aria-expanded="false" aria-controls="cat-map-legend-body">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span class="ml-label">${isEn ? "Legend" : "Legenda"}</span>
          <svg class="ml-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div class="map-legend-body" id="cat-map-legend-body">
          <h4>${isEn ? "Thematic areas" : "Aree tematiche"}</h4>
          <ul id="cat-map-legend-list"></ul>
          <p class="ml-hint">
            <strong>${isEn ? "Colour" : "Colore"}</strong>: ${isEn ? "dominant thematic area among the institution's contributions" : "area tematica dominante dei contributi dell'istituzione"}.<br>
            <strong>${isEn ? "Number" : "Numero"}</strong>: ${isEn ? "total contributions of the institution" : "totale contributi dell'istituzione"}.<br>
            <strong>${isEn ? "Size" : "Dimensione"}</strong>: ${isEn ? "grows with the number of contributions" : "cresce con il numero di contributi"}.
          </p>
        </div>
      </div>

      <div class="map-bottom-controls">
        <div class="map-actions" id="cat-map-actions">
          <button data-bbox="italy" class="active">${isEn ? "Italy" : "Italia"}</button>
          <button data-bbox="europe">${isEn ? "Europe" : "Europa"}</button>
          <button data-bbox="all">${isEn ? "All" : "Tutte"}</button>
        </div>
        <button class="panels-control" id="cat-panels-toggle" type="button" aria-label="${isEn ? "Collapse both panels" : "Comprimi entrambi i pannelli"}">
          <svg class="pc-icon pc-icon-compress" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="4 14 10 14 10 20"></polyline>
            <polyline points="20 10 14 10 14 4"></polyline>
            <line x1="14" y1="10" x2="21" y2="3"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
          <svg class="pc-icon pc-icon-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
          <span class="pc-label">Comprimi</span>
        </button>
      </div>
    </section>

    <div class="cat-toolbar">
      <div class="results-count">
        <strong id="cat-results-count">—</strong>
        <span>contributi visualizzati</span>
        <span class="results-meta inst-meta">
          <strong id="cat-inst-count">—</strong> istituzioni
        </span>
      </div>
      <div class="view-switch" id="cat-view-switch" role="tablist">
        <button data-view="grid" class="active">Griglia</button>
        <button data-view="by-area">Per area</button>
        <button data-view="posters">Solo poster</button>
      </div>
    </div>

    <section id="cat-cards" class="cards"></section>
  `;

  buildModeFilters();
  buildAreaFilters();
  buildAffiliationFilter();
  wireSearch();
  wireGigliozzi();
  wireReset();
  wireViewSwitch();
  wireMapActions();
  wireMapLegend();
  wirePanelsControl();
  initMap();
  rerenderEverything();

  agenda.onChange(() => rerenderEverything());
}

// ===== filters builders =============================================

function buildModeFilters() {
  const wrap = _state.root.querySelector("#cat-filter-modes");
  const modes = [
    { key: "Oral communication", label: t("catalog.oral_communications") },
    { key: "Poster", label: t("catalog.posters") },
  ];
  for (const m of modes) {
    const lbl = document.createElement("label");
    lbl.className = "filter-option";
    lbl.innerHTML = `
      <input type="checkbox" data-mode="${m.key}" ${_state.selectedModes.has(m.key) ? "checked" : ""}>
      <span>${m.key === "Poster" ? "◆" : "●"}</span>
      <span>${m.label}</span>
      <span class="count" data-mode-count="${m.key}">0</span>
    `;
    lbl.querySelector("input").addEventListener("change", e => {
      if (e.target.checked) _state.selectedModes.add(m.key);
      else _state.selectedModes.delete(m.key);
      rerenderEverything();
    });
    wrap.append(lbl);
  }
}

function buildAreaFilters() {
  const wrap = _state.root.querySelector("#cat-filter-areas");
  for (const a of AREAS) {
    const lbl = document.createElement("label");
    lbl.className = "filter-option";
    lbl.innerHTML = `
      <input type="checkbox" data-area="${a.code}" ${_state.selectedAreas.has(a.code) ? "checked" : ""}>
      <span class="glyph glyph--${a.code} glyph--md" style="color:${a.color}" aria-hidden="true"></span>
      <span>${a.label}</span>
      <span class="count" data-area-count="${a.code}">0</span>
    `;
    lbl.querySelector("input").addEventListener("change", e => {
      if (e.target.checked) _state.selectedAreas.add(a.code);
      else _state.selectedAreas.delete(a.code);
      rerenderEverything();
    });
    wrap.append(lbl);
  }
}

function buildAffiliationFilter() {
  const select = _state.root.querySelector("#cat-filter-aff");
  // Collect unique affiliations from papers, sorted by frequency
  const affCount = new Map();
  for (const p of _state.data.papers) {
    for (const a of (p.authors || [])) {
      if (!a.aff) continue;
      affCount.set(a.aff, (affCount.get(a.aff) || 0) + 1);
    }
  }
  const sorted = [...affCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [name, n] of sorted) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} (${n})`;
    select.append(opt);
  }
  select.addEventListener("change", () => {
    _state.selectedAffiliation = select.value;
    rerenderEverything();
  });
}

function wireSearch() {
  const input = _state.root.querySelector("#cat-search-input");
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      _state.query = input.value.trim().toLowerCase();
      rerenderEverything();
    }, 150);
  });
  initSearchTypewriter(input);
}

/**
 * Placeholder typewriter — porting fedele dal mockup.
 * A rotazione, lettera per lettera, mostra le prime 4-7 parole di un
 * titolo casuale tra i contributi — invita l'utente a digitare.
 * Si ferma su focus o quando l'input ha contenuto.
 */
function initSearchTypewriter(input) {
  const papers = _state.data.papers;
  if (!input || !papers || papers.length === 0) return;

  const CURSOR  = "▌";
  const TYPE_MS  = 70;
  const ERASE_MS = 35;
  const HOLD_MS  = 1600;
  const PAUSE_MS = 350;
  const DEFAULT_PLACEHOLDER_IT = "Cerca titoli, autori, abstract, affiliazioni…";
const DEFAULT_PLACEHOLDER_EN = "Search titles, authors, abstracts, affiliations…";
const DEFAULT_PLACEHOLDER = (typeof window !== "undefined" && window.AIUCD_LANG === "en")
  ? DEFAULT_PLACEHOLDER_EN
  : DEFAULT_PLACEHOLDER_IT;

  // Snippets: per ogni titolo, le prime 4-7 parole. Deduplica e mescola.
  const snippets = Array.from(new Set(
    papers
      .map(p => {
        const words = (p.title || "").trim().split(/\s+/);
        const n = 4 + Math.floor(Math.random() * 4); // 4, 5, 6 o 7
        return words.slice(0, n).join(" ");
      })
      .filter(s => s.length > 0)
  ));
  if (snippets.length === 0) return;
  for (let i = snippets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [snippets[i], snippets[j]] = [snippets[j], snippets[i]];
  }

  let idx = 0;
  let timer = null;
  let paused = false;

  function setPlaceholder(text, withCursor) {
    input.placeholder = text + (withCursor ? CURSOR : "");
  }
  function typeStep(target, pos) {
    if (paused) return;
    if (pos <= target.length) {
      setPlaceholder(target.slice(0, pos), true);
      timer = setTimeout(() => typeStep(target, pos + 1), TYPE_MS);
    } else {
      timer = setTimeout(() => eraseStep(target, target.length), HOLD_MS);
    }
  }
  function eraseStep(target, pos) {
    if (paused) return;
    if (pos >= 0) {
      setPlaceholder(target.slice(0, pos), true);
      timer = setTimeout(() => eraseStep(target, pos - 1), ERASE_MS);
    } else {
      idx = (idx + 1) % snippets.length;
      timer = setTimeout(() => typeStep(snippets[idx], 0), PAUSE_MS);
    }
  }
  function start() {
    paused = false;
    typeStep(snippets[idx], 0);
  }
  function stop() {
    paused = true;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  input.addEventListener("focus", () => {
    stop();
    input.placeholder = DEFAULT_PLACEHOLDER;
  });
  input.addEventListener("blur", () => {
    if (!input.value) start();
  });

  // Rispetta prefers-reduced-motion: niente animazione
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    input.placeholder = DEFAULT_PLACEHOLDER;
    return;
  }
  start();
}

function wireGigliozzi() {
  const cb = _state.root.querySelector("#cat-filter-gigliozzi");
  cb.addEventListener("change", () => {
    _state.onlyGigliozzi = cb.checked;
    rerenderEverything();
  });
}

function wireReset() {
  _state.root.querySelector("#cat-filter-reset").addEventListener("click", () => {
    _state.query = "";
    _state.selectedAreas = new Set(AREAS.map(a => a.code));
    _state.selectedModes = new Set(["Oral communication", "Poster"]);
    _state.selectedAffiliation = "";
    _state.onlyGigliozzi = false;
    _state.root.querySelector("#cat-search-input").value = "";
    _state.root.querySelectorAll("[data-area]").forEach(cb => cb.checked = true);
    _state.root.querySelectorAll("[data-mode]").forEach(cb => cb.checked = true);
    _state.root.querySelector("#cat-filter-aff").value = "";
    _state.root.querySelector("#cat-filter-gigliozzi").checked = false;
    rerenderEverything();
  });
}

function wireViewSwitch() {
  const wrap = _state.root.querySelector("#cat-view-switch");
  wrap.querySelectorAll("button[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      _state.view = btn.dataset.view;
      // for "posters" view: force only Poster mode
      if (_state.view === "posters") {
        _state.selectedModes = new Set(["Poster"]);
        _state.root.querySelectorAll("[data-mode]").forEach(cb => {
          cb.checked = cb.dataset.mode === "Poster";
        });
      }
      wrap.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
      rerenderEverything();
    });
  });
}

function wireMapActions() {
  const wrap = _state.root.querySelector("#cat-map-actions");
  wrap.querySelectorAll("button[data-bbox]").forEach(btn => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
      fitMap(btn.dataset.bbox);
    });
  });
}

// Legenda colori marker mappa: collassabile, popolata dalle AREAS.
// Replica del componente "map-legend" del mockup mockups/mockup_catalogo.html.
function wireMapLegend() {
  const wrap = _state.root.querySelector("#cat-map-legend");
  const list = _state.root.querySelector("#cat-map-legend-list");
  const btn = _state.root.querySelector("#cat-map-legend-toggle");
  if (!wrap || !list || !btn) return;
  list.innerHTML = AREAS.map(a => `
    <li>
      <span class="dot" style="background:${a.color}"></span>
      <span class="lbl">${a.label}</span>
    </li>
  `).join("");
  btn.addEventListener("click", () => {
    const open = wrap.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

// Bottone unificato: comprime/espande contemporaneamente .map-overlay e .filters.
// Replica del componente "panels-control" del mockup mockups/mockup_catalogo.html.
function wirePanelsControl() {
  const btn = _state.root.querySelector("#cat-panels-toggle");
  const overlay = _state.root.querySelector("#cat-map-overlay");
  const filters = _state.root.querySelector("#cat-filters");
  const label = btn?.querySelector(".pc-label");
  if (!btn || !overlay || !filters) return;
  btn.addEventListener("click", () => {
    const isCollapsed = !overlay.classList.contains("collapsed");
    overlay.classList.toggle("collapsed", isCollapsed);
    filters.classList.toggle("collapsed", isCollapsed);
    btn.classList.toggle("all-collapsed", isCollapsed);
    btn.setAttribute("aria-label", isCollapsed ? "Espandi entrambi i pannelli" : "Comprimi entrambi i pannelli");
    if (label) label.textContent = isCollapsed ? "Espandi" : "Comprimi";
    if (_state.map) setTimeout(() => _state.map.invalidateSize(), 350);
  });
}

// ===== Map ==========================================================

function initMap() {
  if (!window.L) {
    console.warn("Leaflet non caricato; salto la mappa del catalogo");
    return;
  }
  const map = L.map("cat-map", {
    scrollWheelZoom: false,
    minZoom: 3,
    maxZoom: 13,
  });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  // Click-to-zoom enable wheel
  map.on("focus", () => map.scrollWheelZoom.enable());
  map.on("blur",  () => map.scrollWheelZoom.disable());
  map.on("click", () => map.scrollWheelZoom.enable());

  _state.map = map;
  _state.markerCluster = window.L.markerClusterGroup
    ? window.L.markerClusterGroup({
        iconCreateFunction: cl => {
          const n = cl.getChildCount();
          const cls = n < 5 ? "marker-cluster-small" : n < 15 ? "marker-cluster-medium" : "marker-cluster-large";
          return L.divIcon({
            html: `<div><span>${n}</span></div>`,
            className: `marker-cluster ${cls}`,
            iconSize: L.point(40, 40),
          });
        },
      })
    : L.layerGroup();
  map.addLayer(_state.markerCluster);

  // Initial bbox: Italy
  fitMap("italy");
}

function fitMap(bbox) {
  if (!_state.map) return;
  const bboxes = {
    italy:  [[36.5, 6.5], [47.1, 18.6]],
    europe: [[36, -10], [60, 30]],
    all:    [[20, -130], [60, 30]],
  };
  _state.currentBbox = bbox in bboxes ? bbox : "italy";
  _state.map.fitBounds(bboxes[_state.currentBbox], { padding: [20, 20], animate: true });
}

function rebuildMarkers(filteredPapers) {
  if (!_state.map || !_state.markerCluster) return;
  _state.markerCluster.clearLayers();

  const geo = _state.data.affGeo || {};
  // Aggrega per affiliazione (geo) i paper filtrati
  const byAff = new Map();
  for (const p of filteredPapers) {
    for (const a of (p.authors || [])) {
      if (!a.aff || !geo[a.aff]) continue;
      if (!byAff.has(a.aff)) byAff.set(a.aff, { papers: new Set(), areas: new Map() });
      const entry = byAff.get(a.aff);
      entry.papers.add(p.id);
      entry.areas.set(p.area_code, (entry.areas.get(p.area_code) || 0) + 1);
    }
  }

  let instCount = 0;
  for (const [aff, info] of byAff) {
    const pos = geo[aff];
    if (!pos) continue;
    instCount++;
    const count = info.papers.size;
    // Dominant area
    let domArea = "other", max = 0;
    for (const [area, n] of info.areas) {
      if (n > max) { max = n; domArea = area; }
    }
    const color = AREA_COLOR[domArea] || "#000060";
    const sizeClass = count >= 30 ? "size-4" : count >= 10 ? "size-3" : count >= 4 ? "size-2" : "size-1";
    const html = `<div class="marker-bubble ${sizeClass}" style="background:${color}">${count}</div>`;
    const icon = L.divIcon({ html, className: "institution-marker", iconSize: null });
    const marker = L.marker([pos.lat, pos.lng], { icon });
    marker.bindPopup(makePopup(aff, pos, [...info.papers]), { autoPan: true, maxWidth: 360 });
    _state.markerCluster.addLayer(marker);
  }

  const instCountEl = _state.root.querySelector("#cat-inst-count");
  if (instCountEl) instCountEl.textContent = instCount;
}

function makePopup(aff, pos, paperIds) {
  const papers = paperIds.map(id => _state.data.papersById.get(id)).filter(Boolean);
  const oral = papers.filter(p => p.mode === "Oral communication").length;
  const poster = papers.filter(p => p.mode === "Poster").length;

  const div = document.createElement("div");
  div.className = "pop";
  div.innerHTML = `
    <div class="pop-head">
      <h3>${escapeHtml(aff)}</h3>
      <div class="pop-city">${escapeHtml(pos.city || "")}</div>
    </div>
    <div class="pop-stats">
      <span><strong>${papers.length}</strong> contributi</span>
      <span><strong>${oral}</strong> orali</span>
      <span><strong>${poster}</strong> poster</span>
    </div>
    <div class="pop-papers">
      ${papers.slice(0, 30).map(p => `
        <div class="pop-paper" data-paper-id="${p.id}">
          <span class="pp-mode ${p.mode === "Poster" ? "poster" : "oral"}">${p.mode === "Poster" ? "Poster" : "Oral"}</span>
          <span class="pp-title">${escapeHtml(p.title)}</span>
        </div>
      `).join("")}
    </div>
  `;
  div.addEventListener("click", e => {
    const t = e.target.closest(".pop-paper");
    if (t) openTalk(parseInt(t.dataset.paperId, 10));
  });
  return div;
}

// ===== Filtering ====================================================

function filteredPapers() {
  return _state.data.papers.filter(p => {
    if (!_state.selectedAreas.has(p.area_code)) return false;
    if (!_state.selectedModes.has(p.mode)) return false;
    if (_state.onlyGigliozzi && !p.gigliozzi) return false;
    if (_state.selectedAffiliation) {
      const has = (p.authors || []).some(a => a.aff === _state.selectedAffiliation);
      if (!has) return false;
    }
    if (_state.query) {
      const hay = (
        p.title + " " + (p.abstract || "") + " " +
        (p.authors || []).map(a => a.name + " " + (a.aff || "")).join(" ")
      ).toLowerCase();
      if (!hay.includes(_state.query)) return false;
    }
    return true;
  });
}

// ===== Rendering ====================================================

function rerenderEverything() {
  const list = filteredPapers();
  rebuildMarkers(list);
  rerenderCards(list);
  updateCounts(list);
}

function updateCounts(list) {
  _state.root.querySelector("#cat-results-count").textContent = list.length;
  // mode counts (computed against all areas + query, but ignoring mode filter)
  const all = _state.data.papers;
  const filteredIgnoringMode = all.filter(p => {
    if (!_state.selectedAreas.has(p.area_code)) return false;
    if (_state.onlyGigliozzi && !p.gigliozzi) return false;
    if (_state.selectedAffiliation) {
      const has = (p.authors || []).some(a => a.aff === _state.selectedAffiliation);
      if (!has) return false;
    }
    if (_state.query) {
      const hay = (p.title + " " + (p.abstract || "") + " " + (p.authors || []).map(a => a.name + " " + (a.aff || "")).join(" ")).toLowerCase();
      if (!hay.includes(_state.query)) return false;
    }
    return true;
  });
  for (const k of ["Oral communication", "Poster"]) {
    const c = filteredIgnoringMode.filter(p => p.mode === k).length;
    const el = _state.root.querySelector(`[data-mode-count="${k}"]`);
    if (el) el.textContent = c;
  }
  // area counts (ignoring area filter)
  const filteredIgnoringArea = all.filter(p => {
    if (!_state.selectedModes.has(p.mode)) return false;
    if (_state.onlyGigliozzi && !p.gigliozzi) return false;
    if (_state.selectedAffiliation) {
      const has = (p.authors || []).some(a => a.aff === _state.selectedAffiliation);
      if (!has) return false;
    }
    if (_state.query) {
      const hay = (p.title + " " + (p.abstract || "") + " " + (p.authors || []).map(a => a.name + " " + (a.aff || "")).join(" ")).toLowerCase();
      if (!hay.includes(_state.query)) return false;
    }
    return true;
  });
  for (const a of AREAS) {
    const c = filteredIgnoringArea.filter(p => p.area_code === a.code).length;
    const el = _state.root.querySelector(`[data-area-count="${a.code}"]`);
    if (el) el.textContent = c;
  }
}

function rerenderCards(list) {
  const wrap = _state.root.querySelector("#cat-cards");
  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <strong>${t("catalog.empty_state")}.</strong>
        ${t("catalog.empty_hint")}
      </div>
    `;
    return;
  }

  if (_state.view === "by-area") {
    // Group by area_code
    const byArea = new Map();
    for (const p of list) {
      if (!byArea.has(p.area_code)) byArea.set(p.area_code, []);
      byArea.get(p.area_code).push(p);
    }
    let html = "";
    for (const a of AREAS) {
      const ps = byArea.get(a.code);
      if (!ps?.length) continue;
      html += `
        <div class="group-header">
          <h2><span class="chip-dot" style="background:${a.color}"></span>${a.label}</h2>
          <span class="group-count">${ps.length} contributi</span>
        </div>
        ${ps.map(cardHtml).join("")}
      `;
    }
    wrap.innerHTML = html;
  } else {
    wrap.innerHTML = list.map(cardHtml).join("");
  }
  wrap.querySelectorAll("article.card[data-paper-id]").forEach(card => {
    card.addEventListener("click", () => openTalk(parseInt(card.dataset.paperId, 10)));
  });
}

function cardHtml(p) {
  const area = AREA_BY_CODE[p.area_code] || AREA_BY_CODE.other;
  const color = area.color;
  const authors = (p.authors || []);
  const firstThree = authors.slice(0, 3);
  const moreCount = authors.length - firstThree.length;
  const authorsHtml = firstThree.map(a => `
    <strong>${escapeHtml(a.name)}</strong>${a.aff ? ` <span class="author-aff">(${escapeHtml(a.aff)})</span>` : ""}
  `).join("; ") + (moreCount > 0 ? ` <span class="author-more">+${moreCount} altri</span>` : "");
  const saved = agenda.isSaved(p.id);
  return `
    <article class="card" data-paper-id="${p.id}" style="--card-color:${color}">
      ${saved ? '<span class="card-saved-star icon icon--star-filled" title="In agenda" aria-label="In agenda"></span>' : ''}
      <div class="card-header">
        <span class="badge ${p.mode === "Poster" ? "badge-mode-poster" : "badge-mode-oral"}">${p.mode === "Poster" ? "◆ Poster" : "● Oral"}</span>
        <span class="badge badge-area"><span class="glyph glyph--${p.area_code || 'other'} glyph--sm" aria-hidden="true"></span>${escapeHtml(area.label)}</span>
        ${p.gigliozzi ? '<span class="badge badge-gigliozzi">★ Gigliozzi</span>' : ''}
      </div>
      <h3>${escapeHtml(p.title)}</h3>
      <div class="card-authors">${authorsHtml}</div>
      ${p.abstract ? `<div class="card-abstract">${escapeHtml(p.abstract)}</div>` : ''}
      <div class="card-footer">Vedi dettaglio</div>
    </article>
  `;
}

function openTalk(paperId) {
  const paper = _state.data.papersById.get(paperId);
  if (!paper) return;
  // Try to find slot in program
  const slot = findSlot(paperId);
  const day = slot && _state.data.program.days.find(d => d.date === slot.day);
  const block = day?.blocks.find(b => b.type === "session" && b.tracks.find(t => t.room === slot?.room));
  const track = block?.tracks.find(t => t.room === slot?.room);
  if (_state.onTalkClick) _state.onTalkClick(paper, slot, track, day);
}

function findSlot(paperId) {
  for (const day of _state.data.program.days) {
    for (const block of day.blocks) {
      if (block.type !== "session") continue;
      for (const track of block.tracks) {
        for (const talk of track.talks) {
          if (talk.paper_id === paperId) {
            return { day: day.date, start: talk.start, end: talk.end, room: track.room };
          }
        }
      }
    }
  }
  return null;
}

// Called externally when the catalogo tab becomes visible (so Leaflet
// can re-measure its container which was 0px while hidden, and re-fit
// to the current bbox — il fitBounds iniziale eseguito quando il container
// era 0×0 produceva uno zoom sballato e i pin fuori viewport).
export function onCatalogVisible() {
  if (!_state.map) return;
  setTimeout(() => {
    _state.map.invalidateSize();
    fitMap(_state.currentBbox || "italy");
  }, 50);
}

function countAffiliations(data) {
  const set = new Set();
  for (const p of data.papers) {
    for (const a of (p.authors || [])) {
      if (a.aff) set.add(a.aff);
    }
  }
  return set.size;
}

function countCountries(data) {
  // Paesi unici delle affiliazioni geocodate (heuristic dalla coordinata).
  // Più semplice: contiamo paesi distinti via geo lookup quando possibile.
  // Per ora mappiamo le città a paese.
  const cityToCountry = {
    Roma: "IT", Milano: "IT", Bologna: "IT", Firenze: "IT", Pisa: "IT",
    Padova: "IT", Venezia: "IT", Torino: "IT", Genova: "IT", Napoli: "IT",
    Bari: "IT", Lecce: "IT", Catania: "IT", Palermo: "IT", Trieste: "IT",
    Verona: "IT", Macerata: "IT", Salerno: "IT", Modena: "IT",
    "Reggio Emilia": "IT", Pavia: "IT", Parma: "IT", Perugia: "IT",
    Siena: "IT", "L'Aquila": "IT", Chieti: "IT", Pescara: "IT",
    Cosenza: "IT", "Reggio Calabria": "IT", Messina: "IT", Enna: "IT",
    Urbino: "IT", Foggia: "IT", Sassari: "IT", Cagliari: "IT",
    Brescia: "IT", Teramo: "IT", Trento: "IT",
    London: "UK", Oxford: "UK", Cambridge: "UK",
    Dublin: "IE", Paris: "FR", Lyon: "FR",
    Berlin: "DE", Mainz: "DE", Munich: "DE", Aachen: "DE",
    Marburg: "DE", Augsburg: "DE", Potsdam: "DE", "Saarbrücken": "DE",
    Bern: "CH", Zurich: "CH", Basel: "CH",
    Graz: "AT", Vienna: "AT",
    Athens: "GR", Madrid: "ES", Barcelona: "ES",
    Lisbon: "PT", "Iași": "RO", Praha: "CZ",
    Lund: "SE", Helsinki: "FI", Groningen: "NL",
    Stanford: "US", Tallinn: "EE",
  };
  const countries = new Set();
  const geo = data.affGeo || {};
  for (const aff in geo) {
    const entry = geo[aff];
    if (!entry || !entry.city) continue;
    const country = cityToCountry[entry.city];
    if (country) countries.add(country);
  }
  return countries.size;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

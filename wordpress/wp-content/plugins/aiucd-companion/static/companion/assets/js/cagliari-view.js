// AIUCD 2026 Companion · Sprint D — vista "Esplora Cagliari"
//
// Mostra i 33 POI della città su una mappa Leaflet + lista filtrabile per
// tipologia e per tempo disponibile (gap fra due relazioni).
// I dati arrivano da data/generated/poi.json (vedi scripts/enrich_poi.py).

// Risolve un path "assets/..." rispetto al companion. Quando ospitato in WP
// usa window.AIUCD_BASE_URL injettato dallo shortcode; altrimenti torna il
// path relativo invariato.
const ASSET_BASE = (typeof window !== "undefined" && window.AIUCD_BASE_URL)
  ? window.AIUCD_BASE_URL.replace(/\/$/, "") + "/"
  : "";
function resolveAsset(src) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  if (src.startsWith("assets/")) return ASSET_BASE + src;
  return src;
}

// Importato qui (non in cima al file per evitare collisione col commento di
// resolveAsset definito sopra). t() ritorna stringhe localizzate IT/EN.
import { t, field, getLang } from "./i18n.js?v=f4-2";

function typeLabel(code) {
  const map = {
    culturale:    "cagliari.type.cultural",
    belvedere:    "cagliari.type.belvedere",
    passeggiata:  "cagliari.type.walk",
    naturalistico: "cagliari.type.naturalistic",
    mezzi:        "cagliari.type.public_transport",
    altro:        "cagliari.type.other",
  };
  return map[code] ? t(map[code]) : code;
}

const TYPE_COLORS = {
  culturale:     "#000060",  // navy (DH heritage)
  belvedere:     "#d8613c",  // rust
  passeggiata:   "#2a6fa1",  // archives blue
  naturalistico: "#1f8a70",  // memories green
  mezzi:         "#6b4c8a",  // other purple
  altro:         "#8a8a8a",  // neutral
};

function timeOptions() {
  return [
    { value: 0,  label: t("cagliari.time.any") },
    { value: 30, label: getLang() === "en" ? "30 min" : "30 min" },
    { value: 45, label: getLang() === "en" ? "45 min" : "45 min" },
    { value: 60, label: getLang() === "en" ? "60 min" : "60 min" },
    { value: 90, label: getLang() === "en" ? "90 min" : "90 min" },
    { value: 120, label: getLang() === "en" ? "2 hours" : "2 ore" },
  ];
}

// Buffer: lasciamo ≥10 min sul posto, sennò non vale la pena partire.
const ON_SITE_MIN = 10;

const _state = {
  data: null,
  root: null,
  map: null,
  markersById: new Map(),
  markerCluster: null,
  selectedTypes: new Set(),    // empty = tutti
  timeLimit: 0,                 // 0 = nessun limite
  mode: "walking",              // "walking" | "driving"
  pois: [],
  filtered: [],
  modal: null,
};

export function renderCagliari(rootEl, data) {
  _state.data = data;
  _state.root = rootEl;
  _state.pois = (data.pois || []).slice().sort((a, b) =>
    (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity)
  );

  rootEl.classList.add("cagliari-host");
  rootEl.innerHTML = `
    <div class="section-head">
      <h2><span class="sub-mark"></span>${t("cagliari.heading")}</h2>
      <p class="section-sub">${data.pois?.length || 0} ${getLang() === "en" ? "places within walking distance from the conference venue. Filter by type or by time available between talks." : "luoghi a portata di passeggiata dalla sede del convegno. Filtra per tipologia o per il tempo che hai a disposizione fra una relazione e l'altra."}</p>
    </div>

    <div class="cag-controls">
      <div class="cag-types" role="group" aria-label="${t("cagliari.type_filter_aria")}">
        ${renderTypeChips()}
      </div>
      <div class="cag-time-filter">
        <label for="cag-time">${getLang() === "en" ? "Time available" : "Ho a disposizione"}</label>
        <select id="cag-time">
          ${timeOptions().map(o => `<option value="${o.value}">${o.label}</option>`).join("")}
        </select>
        <select id="cag-mode" aria-label="${getLang() === "en" ? "Travel mode" : "Modalità di spostamento"}">
          <option value="walking" selected>${t("cagliari.mode.walking")}</option>
          <option value="driving">${t("cagliari.mode.driving")}</option>
        </select>
      </div>
    </div>

    <div class="cag-layout">
      <div class="cag-map-wrap"><div id="cag-map" role="region" aria-label="${t("cagliari.map_aria")}"></div></div>
      <div class="cag-list" id="cag-list"></div>
    </div>
  `;

  initMap();
  wireFilters();
  applyFilters();

  // Pre-filtro dall'esterno (es. CTA Noa nel drawer). Imposta la finestra
  // di tempo e la modalità prima di applicare i filtri.
  if (!window.__cagliariFilterListener) {
    window.addEventListener("companion:cagliari-set-filter", e => {
      const { minutes, mode } = e.detail || {};
      if (typeof minutes === "number" && minutes >= 0) {
        _state.timeLimit = minutes;
        const sel = _state.root.querySelector("#cag-time");
        if (sel) sel.value = String(minutes);
      }
      if (mode === "walking" || mode === "driving") {
        _state.mode = mode;
        const sel = _state.root.querySelector("#cag-mode");
        if (sel) sel.value = mode;
      }
      applyFilters();
    });
    window.__cagliariFilterListener = true;
  }
}

// ---- TYPE CHIPS ---------------------------------------------------------

function countByType() {
  const counts = {};
  for (const p of _state.pois) {
    counts[p.type] = (counts[p.type] || 0) + 1;
  }
  return counts;
}

function renderTypeChips() {
  const counts = countByType();
  const total = _state.pois.length;
  const out = [
    `<button type="button" class="cag-type-chip" data-type="__all" aria-pressed="${_state.selectedTypes.size === 0}">${t("cagliari.type.all")} (${total})</button>`,
  ];
  const TYPE_CODES = ["culturale", "belvedere", "passeggiata", "naturalistico", "mezzi", "altro"];
  for (const code of TYPE_CODES) {
    const label = typeLabel(code);
    const n = counts[code] || 0;
    if (n === 0) continue;
    out.push(`
      <button type="button" class="cag-type-chip" data-type="${code}"
              aria-pressed="${_state.selectedTypes.has(code)}">
        <span class="cag-type-dot" style="background:${TYPE_COLORS[code] || "#888"}"></span>
        ${label} (${n})
      </button>
    `);
  }
  return out.join("");
}

function wireFilters() {
  _state.root.querySelectorAll(".cag-type-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.type;
      if (t === "__all") {
        _state.selectedTypes.clear();
      } else if (_state.selectedTypes.has(t)) {
        _state.selectedTypes.delete(t);
      } else {
        _state.selectedTypes.add(t);
      }
      // Re-render chips per aggiornare aria-pressed
      _state.root.querySelector(".cag-types").innerHTML = renderTypeChips();
      wireFilters();
      applyFilters();
    });
  });

  const timeEl = _state.root.querySelector("#cag-time");
  if (timeEl && !timeEl.dataset.wired) {
    timeEl.addEventListener("change", () => {
      _state.timeLimit = parseInt(timeEl.value, 10) || 0;
      applyFilters();
    });
    timeEl.dataset.wired = "1";
  }
  const modeEl = _state.root.querySelector("#cag-mode");
  if (modeEl && !modeEl.dataset.wired) {
    modeEl.addEventListener("change", () => {
      _state.mode = modeEl.value;
      applyFilters();
    });
    modeEl.dataset.wired = "1";
  }
}

// ---- APPLY FILTERS ------------------------------------------------------

function timeFor(poi) {
  return _state.mode === "driving" ? (poi.driving_min ?? Infinity) : (poi.walking_min ?? Infinity);
}

function applyFilters() {
  const sel = _state.selectedTypes;
  const limit = _state.timeLimit;
  _state.filtered = _state.pois.filter(p => {
    if (sel.size > 0 && !sel.has(p.type)) return false;
    if (limit > 0) {
      const t = timeFor(p);
      // andata+ritorno+10 min sul posto ≤ limit
      if (t * 2 + ON_SITE_MIN > limit) return false;
    }
    return true;
  });
  renderList();
  refreshMarkers();
}

// ---- LISTA --------------------------------------------------------------

function renderList() {
  const root = _state.root.querySelector("#cag-list");
  if (!_state.filtered.length) {
    root.innerHTML = `<div class="cag-list-empty">Nessun luogo soddisfa i filtri. Allarga la finestra di tempo o togli qualche tipologia.</div>`;
    return;
  }
  root.innerHTML = _state.filtered.map(cardHtml).join("");
  root.querySelectorAll(".cag-card[data-poi-id]").forEach(card => {
    card.addEventListener("click", () => openPoi(card.dataset.poiId));
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPoi(card.dataset.poiId);
      }
    });
  });
}

function cardHtml(p) {
  const thumbSrc = resolveAsset(p.thumb || p.image || p.image_url || "");
  const dist = p.distance_m ? formatDistance(p.distance_m) : "";
  const localName = field(p, "name") || p.name;
  const localType = typeLabel(p.type);
  const walkSuffix = getLang() === "en" ? "walking" : "a piedi";
  const driveSuffix = getLang() === "en" ? "by car" : "in auto";
  return `
    <article class="cag-card" tabindex="0" role="button" data-poi-id="${p.id}"
             aria-label="${escapeAttr(localName)}, ${escapeAttr(localType)}, ${p.walking_min ?? "?"} ${walkSuffix}">
      ${thumbSrc ? `<img class="cag-card-thumb" src="${escapeAttr(thumbSrc)}" alt="" loading="lazy">` : `<div class="cag-card-thumb" aria-hidden="true"></div>`}
      <div class="cag-card-body">
        <div class="cag-card-name">${escapeHtml(localName)}</div>
        <div class="cag-card-meta">
          <span class="chip" style="background:${TYPE_COLORS[p.type] || "#eee"}33; color:${TYPE_COLORS[p.type] || "#444"}">${escapeHtml(localType)}</span>
          ${dist ? `<span>· ${dist}</span>` : ""}
        </div>
        <div class="cag-card-times">
          <strong>🚶 ${p.walking_min ?? "?"} min</strong> ${walkSuffix} · 🚗 ${p.driving_min ?? "?"} min
        </div>
      </div>
    </article>
  `;
}

function formatDistance(m) {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ---- MAPPA --------------------------------------------------------------

function initMap() {
  if (!window.L) return;
  const mapEl = _state.root.querySelector("#cag-map");
  const map = L.map(mapEl, { scrollWheelZoom: false, minZoom: 10, maxZoom: 18 });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);
  map.on("focus", () => map.scrollWheelZoom.enable());
  map.on("blur",  () => map.scrollWheelZoom.disable());

  // Marker sede (sempre visibile)
  const venue = _state.data.venue;
  if (venue) {
    const venueIcon = L.divIcon({
      className: "cag-marker cag-marker--venue",
      html: "★",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
    L.marker([venue.lat, venue.lon], { icon: venueIcon, zIndexOffset: 1000 })
      .addTo(map)
      .bindTooltip(`<strong>${escapeHtml(venue.name)}</strong><br>Sede del convegno`, { direction: "top", offset: [0, -16] });
  }

  // Cluster (se disponibile)
  if (window.L.markerClusterGroup) {
    _state.markerCluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 32 });
    map.addLayer(_state.markerCluster);
  }

  // Markers per ogni POI
  for (const p of _state.pois) {
    if (!isFinite(p.lat) || !isFinite(p.lon)) continue;
    const color = TYPE_COLORS[p.type] || "#888";
    const icon = L.divIcon({
      className: "cag-marker",
      html: `<div class="cag-marker" style="background:${color}">${p.walking_min ?? ""}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    const marker = L.marker([p.lat, p.lon], { icon });
    marker.on("click", () => openPoi(p.id));
    marker.bindTooltip(`<strong>${escapeHtml(p.name)}</strong><br>🚶 ${p.walking_min} min · 🚗 ${p.driving_min} min`, { direction: "top", offset: [0, -10] });
    _state.markersById.set(p.id, marker);
    if (_state.markerCluster) _state.markerCluster.addLayer(marker);
    else marker.addTo(map);
  }

  // Fit ai bounds (sede + POI)
  const all = _state.pois.map(p => [p.lat, p.lon]);
  if (venue) all.push([venue.lat, venue.lon]);
  if (all.length) {
    map.fitBounds(all, { padding: [40, 40] });
  } else {
    map.setView([39.2238, 9.1217], 13);  // fallback centro Cagliari
  }
  _state.map = map;

  // Quando la tab diventa visibile (può accadere dopo l'init), invalidiamo.
  requestAnimationFrame(() => map.invalidateSize());
}

function refreshMarkers() {
  if (!_state.map) return;
  const visibleIds = new Set(_state.filtered.map(p => p.id));
  for (const [id, marker] of _state.markersById) {
    const visible = visibleIds.has(id);
    if (_state.markerCluster) {
      if (visible && !_state.markerCluster.hasLayer(marker)) {
        _state.markerCluster.addLayer(marker);
      } else if (!visible && _state.markerCluster.hasLayer(marker)) {
        _state.markerCluster.removeLayer(marker);
      }
    } else {
      if (visible && !_state.map.hasLayer(marker)) marker.addTo(_state.map);
      else if (!visible && _state.map.hasLayer(marker)) marker.remove();
    }
  }
}

// ---- MODAL DETTAGLIO ----------------------------------------------------

function ensureModal() {
  if (_state.modal) return _state.modal;
  const backdrop = document.createElement("div");
  backdrop.className = "cag-modal-backdrop";
  const modal = document.createElement("div");
  modal.className = "cag-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  document.body.append(backdrop, modal);
  backdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.dataset.open === "true") closeModal();
  });
  _state.modal = { backdrop, modal };
  return _state.modal;
}

function openPoi(id) {
  const poi = _state.pois.find(p => p.id === id);
  if (!poi) return;
  const { backdrop, modal } = ensureModal();
  const heroSrc = resolveAsset(poi.image || poi.image_url || "");
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat}%2C${poi.lon}&travelmode=walking`;
  const isEn = getLang() === "en";
  const localName = field(poi, "name") || poi.name;
  const localDesc = field(poi, "description") || poi.description;
  const localType = typeLabel(poi.type);
  modal.innerHTML = `
    <div class="cag-modal-hero">
      ${heroSrc ? `<img src="${escapeAttr(heroSrc)}" alt="" loading="lazy">` : ""}
      <button class="cag-modal-close" type="button" aria-label="${t("cagliari.modal.close")}">×</button>
    </div>
    <div class="cag-modal-body">
      <h3 class="cag-modal-name">${escapeHtml(localName)}</h3>
      <span class="cag-modal-type">${escapeHtml(localType)}</span>
      <div class="cag-modal-times">
        <div class="cag-modal-time"><span class="val">🚶 ${poi.walking_min ?? "?"}</span><span class="lbl">${isEn ? "min walk" : "min a piedi"}</span></div>
        <div class="cag-modal-time"><span class="val">🚗 ${poi.driving_min ?? "?"}</span><span class="lbl">${isEn ? "min by car" : "min in auto"}</span></div>
        <div class="cag-modal-time"><span class="val">${poi.distance_m ? formatDistance(poi.distance_m) : "—"}</span><span class="lbl">${isEn ? "from venue" : "dalla sede"}</span></div>
      </div>
      ${localDesc ? `<p class="cag-modal-desc">${escapeHtml(localDesc)}</p>` : ""}
      <a class="cag-modal-cta" href="${directionsUrl}" target="_blank" rel="noopener">
        <span aria-hidden="true">↗</span> ${t("cagliari.modal.directions")}
      </a>
    </div>
  `;
  modal.querySelector(".cag-modal-close").addEventListener("click", closeModal);
  backdrop.dataset.open = "true";
  modal.dataset.open = "true";
  // Centra anche la mappa sul POI
  if (_state.map) _state.map.flyTo([poi.lat, poi.lon], Math.max(_state.map.getZoom(), 15), { duration: 0.4 });
}

function closeModal() {
  if (!_state.modal) return;
  _state.modal.backdrop.dataset.open = "false";
  _state.modal.modal.dataset.open = "false";
}

// Riapplica invalidateSize quando la tab torna visibile (chiamata da app.js).
export function onCagliariVisible() {
  if (_state.map) {
    setTimeout(() => {
      _state.map.invalidateSize();
      // Re-fit per evitare zoom degeneri se l'init è avvenuto a 0-size.
      const all = _state.pois.map(p => [p.lat, p.lon]);
      const venue = _state.data?.venue;
      if (venue) all.push([venue.lat, venue.lon]);
      if (all.length) _state.map.fitBounds(all, { padding: [40, 40] });
    }, 50);
  }
}

// ---- helpers ------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// AIUCD 2026 Companion · vista Poster (galleria a grafo D3)

import { AREAS, AREA_BY_CODE, areaLabel } from "./data.js?v=f4-6";
import * as agenda from "./agenda.js";
import { t, getLang } from "./i18n.js?v=f4-6";

const ROOT_FONT_SIZE_DESKTOP = 14;
const NODE_RADIUS_DESKTOP = 32;

// Quando il companion gira dentro WP gli asset sotto companion/assets/ stanno
// in /wp-content/plugins/aiucd-companion/static/companion/, esposti via
// window.AIUCD_BASE_URL. In standalone (python -m http.server) il path è
// relativo a companion/index.html.
const ASSET_BASE = (typeof window !== "undefined" && window.AIUCD_BASE_URL)
  ? window.AIUCD_BASE_URL.replace(/\/$/, "") + "/"
  : "";

// Slideshow centralizzato per i poster con più co-autori (es. #132): un solo
// timer ruota la classe `.active` tra gli elementi `.slot` di ogni gruppo
// registrato. Resettiamo prima di ogni renderPoster() per evitare leak quando
// si lascia la tab.
const SLIDESHOW_INTERVAL_MS = 3500;
const _slideshows = new Set();
let _slideshowTimer = null;
function _slideshowTick() {
  for (const slots of _slideshows) {
    if (!slots.length) continue;
    const active = slots.findIndex(s => s.classList.contains("active"));
    const cur = active >= 0 ? active : 0;
    if (active >= 0) slots[active].classList.remove("active");
    slots[(cur + 1) % slots.length].classList.add("active");
  }
}
function registerSlideshow(slots) {
  if (!slots || slots.length < 2) return;
  slots[0].classList.add("active");
  _slideshows.add(slots);
  if (!_slideshowTimer) {
    _slideshowTimer = setInterval(_slideshowTick, SLIDESHOW_INTERVAL_MS);
  }
}
function resetSlideshows() {
  _slideshows.clear();
  // Lasciamo gli intervals running se la tab non è la attuale; verrà
  // ripopolato dal prossimo render.
}

function buildPhotoMarkup(photos, alt) {
  // Returns the inner HTML for a `.pc-photo`/`.ps-photo` container.
  // - 0 photos: '' (caller falls back to initials)
  // - 1 photo: single <img>
  // - 2+ photos: stacked <img class="slot"> for slideshow
  if (!photos || photos.length === 0) return null;
  if (photos.length === 1) {
    return `<img src="${ASSET_BASE}${photos[0]}" alt="${escapeHtml(alt)}">`;
  }
  return photos
    .map(p => `<img class="slot" src="${ASSET_BASE}${p}" alt="${escapeHtml(alt)}">`)
    .join("");
}

let _state = {
  data: null,
  root: null,
  onTalkClick: null,
  selectedAreas: new Set(AREAS.map(a => a.code)),
  query: "",
  view: "graph",  // "graph" | "grid"
  selectedPoster: null,
  simulation: null,
  svgEl: null,
  zoomBehavior: null,
  resizeObserver: null,
};

export function renderPoster(rootEl, data, onTalkClick) {
  resetSlideshows();
  _state.data = data;
  _state.root = rootEl;
  _state.onTalkClick = onTalkClick;
  rootEl.classList.add("poster-host");

  const isEn = getLang() === "en";
  rootEl.innerHTML = `
    <div class="section-head">
      <h2><span class="sub-mark"></span>${isEn ? "Poster Gallery" : "Poster Gallery"}</h2>
      <p class="section-sub">${data.posters.length} ${isEn ? "conference posters connected by thematic area. Tap a node for details" : "poster del convegno collegati per area tematica. Tap su un nodo per dettagli"}</p>
    </div>
    <div class="poster-toolbar">
      <div class="area-filters" id="poster-area-filters"></div>
      <div class="poster-search-row">
        <input type="search" id="poster-search" placeholder="${isEn ? "Search title, author…" : "Cerca titolo, autore…"}" autocomplete="off">
      </div>
      <div class="poster-view-switch" id="poster-view-switch">
        <button data-view="graph" class="active">${t("poster.view.graph")}</button>
        <button data-view="grid">${t("poster.view.grid")}</button>
      </div>
    </div>
    <div id="poster-area"></div>
  `;

  buildAreaFilters();
  wireSearch();
  wireViewSwitch();
  rerender();

  agenda.onChange(() => {
    if (_state.view === "grid") rerender();
  });
}

function buildAreaFilters() {
  const wrap = _state.root.querySelector("#poster-area-filters");
  // Stessa logica di program-view.js: con tutti attivi, il primo click su
  // un'area filtra solo quella; click sull'unica attiva ripristina "tutti";
  // multi-select aggiunge/toglie. Mai stato vuoto (svuotamento → tutti).
  for (const a of AREAS) {
    const btn = document.createElement("button");
    btn.className = "area-filter";
    btn.dataset.area = a.code;
    btn.dataset.active = "true";
    btn.innerHTML = `<span class="swatch" style="background:${a.color}"></span>${a.label}`;
    btn.addEventListener("click", () => {
      const code = a.code;
      const total = AREAS.length;
      const size = _state.selectedAreas.size;
      const allActive = size === total;
      const isOnlyActive = _state.selectedAreas.has(code) && size === 1;

      if (allActive) {
        _state.selectedAreas = new Set([code]);
      } else if (isOnlyActive) {
        _state.selectedAreas = new Set(AREAS.map(x => x.code));
      } else {
        if (_state.selectedAreas.has(code)) _state.selectedAreas.delete(code);
        else _state.selectedAreas.add(code);
        if (_state.selectedAreas.size === 0) {
          _state.selectedAreas = new Set(AREAS.map(x => x.code));
        }
      }
      refreshFilterUI();
      applyAreaFilter();
    });
    wrap.append(btn);
  }
}

function refreshFilterUI() {
  const wrap = _state.root.querySelector("#poster-area-filters");
  if (!wrap) return;
  wrap.querySelectorAll(".area-filter[data-area]").forEach(btn => {
    btn.dataset.active = _state.selectedAreas.has(btn.dataset.area) ? "true" : "false";
  });
}

function wireSearch() {
  const input = _state.root.querySelector("#poster-search");
  let t;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      _state.query = input.value.trim().toLowerCase();
      applyAreaFilter();
    }, 150);
  });
}

function wireViewSwitch() {
  const wrap = _state.root.querySelector("#poster-view-switch");
  wrap.querySelectorAll("button[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      _state.view = btn.dataset.view;
      wrap.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
      rerender();
    });
  });
}

function rerender() {
  const area = _state.root.querySelector("#poster-area");
  if (_state.view === "grid") {
    renderGrid(area);
  } else {
    renderGraph(area);
  }
}

// ========== GRID VIEW ==========

function renderGrid(area) {
  area.innerHTML = `<div class="poster-grid" id="poster-grid"></div>`;
  const grid = area.querySelector("#poster-grid");
  for (const p of _state.data.posters) {
    grid.append(makeGridCard(p));
  }
  applyAreaFilter();
}

function makeGridCard(poster) {
  const a = AREA_BY_CODE[poster.area_code] || AREA_BY_CODE.other;
  const author = (poster.authors && poster.authors[0]?.name) || extractFirstAuthor(poster.authors_raw);
  const initials = makeInitials(author);
  const photos = poster.photos && poster.photos.length
    ? poster.photos
    : (poster.photo ? [poster.photo] : []);
  const photoMarkup = buildPhotoMarkup(photos, author);
  const card = document.createElement("div");
  card.className = "poster-card";
  card.dataset.posterId = poster.id;
  card.dataset.areaCode = poster.area_code;
  card.style.setProperty("--card-color", a.color);
  card.style.setProperty("--photo-color", a.color);
  card.innerHTML = `
    <div class="pc-photo" data-photos="${photos.length}">${photoMarkup || initials}</div>
    <div class="pc-id">#${poster.id}</div>
    <div class="pc-title">${escapeHtml(poster.title)}</div>
    <div class="pc-author">${escapeHtml(author || "—")}</div>
    <span class="pc-area">${a.label}</span>
  `;
  if (photos.length > 1) {
    const slots = Array.from(card.querySelectorAll(".pc-photo .slot"));
    registerSlideshow(slots);
  }
  card.addEventListener("click", () => openPoster(poster));
  return card;
}

// ========== GRAPH VIEW (D3 force-directed) ==========

function renderGraph(area) {
  area.innerHTML = `
    <div class="poster-graph-wrap" id="poster-graph-wrap">
      <svg id="poster-svg"></svg>
      <div class="legend" id="poster-legend"></div>
      <div class="controls">
        <button id="zoom-in" title="Zoom +">+</button>
        <button id="zoom-out" title="Zoom −">−</button>
        <button id="zoom-reset" title="Reset zoom">⟲</button>
      </div>
    </div>
  `;
  const wrap = area.querySelector("#poster-graph-wrap");
  const legend = area.querySelector("#poster-legend");

  // Legend
  const counts = countByArea();
  legend.innerHTML = AREAS.filter(a => counts[a.code] > 0).map(a => `
    <div class="legend-row">
      <span class="swatch" style="background:${a.color}"></span>
      <span>${a.label} · ${counts[a.code]} poster</span>
    </div>
  `).join("");

  if (!window.d3) {
    wrap.innerHTML = `<div class="poster-empty"><strong>D3 non disponibile.</strong>Verificare la connessione internet.</div>`;
    return;
  }

  const rect = wrap.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

  const svg = d3.select("#poster-svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  _state.svgEl = svg.node();

  // Zoom container
  const g = svg.append("g").attr("class", "zoom-root");
  _state.zoomBehavior = d3.zoom()
    .scaleExtent([0.4, 4])
    .on("zoom", e => g.attr("transform", e.transform));
  svg.call(_state.zoomBehavior);

  // Nodes & links
  const nodes = _state.data.posters.map(p => ({
    id: p.id,
    poster: p,
    area: p.area_code,
    color: (AREA_BY_CODE[p.area_code] || AREA_BY_CODE.other).color,
  }));
  const links = [];
  // Connetti poster della stessa area in un piccolo cluster
  const byArea = new Map();
  for (const n of nodes) {
    if (!byArea.has(n.area)) byArea.set(n.area, []);
    byArea.get(n.area).push(n);
  }
  for (const [area, nodesInArea] of byArea) {
    // ogni nodo collegato al successivo (catena), e al primo (chiude cerchio)
    for (let i = 0; i < nodesInArea.length; i++) {
      const a = nodesInArea[i];
      const b = nodesInArea[(i + 1) % nodesInArea.length];
      if (a.id !== b.id) links.push({ source: a.id, target: b.id, area });
    }
    // ogni nodo collegato anche a quello +2 per dare più connessioni
    if (nodesInArea.length > 4) {
      for (let i = 0; i < nodesInArea.length; i++) {
        const a = nodesInArea[i];
        const b = nodesInArea[(i + 2) % nodesInArea.length];
        if (a.id !== b.id) links.push({ source: a.id, target: b.id, area });
      }
    }
  }

  // Halo per area (Voronoi-style approssimato come cerchi)
  const haloLayer = g.append("g").attr("class", "halos");

  const linkSel = g.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "link");

  const nodeSel = g.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(nodes, d => d.id)
    .join("g")
    .attr("class", "node")
    .attr("data-poster-id", d => d.id)
    .attr("data-area-code", d => d.area)
    .style("--node-color", d => d.color)
    .on("click", (event, d) => {
      event.stopPropagation();
      openPoster(d.poster);
      svg.selectAll(".node").classed("selected", n => n.id === d.id);
      highlightLinks(d.id);
    });

  nodeSel.append("circle")
    .attr("class", "bg")
    .attr("r", NODE_RADIUS_DESKTOP);

  // Photo (clipped to circle) or initials
  nodeSel.each(function(d) {
    const node = d3.select(this);
    const author = (d.poster.authors && d.poster.authors[0]?.name)
      || extractFirstAuthor(d.poster.authors_raw);
    const photos = d.poster.photos && d.poster.photos.length
      ? d.poster.photos
      : (d.poster.photo ? [d.poster.photo] : []);

    if (photos.length > 0) {
      // SVG <image> clippato a cerchio: stesso radius del nodo, ancorato al
      // centro del gruppo. preserveAspectRatio "slice" = object-fit:cover.
      const clipId = `poster-clip-${d.poster.id}`;
      node.append("clipPath")
        .attr("id", clipId)
        .append("circle")
        .attr("r", NODE_RADIUS_DESKTOP);
      photos.forEach((p, i) => {
        node.append("image")
          .attr("class", photos.length > 1 ? `photo slot${i === 0 ? " active" : ""}` : "photo")
          .attr("href", `${ASSET_BASE}${p}`)
          .attr("x", -NODE_RADIUS_DESKTOP)
          .attr("y", -NODE_RADIUS_DESKTOP)
          .attr("width", 2 * NODE_RADIUS_DESKTOP)
          .attr("height", 2 * NODE_RADIUS_DESKTOP)
          .attr("clip-path", `url(#${clipId})`)
          .attr("preserveAspectRatio", "xMidYMid slice");
      });
      if (photos.length > 1) {
        const slots = Array.from(this.querySelectorAll("image.slot"));
        registerSlideshow(slots);
      }
    } else {
      const initials = makeInitials(author);
      node.append("text")
        .attr("class", "initials")
        .attr("font-size", initials.length === 1 ? 26 : 18)
        .text(initials);
    }
    // Label sotto al nodo (visibile su hover/select)
    node.append("text")
      .attr("class", "node-label")
      .attr("y", NODE_RADIUS_DESKTOP + 14)
      .text(`#${d.id}`);
  });

  // Click su sfondo svg → deseleziona
  svg.on("click", () => {
    svg.selectAll(".node").classed("selected", false);
    linkSel.classed("highlight", false).classed("dim", false);
    closeSidesheet();
  });

  function highlightLinks(nodeId) {
    linkSel
      .classed("highlight", l => l.source.id === nodeId || l.target.id === nodeId)
      .classed("dim",       l => !(l.source.id === nodeId || l.target.id === nodeId));
  }

  // Force simulation
  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(95).strength(0.3))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("collide", d3.forceCollide(NODE_RADIUS_DESKTOP + 4))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.05))
    .force("y", d3.forceY(height / 2).strength(0.05))
    .alphaDecay(0.04)
    .on("tick", () => {
      linkSel
        .attr("x1", l => l.source.x)
        .attr("y1", l => l.source.y)
        .attr("x2", l => l.target.x)
        .attr("y2", l => l.target.y);
      nodeSel.attr("transform", d => `translate(${d.x}, ${d.y})`);
      // Disegna gli halos in tick così seguono i cluster
      drawHalos(haloLayer, byArea);
    });
  _state.simulation = sim;

  // Drag
  nodeSel.call(d3.drag()
    .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
  );

  // Zoom controls
  area.querySelector("#zoom-in").addEventListener("click", () => svg.transition().call(_state.zoomBehavior.scaleBy, 1.4));
  area.querySelector("#zoom-out").addEventListener("click", () => svg.transition().call(_state.zoomBehavior.scaleBy, 0.7));
  area.querySelector("#zoom-reset").addEventListener("click", () => svg.transition().call(_state.zoomBehavior.transform, d3.zoomIdentity));

  applyAreaFilter();
}

function drawHalos(haloLayer, byArea) {
  const data = [...byArea.entries()].map(([code, nodes]) => {
    if (!nodes.length) return null;
    const xs = nodes.map(n => n.x).filter(v => Number.isFinite(v));
    const ys = nodes.map(n => n.y).filter(v => Number.isFinite(v));
    if (!xs.length) return null;
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const r = Math.max(80, Math.sqrt(nodes.length) * 50);
    const color = (AREA_BY_CODE[code] || AREA_BY_CODE.other).color;
    const label = (AREA_BY_CODE[code] || AREA_BY_CODE.other).label;
    return { code, cx, cy, r, color, label };
  }).filter(Boolean);

  const haloSel = haloLayer.selectAll("g.halo-group").data(data, d => d.code);
  const enter = haloSel.enter().append("g").attr("class", "halo-group");
  enter.append("circle").attr("class", "area-halo");
  enter.append("text").attr("class", "area-halo-label");
  haloSel.merge(enter)
    .each(function(d) {
      const grp = d3.select(this);
      grp.style("--halo-color", d.color);
      grp.select("circle.area-halo")
        .attr("cx", d.cx).attr("cy", d.cy).attr("r", d.r);
      grp.select("text.area-halo-label")
        .attr("x", d.cx).attr("y", d.cy - d.r - 8)
        .text(d.label);
    });
  haloSel.exit().remove();
}

// ========== FILTRO (sia grid che grafo) ==========

function applyAreaFilter() {
  const matches = (poster) => {
    if (!_state.selectedAreas.has(poster.area_code)) return false;
    if (_state.query) {
      const hay = (poster.title + " " + (poster.authors_raw || "") + " " + (poster.abstract || "")).toLowerCase();
      if (!hay.includes(_state.query)) return false;
    }
    return true;
  };

  if (_state.view === "grid") {
    _state.root.querySelectorAll(".poster-card[data-poster-id]").forEach(card => {
      const pid = parseInt(card.dataset.posterId, 10);
      const poster = _state.data.posters.find(p => p.id === pid);
      card.style.display = poster && matches(poster) ? "" : "none";
    });
  } else if (_state.view === "graph") {
    _state.root.querySelectorAll(".node[data-poster-id]").forEach(node => {
      const pid = parseInt(node.getAttribute("data-poster-id"), 10);
      const poster = _state.data.posters.find(p => p.id === pid);
      node.classList.toggle("dim", !(poster && matches(poster)));
    });
  }
}

function countByArea() {
  const counts = {};
  for (const p of _state.data.posters) {
    counts[p.area_code] = (counts[p.area_code] || 0) + 1;
  }
  return counts;
}

// ========== SIDE SHEET ==========

function openPoster(poster) {
  _state.selectedPoster = poster;
  let side = document.getElementById("poster-side");
  if (!side) {
    side = document.createElement("aside");
    side.id = "poster-side";
    side.className = "poster-side";
    document.body.append(side);
  }
  const a = AREA_BY_CODE[poster.area_code] || AREA_BY_CODE.other;
  const author = (poster.authors && poster.authors[0]?.name) || extractFirstAuthor(poster.authors_raw);
  const aff = (poster.authors && poster.authors[0]?.aff) || "";
  const initials = makeInitials(author);
  const photos = poster.photos && poster.photos.length
    ? poster.photos
    : (poster.photo ? [poster.photo] : []);
  const photoMarkup = buildPhotoMarkup(photos, author);
  const saved = agenda.isSaved(poster.id);

  // Related posters: stessa area, max 6
  const related = _state.data.posters
    .filter(p => p.id !== poster.id && p.area_code === poster.area_code)
    .slice(0, 6);

  side.innerHTML = `
    <div class="ps-head" style="--photo-color:${a.color}">
      <button class="ps-close" id="ps-close" aria-label="Chiudi">×</button>
      <div class="ps-photo" data-photos="${photos.length}">${photoMarkup || initials}</div>
      <div class="ps-area" style="background:${a.color}">${a.label}</div>
      <h3 class="ps-title">${escapeHtml(poster.title)}</h3>
    </div>
    <div class="ps-body">
      <div class="ps-section">
        <h4>Autori</h4>
        <div class="ps-authors">
          <strong>${escapeHtml(author || "—")}</strong>
          ${aff ? `<div class="aff">${escapeHtml(aff)}</div>` : ""}
          ${poster.authors_raw && (!poster.authors || poster.authors.length === 0)
            ? `<div>${escapeHtml(poster.authors_raw)}</div>` : ""}
        </div>
      </div>
      ${poster.abstract ? `
        <div class="ps-section">
          <h4>Abstract</h4>
          <div class="ps-abstract">${escapeHtml(poster.abstract.slice(0, 800))}${poster.abstract.length > 800 ? "…" : ""}</div>
        </div>
      ` : ""}
      ${related.length > 0 ? `
        <div class="ps-section ps-related">
          <h4>Poster connessi</h4>
          <div class="related-grid">
            ${related.map(r => {
              const ra = AREA_BY_CODE[r.area_code] || AREA_BY_CODE.other;
              const rauth = (r.authors && r.authors[0]?.name) || extractFirstAuthor(r.authors_raw);
              return `<div class="related-thumb"
                style="--related-color:${ra.color}"
                data-poster-id="${r.id}"
                title="${escapeHtml(r.title)}">
                ${makeInitials(rauth)}
              </div>`;
            }).join("")}
          </div>
        </div>
      ` : ""}
    </div>
    <div class="ps-actions">
      <button class="btn ${saved ? 'btn-saved' : 'btn-primary'}" id="ps-save">
        ${saved ? "★ In agenda — rimuovi" : "☆ Aggiungi all'agenda"}
      </button>
      <button class="btn btn-secondary" id="ps-session">📍 Poster session · 4 giugno · 14:30</button>
    </div>
  `;
  side.dataset.open = "true";

  if (photos.length > 1) {
    const slots = Array.from(side.querySelectorAll(".ps-photo .slot"));
    registerSlideshow(slots);
  }

  side.querySelector("#ps-close").addEventListener("click", closeSidesheet);
  side.querySelectorAll(".related-thumb[data-poster-id]").forEach(el => {
    el.addEventListener("click", () => {
      const pid = parseInt(el.dataset.posterId, 10);
      const target = _state.data.posters.find(p => p.id === pid);
      if (target) openPoster(target);
    });
  });
  side.querySelector("#ps-save").addEventListener("click", () => {
    const nowSaved = agenda.toggle(poster.id);
    const btn = side.querySelector("#ps-save");
    btn.textContent = nowSaved ? "★ In agenda — rimuovi" : "☆ Aggiungi all'agenda";
    btn.className = `btn ${nowSaved ? "btn-saved" : "btn-primary"}`;
  });
  side.querySelector("#ps-session").addEventListener("click", () => {
    closeSidesheet();
    window.dispatchEvent(new CustomEvent("companion:goto-room", {
      detail: { room: "Aula Capitini" },
    }));
  });
}

function closeSidesheet() {
  const side = document.getElementById("poster-side");
  if (side) side.dataset.open = "false";
}

// ========== HELPERS ==========

function makeInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function extractFirstAuthor(raw) {
  if (!raw) return "";
  // Forma tipica: "Cognome Nome (Affiliazione); Altro Autore (...)"
  const first = String(raw).split(/[;,(]/)[0].trim();
  return first;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

// AIUCD 2026 Companion · vista Numeri (dashboard di submission)
// Porting del mockup_dashboard.html: hero full-bleed, KPI, donut aree,
// stacked bar mode-area, bar timeline, top affiliazioni, mappa Leaflet,
// indicatori qualità.

import { t, getLang } from "./i18n.js?v=f4-5";

// Quando il companion è embedded in WordPress, window.AIUCD_DATA_URL punta
// alla cartella dati del plugin. In standalone resta il path relativo storico.
const STATS_URL = (typeof window !== "undefined" && window.AIUCD_DATA_URL)
  ? window.AIUCD_DATA_URL.replace(/\/$/, "") + "/data.json"
  : "../data/generated/data.json";

let _state = {
  data: null,
  root: null,
  charts: [],
  map: null,
};

const NAVY = "#000060";
const RUST = "#D8613C";

const AREA_COLORS_BY_FULL = {
  "DH and co-construction of knowledge with communities: challenges, methods, tools": "#000060",
  "Archives and editions: augmented descriptions, accessibility, and information systems": "#2A6FA1",
  "Memories, History, and digital cultural heritage": "#1F8A70",
  "Data and Knowledge Representation": "#C2A990",
  "Digital textualities: perspectives, developments, and experimentations": "#D8613C",
  "Other contributions on Digital Humanities": "#6B4C8A",
};

const AREA_SHORT = {
  "DH and co-construction of knowledge with communities: challenges, methods, tools": "DH e co-costruzione",
  "Archives and editions: augmented descriptions, accessibility, and information systems": "Archivi ed edizioni",
  "Memories, History, and digital cultural heritage": "Memorie, Storia, patrimonio",
  "Data and Knowledge Representation": "Dati e rappresentazione",
  "Digital textualities: perspectives, developments, and experimentations": "Testualità digitali",
  "Other contributions on Digital Humanities": "Altri contributi DH",
};

export async function renderNumeri(rootEl) {
  rootEl.classList.add("num-host");
  const isEn = getLang() === "en";

  rootEl.innerHTML = `
    <header class="num-hero">
      <div class="binary-pattern" aria-hidden="true">
        01001 10100 11001 01100 11010 00101 11001 00110 10101 01010 01101 11001 00110 11010 00101 11000 10110 01010 11001 01100 11010
        00110 10101 01010 01101 11010 00101 11001 00110 10101 01010 01101 11010 00101 11001 00110 10101 01010 01101 00101 11001 01010
        01001 10100 11001 01100 11010 00101 11001 00110 10101 01010 01101 11001 00110 11010 00101 11000 10110 01010 11001 01100 11010
      </div>
      <div class="hero-inner">
        <div class="eyebrow">${isEn ? "Towards AIUCD 2026 · Submission statistics" : "Aspettando AIUCD 2026 · Statistiche delle proposte"}</div>
        <h1>${isEn ? "The conference <em>in figures</em>" : "Il convegno <em>in numeri</em>"}</h1>
        <p class="lead">
          ${isEn
            ? "An overview of the proposals received for the call for papers of the 15th annual conference of the <em>Italian Association for Humanities Computing and Digital Culture</em>, across rhythms, geographies and research trends."
            : "Uno sguardo d'insieme sulle proposte pervenute alla call for papers del XV convegno annuale dell'<em>Associazione per l'Informatica Umanistica e la Cultura Digitale</em>, tra ritmi, geografie e linee di ricerca."}
        </p>
        <div class="meta">
          <span>${isEn ? "Data updated 18 April 2026" : "Dati aggiornati al 18 aprile 2026"}</span>
          <span>${isEn ? "Source: CMT platform" : "Fonte: piattaforma CMT"}</span>
          <span id="num-meta-total">${isEn ? "— proposals · review process concluded" : "— proposte · processo di review concluso"}</span>
        </div>
      </div>
    </header>

    <section>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">${isEn ? "Submitted proposals" : "Proposte inviate"}</div>
          <div class="kpi-value" id="kpi-total">—</div>
          <div class="kpi-hint">${isEn ? "from 3 January to 10 February 2026" : "dal 3 gennaio al 10 febbraio 2026"}</div>
        </div>
        <div class="kpi-card green">
          <div class="kpi-label">${isEn ? "Accepted contributions" : "Contributi accettati"}</div>
          <div class="kpi-value" id="kpi-accepted">—</div>
          <div class="kpi-hint"><b><span id="kpi-accept-rate">—</span>%</b> ${isEn ? "acceptance rate" : "di acceptance rate"}</div>
        </div>
        <div class="kpi-card sand">
          <div class="kpi-label">${isEn ? "Author signatures" : "Firme d'autore"}</div>
          <div class="kpi-value" id="kpi-authors">—</div>
          <div class="kpi-hint">${isEn ? "average of <b>2.46</b> authors per contribution" : "media di <b>2,46</b> autori per contributo"}</div>
        </div>
        <div class="kpi-card accent">
          <div class="kpi-label">${isEn ? "Research institutions" : "Enti di ricerca"}</div>
          <div class="kpi-value" id="kpi-orgs">—</div>
          <div class="kpi-hint">${isEn ? "universities, institutes and research centres involved" : "atenei, istituti e centri coinvolti"}</div>
        </div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2><span class="sub-mark"></span>${isEn ? "Thematic areas of the conference" : "Le aree tematiche del convegno"}</h2>
        <p class="section-sub">${isEn ? "Distribution of <span id=\"num-areas-total\">—</span> contributions across the six macro-areas of the call for papers." : "Distribuzione dei <span id=\"num-areas-total\">—</span> contributi sulle sei macro-aree della call for papers."}</p>
      </div>
      <div class="grid-2">
        <div class="panel">
          <div class="chart-wrap"><canvas id="num-chart-areas"></canvas></div>
        </div>
        <div class="panel">
          <h3>${isEn ? "Breakdown by area" : "Dettaglio per area"}</h3>
          <p class="panel-sub">${isEn ? "Sorted by size." : "Ordinate per numerosità."}</p>
          <div id="num-areas-legend" class="legend-list"></div>
        </div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2><span class="sub-mark"></span>${isEn ? "Presentation mode" : "Modalità di presentazione"}</h2>
        <p class="section-sub">${isEn ? "How oral communications and posters distribute across thematic areas." : "Come si distribuiscono comunicazioni orali e poster tra le aree tematiche."}</p>
      </div>
      <div class="panel">
        <div class="chart-wrap tall"><canvas id="num-chart-mode-area"></canvas></div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2><span class="sub-mark"></span>${isEn ? "Submission rate" : "Ritmo invio proposte"}</h2>
        <p class="section-sub">${isEn ? "Number of proposals received day-by-day during the call." : "Numero di proposte ricevute giorno per giorno nel periodo della call."}</p>
      </div>
      <div class="panel">
        <div class="chart-wrap"><canvas id="num-chart-timeline"></canvas></div>
        <div class="annotation" id="num-deadline-annot"></div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2><span class="sub-mark"></span>${isEn ? "The institutional ecosystem" : "L'ecosistema istituzionale"}</h2>
        <p class="section-sub">${isEn ? "Top 15 affiliations by author signatures. Data post-normalised for spelling variants." : "Top 15 affiliazioni per numero di firme d'autore. Dati post-normalizzazione delle grafie."}</p>
      </div>
      <div class="panel">
        <div id="num-aff-list" class="aff-list"></div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2><span class="sub-mark"></span>${isEn ? "Geographic distribution" : "Distribuzione geografica"}</h2>
        <p class="section-sub">${isEn ? "Locations of the participating research institutions. Marker size is proportional to the number of author signatures." : "Le sedi degli enti di ricerca coinvolti. Dimensione del marker proporzionale al numero di firme d'autore."}</p>
      </div>
      <div class="panel">
        <div id="num-map"></div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2><span class="sub-mark"></span>${isEn ? "Process quality indicators" : "Indicatori di qualità del processo"}</h2>
        <p class="section-sub">${isEn ? "Compliance with the procedural requirements of the call and participation in the optional initiatives." : "Conformità agli obblighi procedurali della call e partecipazione alle iniziative opzionali."}</p>
      </div>
      <div class="quality-grid">
        <div class="quality-item">
          <div class="val">100%</div>
          <div class="lbl">${isEn ? "Contributions with PDF attached" : "Contributi con PDF allegato"}</div>
        </div>
        <div class="quality-item ai">
          <div class="val">100%</div>
          <div class="lbl">${isEn ? "Generative AI usage statement" : "Dichiarazione uso di AI generativa"}</div>
        </div>
        <div class="quality-item iscr">
          <div class="val">100%</div>
          <div class="lbl">${isEn ? "Commitment to register if accepted" : "Impegno all'iscrizione se accettato"}</div>
        </div>
        <div class="quality-item gigl">
          <div class="val" id="num-quality-gigliozzi">—</div>
          <div class="lbl">${isEn ? "Gigliozzi Award candidates" : "Candidature al Premio Gigliozzi"}</div>
        </div>
      </div>
    </section>
  `;

  _state.root = rootEl;
  try {
    const res = await fetch(STATS_URL);
    _state.data = await res.json();
  } catch (e) {
    console.error("numeri: failed to load data.json", e);
    return;
  }

  populateKPI();
  drawAreasChart();
  drawAreasLegend();
  drawModeAreaChart();
  drawTimeline();
  drawAffiliations();
  drawMap();
  populateQuality();
}

// Chiamata quando il tab numeri torna visibile: Leaflet ha bisogno di
// invalidateSize per ricalcolare le tile, e fitBounds va riapplicato perché
// la prima volta che drawMap gira il container può avere dimensioni 0
// (tab non ancora attivo) → fitBounds calcola uno zoom degenere su un
// punto qualunque dei bounds.
export function onNumeriVisible() {
  if (!_state.map) return;
  setTimeout(() => {
    _state.map.invalidateSize();
    if (_state.mapBounds) {
      _state.map.fitBounds(_state.mapBounds, { padding: [20, 20] });
    }
  }, 50);
}

// ===== KPI ==========================================================

function populateKPI() {
  const k = _state.data.kpi;
  $("#kpi-total").textContent = k.totale;
  $("#kpi-accepted").textContent = k.accettati;
  $("#kpi-accept-rate").textContent = (k.accettati / k.totale * 100).toFixed(1);
  $("#kpi-authors").textContent = k.firme_totali;
  $("#kpi-orgs").textContent = "≈" + k.enti_unici;
  $("#num-meta-total").textContent = `${k.totale} proposte · processo di review concluso`;
  $("#num-areas-total").textContent = k.totale;
}

// ===== Charts =======================================================

function ensureChartDefaults() {
  if (!window.Chart) return false;
  Chart.defaults.font.family = '"Inter", -apple-system, BlinkMacSystemFont, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = "#5a5a5a";
  Chart.defaults.borderColor = "#e6e3dc";
  return true;
}

function drawAreasChart() {
  if (!ensureChartDefaults()) return;
  const areas = _state.data.areas;
  const labels = areas.map(a => AREA_SHORT[a.name] || a.name);
  const counts = areas.map(a => a.count);
  const colors = areas.map(a => AREA_COLORS_BY_FULL[a.name] || NAVY);
  const totale = _state.data.kpi.totale;

  const c = new Chart($("#num-chart-areas"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: colors,
        borderWidth: 3,
        borderColor: "#fff",
        hoverBorderWidth: 4,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: NAVY,
          titleFont: { family: "Cardo", size: 14, weight: "bold" },
          bodyFont: { family: "Inter", size: 12 },
          padding: 12, cornerRadius: 8,
          callbacks: {
            label: ctx => `${ctx.parsed} contributi (${(ctx.parsed/totale*100).toFixed(1)}%)`,
          },
        },
      },
      cutout: "58%",
    },
  });
  _state.charts.push(c);
}

function drawAreasLegend() {
  const totale = _state.data.kpi.totale;
  const list = $("#num-areas-legend");
  list.innerHTML = "";
  for (const a of _state.data.areas) {
    const pct = (a.count / totale * 100).toFixed(1);
    const color = AREA_COLORS_BY_FULL[a.name] || NAVY;
    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML = `
      <span class="legend-swatch" style="background:${color}"></span>
      <span class="legend-label">${escapeHtml(AREA_SHORT[a.name] || a.name)}</span>
      <span class="legend-value">${a.count}<span class="legend-pct">${pct}%</span></span>`;
    list.append(row);
  }
}

function drawModeAreaChart() {
  if (!ensureChartDefaults()) return;
  const areas = _state.data.areas;
  const labels = areas.map(a => AREA_SHORT[a.name] || a.name);
  const oral   = areas.map(a => _state.data.mode_area[a.name]?.["Oral communication"] || 0);
  const poster = areas.map(a => _state.data.mode_area[a.name]?.["Poster"] || 0);

  const c = new Chart($("#num-chart-mode-area"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Comunicazioni orali", data: oral,   backgroundColor: NAVY, borderRadius: 4 },
        { label: "Poster",              data: poster, backgroundColor: RUST, borderRadius: 4 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: "#f0eee9", drawBorder: false }, ticks: { color: "#5a5a5a" } },
        y: { stacked: true, grid: { display: false }, ticks: { color: "#111111", font: { size: 12, weight: "500" } } },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 12, boxHeight: 12, padding: 14, color: "#111111", font: { size: 12, weight: "500" }, usePointStyle: true, pointStyle: "rectRounded" },
        },
        tooltip: {
          backgroundColor: NAVY,
          titleFont: { family: "Cardo", size: 14, weight: "bold" },
          bodyFont: { family: "Inter", size: 12 },
          padding: 12, cornerRadius: 8, mode: "index",
        },
      },
    },
  });
  _state.charts.push(c);
}

function drawTimeline() {
  if (!ensureChartDefaults()) return;
  const tl = _state.data.timeline;
  const labels = tl.map(t => {
    const [, m, d] = t.date.split("-");
    return `${d}/${m}`;
  });
  const data = tl.map(t => t.count);
  const colors = tl.map(t => t.count >= 50 ? RUST : NAVY);

  const c = new Chart($("#num-chart-timeline"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Proposte",
        data,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { color: "#5a5a5a", autoSkip: false, maxRotation: 60, minRotation: 45 } },
        y: { beginAtZero: true, grid: { color: "#f0eee9", drawBorder: false }, ticks: { color: "#5a5a5a", stepSize: 10 } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: NAVY,
          titleFont: { family: "Cardo", size: 14, weight: "bold" },
          bodyFont: { family: "Inter", size: 12 },
          padding: 12, cornerRadius: 8,
          callbacks: {
            title: items => `Giorno ${items[0].label}`,
            label: ctx => `${ctx.parsed.y} proposte`,
          },
        },
      },
    },
  });
  _state.charts.push(c);

  // Annotation deadline
  const peak = tl.reduce((a, b) => a.count > b.count ? a : b);
  const totale = _state.data.kpi.totale;
  const pct = ((peak.count / totale) * 100).toFixed(0);
  const [y, m, d] = peak.date.split("-");
  $("#num-deadline-annot").innerHTML = `
    <strong>Effetto deadline:</strong> il ${d}/${m}/${y}, ultimo giorno utile, sono arrivate
    <b>${peak.count} proposte</b> — il <b>${pct}%</b> del totale concentrato in 24 ore.
  `;
}

function drawAffiliations() {
  const list = $("#num-aff-list");
  const top15 = _state.data.top_affiliations.slice(0, 15);
  if (!top15.length) return;
  const max = top15[0].count;
  list.innerHTML = top15.map((a, i) => `
    <div class="aff-row${i === 0 ? " top1" : ""}">
      <div class="aff-name"><strong>${escapeHtml(a.name)}</strong></div>
      <div class="aff-count">${a.count}</div>
      <div class="aff-bar"><div class="aff-bar-fill" style="width:${(a.count/max*100).toFixed(1)}%"></div></div>
    </div>
  `).join("");
}

function drawMap() {
  if (!window.L) return;
  const points = _state.data.map_points || [];
  const map = L.map("num-map", { scrollWheelZoom: false, minZoom: 3, maxZoom: 13 });

  // Calcola bounds dai punti reali: l'inviluppo Italia + alcuni POI europei
  // ed extra-EU si adatta da solo. Fallback al riquadro Italia centro-sud se
  // non ci sono punti.
  const validPts = points.filter(p =>
    Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );
  const bounds = validPts.length
    ? L.latLngBounds(validPts.map(p => [p.lat, p.lng]))
    : L.latLngBounds([[36.5, 6.5], [47.1, 18.6]]);
  _state.mapBounds = bounds;

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  map.on("focus", () => map.scrollWheelZoom.enable());
  map.on("blur",  () => map.scrollWheelZoom.disable());
  map.on("click", () => map.scrollWheelZoom.enable());

  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const size = Math.max(28, Math.min(70, 22 + Math.sqrt(p.count) * 7));
    const color = p.count >= 30 ? RUST : (p.count >= 10 ? NAVY : "#2A6FA1");
    const html = `<div class="marker-bubble" style="width:${size}px;height:${size}px;font-size:${Math.max(11, size/3.4)}px;background:${color}">${p.count}</div>`;
    const icon = L.divIcon({ html, className: "institution-marker", iconSize: [size, size], iconAnchor: [size/2, size/2] });
    const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
    marker.bindTooltip(`<strong>${escapeHtml(p.name)}</strong>${p.count} firme d'autore`, {
      direction: "top", offset: [0, -size/2 + 6], className: "aiucd-tip",
    });
  }
  _state.map = map;

  // Primo fitBounds: applicato in un microtask così se il container era
  // 0-size al momento di L.map(...) (tab non attivo) il browser ha già
  // applicato il layout. Se serve un secondo passaggio quando il tab
  // diventa attivo, ci pensa onNumeriVisible().
  requestAnimationFrame(() => {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [20, 20] });
  });
}

function populateQuality() {
  $("#num-quality-gigliozzi").textContent = _state.data.gigliozzi_count || "—";
}

// ===== helpers ======================================================

function $(sel) { return _state.root.querySelector(sel); }

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

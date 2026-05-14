// AIUCD 2026 Companion · vista Programma (griglia tempo × aula)

import { AREAS, AREA_BY_CODE, areaLabel } from "./data.js?v=f4-6";
import * as agenda from "./agenda.js";
import { nowMinutesOfDay, getNow } from "./livestate.js";
import { renderLiveSnapshot } from "./now-view.js?v=copy1";
import { t, formatDay, translateRoom, field } from "./i18n.js?v=f4-6";

const ROOMS_ORDER = ["Aula 5A", "Aula 6A", "Aula 8A"];

let _state = {
  selectedDay: null,
  selectedAreas: new Set(AREAS.map(a => a.code)),
  data: null,
  onTalkClick: null,
};

export function renderProgram(rootEl, data, onTalkClick) {
  _state.data = data;
  _state.onTalkClick = onTalkClick;

  // Default: today if it's during the conference, else first day
  const today = getNow().toISOString().slice(0, 10);
  const todayInProgram = data.program.days.find(d => d.date === today);
  _state.selectedDay = todayInProgram ? today : data.program.days[0].date;

  rootEl.innerHTML = `
    <div class="section-head bg-pibiones">
      <h2><span class="sub-mark"></span>${t("program.heading")}</h2>
      <p class="section-sub">${t("program.intro")}</p>
    </div>
    <div class="program-toolbar">
      <div class="day-tabs" role="tablist" id="day-tabs"></div>
      <div class="area-filters" id="area-filters"></div>
    </div>
    <div id="live-snapshot-host"></div>
    <div class="program-grid-wrap">
      <div class="program-grid" id="program-grid"></div>
    </div>
  `;

  renderDayTabs(rootEl);
  renderAreaFilters(rootEl);
  renderGrid(rootEl);

  // Auto-refresh now line e live snapshot ogni 30s
  setInterval(() => {
    updateNowLine(rootEl);
    refreshLiveSnapshot(rootEl);
  }, 30_000);
  updateNowLine(rootEl);

  // Su mobile la now-line vive dentro le .track-column: il loro reflow su
  // resize/orientation-change richiede un ricomputo delle posizioni.
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => updateNowLine(rootEl), 120);
  });

  // Refresh saved indicators when agenda changes
  agenda.onChange(() => {
    rootEl.querySelectorAll(".talk-cell[data-paper-id]").forEach(cell => {
      const pid = parseInt(cell.dataset.paperId, 10);
      cell.querySelector(".talk-icon.saved")?.classList.toggle("d-none", !agenda.isSaved(pid));
      let saved = cell.querySelector(".talk-icon.saved");
      if (agenda.isSaved(pid) && !saved) {
        const span = document.createElement("span");
        span.className = "talk-icon saved icon icon--star-filled";
        span.setAttribute("aria-label", t("program.in_agenda"));
        cell.querySelector(".talk-icons")?.prepend(span);
      } else if (!agenda.isSaved(pid) && saved) {
        saved.remove();
      }
    });
  });
}

function renderDayTabs(rootEl) {
  const tabs = rootEl.querySelector("#day-tabs");
  tabs.innerHTML = _state.data.program.days.map(d => `
    <button class="day-tab" role="tab" aria-selected="${d.date === _state.selectedDay}" data-day="${d.date}">
      ${formatDay(d.date) || d.label}
    </button>
  `).join("");
  tabs.querySelectorAll(".day-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      _state.selectedDay = btn.dataset.day;
      tabs.querySelectorAll(".day-tab").forEach(b =>
        b.setAttribute("aria-selected", b.dataset.day === _state.selectedDay)
      );
      renderGrid(rootEl);
      updateNowLine(rootEl);
    });
  });
}

function renderAreaFilters(rootEl) {
  const wrap = rootEl.querySelector("#area-filters");
  // Stato iniziale: nessun filtro attivo = "mostra tutto"
  // Visivamente però non c'è una distinzione tra "tutti attivi" e "nessuno
  // attivo" — quindi rappresentiamo "tutti" come "tutti gli `selectedAreas`
  // popolati": all'avvio l'utente vede tutti i chip in stato attivo.
  wrap.innerHTML = `
    <button class="area-filter area-all" data-area-all="true" data-active="true">
      <span>${t("program.all_areas")}</span>
    </button>
    ${AREAS.map(a => `
      <button class="area-filter" data-area="${a.code}" data-active="true">
        <span class="glyph glyph--${a.code} glyph--md" style="color:${a.color}" aria-hidden="true"></span>
        <span>${areaLabel(a.code)}</span>
      </button>
    `).join("")}
  `;

  // Pulsante "Tutte le aree": resetta la selezione a tutti.
  wrap.querySelector(".area-filter[data-area-all]").addEventListener("click", () => {
    _state.selectedAreas = new Set(AREAS.map(a => a.code));
    refreshFilterUI(wrap);
    applyAreaFilter(rootEl);
  });

  wrap.querySelectorAll(".area-filter[data-area]").forEach(btn => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.area;
      const totalAreas = AREAS.length;
      const selectedSize = _state.selectedAreas.size;
      const allActive = selectedSize === totalAreas;
      const isOnlyActive = _state.selectedAreas.has(code) && selectedSize === 1;

      if (allActive) {
        // Stato "tutti attivi": il primo click filtra SOLO quello cliccato.
        _state.selectedAreas = new Set([code]);
      } else if (isOnlyActive) {
        // Click sull'unico attivo: ripristina "tutti".
        _state.selectedAreas = new Set(AREAS.map(a => a.code));
      } else {
        // Multi-select: aggiunge o toglie dalla selezione.
        if (_state.selectedAreas.has(code)) _state.selectedAreas.delete(code);
        else _state.selectedAreas.add(code);
        // Se la selezione si svuota → torna a tutti.
        if (_state.selectedAreas.size === 0) {
          _state.selectedAreas = new Set(AREAS.map(a => a.code));
        }
      }
      refreshFilterUI(wrap);
      applyAreaFilter(rootEl);
    });
  });
}

function refreshFilterUI(wrap) {
  const totalAreas = AREAS.length;
  const allActive = _state.selectedAreas.size === totalAreas;
  // Pulsante "Tutte": attivo solo quando tutte le aree sono selezionate.
  const allBtn = wrap.querySelector(".area-filter[data-area-all]");
  if (allBtn) allBtn.dataset.active = allActive ? "true" : "false";
  wrap.querySelectorAll(".area-filter[data-area]").forEach(btn => {
    btn.dataset.active = _state.selectedAreas.has(btn.dataset.area) ? "true" : "false";
  });
}

function applyAreaFilter(rootEl) {
  const allSelected = _state.selectedAreas.size === AREAS.length;

  // 1. Nascondi le talk-cell di aree non selezionate.
  rootEl.querySelectorAll(".talk-cell[data-area-code]").forEach(cell => {
    const code = cell.dataset.areaCode;
    cell.classList.remove("dim");
    cell.classList.toggle(
      "filtered-out",
      !(allSelected || _state.selectedAreas.has(code)),
    );
  });

  // 2. Nascondi le track-column dove tutti i talk sono filtrati.
  rootEl.querySelectorAll(".track-column").forEach(col => {
    const cells = col.querySelectorAll(".talk-cell[data-area-code]");
    if (cells.length === 0) {
      col.classList.remove("filtered-out");
      return;
    }
    const allHidden = [...cells].every(c => c.classList.contains("filtered-out"));
    col.classList.toggle("filtered-out", allHidden);
  });

  // 3. Nascondi le session-block dove tutte le track sono filtrate.
  rootEl.querySelectorAll(".session-block").forEach(block => {
    const cols = block.querySelectorAll(".track-column");
    if (cols.length === 0) return;
    const allHidden = [...cols].every(c => c.classList.contains("filtered-out"));
    block.classList.toggle("filtered-out", allHidden);
  });

  // Riposiziona la linea now (la posizione potrebbe essere cambiata).
  updateNowLine(rootEl);
}

function renderGrid(rootEl) {
  const day = _state.data.program.days.find(d => d.date === _state.selectedDay);
  if (!day) return;
  const grid = rootEl.querySelector("#program-grid");
  grid.innerHTML = "";

  // Header row: time column + 3 rooms
  grid.append(createHeaderCell("", "room-header"));
  ROOMS_ORDER.forEach((room, i) => {
    grid.append(createHeaderCell(translateRoom(room), `room-header room-${slug(room)}`));
  });

  for (const block of day.blocks) {
    if (block.type === "plenary") {
      grid.append(createFullBlock("plenary", block));
    } else if (block.type === "break") {
      grid.append(createFullBlock("break", block));
    } else if (block.type === "session") {
      grid.append(createSessionBlock(block, day));
    }
  }

  applyAreaFilter(rootEl);
  refreshLiveSnapshot(rootEl);
}

// Live snapshot integrato: chiama renderLiveSnapshot solo se il giorno selezionato è oggi.
function refreshLiveSnapshot(rootEl) {
  const host = rootEl.querySelector("#live-snapshot-host");
  if (!host) return;
  const day = _state.data.program.days.find(d => d.date === _state.selectedDay);
  renderLiveSnapshot(host, _state.data, {
    day,
    onTalkClick: _state.onTalkClick,
  });
}


function createHeaderCell(text, cls = "") {
  const div = document.createElement("div");
  div.className = cls;
  div.textContent = text;
  return div;
}

function createFullBlock(type, block) {
  const div = document.createElement("div");
  div.className = "block-full";
  div.dataset.type = type;
  const time = block.start && block.end
    ? `${block.start}–${block.end}`
    : block.start || "";
  // Etichetta blocco: legge title/label/name (fallback chain). field() applica
  // automaticamente la versione _en quando lang=en e disponibile.
  const label = field(block, "title") || field(block, "label") || field(block, "name") || "";
  div.innerHTML = `
    ${time ? `<span class="time">${time}</span>` : ""}
    <span class="label">${escapeHtml(label)}</span>
    ${block.room ? `<span class="chip">${translateRoom(block.room)}</span>` : ""}
  `;
  return div;
}

function createSessionBlock(block, day) {
  const wrap = document.createElement("div");
  wrap.className = "session-block";

  // Calcolo l'unione degli slot orari di tutte le tracks della sessione, così
  // posso allineare orizzontalmente le talk-cell delle 3 aule sulla stessa riga
  // grid (la now-line attraversa la griglia in orizzontale: deve indicare lo
  // stesso slot in tutte le colonne).
  const slotKeys = new Set();
  for (const t of (block.tracks || [])) {
    for (const tk of (t.talks || [])) {
      if (tk.start && tk.end) slotKeys.add(`${tk.start}-${tk.end}`);
    }
  }
  const sortedSlots = Array.from(slotKeys).sort();
  // row 1 = session-track-header, rows 2..(N+1) = uno per slot orario
  const slotRow = new Map(sortedSlots.map((s, i) => [s, i + 2]));

  if (sortedSlots.length > 0) {
    wrap.style.gridTemplateRows = `auto ${sortedSlots.map(() => "auto").join(" ")}`;
  }

  // session id cell (left): span tutta l'altezza del block
  const idCell = document.createElement("div");
  idCell.className = "session-id-cell";
  idCell.textContent = block.session_id;
  if (sortedSlots.length > 0) {
    idCell.style.gridRow = `1 / span ${sortedSlots.length + 1}`;
  }
  wrap.append(idCell);

  // For each room column, render header + talks (or empty placeholder)
  for (const room of ROOMS_ORDER) {
    const track = block.tracks.find(t => t.room === room);
    const col = document.createElement("div");
    col.className = "track-column";
    if (!track) {
      const empty = document.createElement("div");
      empty.className = "talk-cell discussion";
      empty.textContent = "—";
      // span tutta la column su tutte le righe slot
      if (sortedSlots.length > 0) {
        empty.style.gridRow = `1 / span ${sortedSlots.length + 1}`;
      }
      col.append(empty);
    } else {
      // session header row (code + title + chair) — sempre row 1
      const header = document.createElement("div");
      header.className = "session-track-header";
      header.style.gridRow = "1";
      // Su mobile l'header dell'aula globale non è sticky (sarebbe sempre
      // "Aula 5A" anche scrollando dentro Aula 6A/2A stacked). Lo eyebrow
      // .session-track-room mostra l'aula corrente di ogni track-column ed
      // è visibile SOLO via CSS media query mobile.
      header.innerHTML = `
        <span class="session-track-room" aria-hidden="true">${escapeHtml(translateRoom(room))}</span>
        <div><span class="code">${track.code}</span><span class="title">${escapeHtml(field(track, "title") || "")}</span></div>
        ${track.chair ? `<div class="chair">${escapeHtml(track.chair)}</div>` : ""}
      `;
      col.append(header);

      for (const tk of track.talks) {
        const cell = createTalkCell(tk, track, day);
        const sk = tk.start && tk.end ? `${tk.start}-${tk.end}` : null;
        if (sk && slotRow.has(sk)) {
          cell.style.gridRow = String(slotRow.get(sk));
        }
        col.append(cell);
      }
    }
    wrap.append(col);
  }

  return wrap;
}

function createTalkCell(talk, track, day) {
  const paper = _state.data.papersById.get(talk.paper_id);
  const cell = document.createElement("div");
  if (!paper) {
    cell.className = "talk-cell discussion";
    cell.textContent = `#${talk.paper_id} (paper non trovato nel catalogo)`;
    return cell;
  }
  const areaCode = paper.area_code || "other";
  cell.className = `talk-cell area-${areaCode}`;
  cell.dataset.paperId = paper.id;
  cell.dataset.areaCode = areaCode;
  cell.dataset.day = day.date;
  if (talk.start) cell.dataset.start = talk.start;
  if (talk.end)   cell.dataset.end = talk.end;

  const authors = paper.authors?.map(a => a.name).slice(0, 2).join(", ") +
    (paper.authors?.length > 2 ? ", …" : "");

  const time = talk.start && talk.end ? `${talk.start}–${talk.end}` : "";
  const saved = agenda.isSaved(paper.id);

  cell.innerHTML = `
    <div class="talk-icons">
      ${saved ? `<span class="talk-icon saved icon icon--star-filled" title="In agenda" aria-label="In agenda"></span>` : ""}
    </div>
    ${time ? `<div class="talk-time">${time}</div>` : ""}
    <div>
      <span class="talk-id">#${paper.id}</span>
      <span class="talk-title">${escapeHtml(paper.title)}</span>
    </div>
    <div class="talk-author">${escapeHtml(authors || "")}</div>
  `;
  cell.addEventListener("click", () => _state.onTalkClick?.(paper, talk, track, day));
  return cell;
}

function updateNowLine(rootEl) {
  const wrap = rootEl.querySelector(".program-grid-wrap");
  if (!wrap) return;

  // Pulisco eventuali linee precedenti (sia globali, sia per-column).
  wrap.querySelectorAll(".now-line").forEach(el => el.remove());

  const minutes = nowMinutesOfDay(_state.selectedDay);
  if (minutes === null) return;

  const grid = wrap.querySelector("#program-grid");
  if (!grid) return;

  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const label = `ora ${hh}:${mm}`;

  // Su mobile (<= 720px) la griglia diventa stacked: ogni .track-column è una
  // colonna a se. Disegniamo una linea per ciascuna track-column visibile che
  // ha un talk-cell che attraversa l'ora corrente, ancorandola al .track-column
  // (position: relative). Su desktop manteniamo una linea unica orizzontale
  // nel .program-grid-wrap.
  const isMobile = window.matchMedia("(max-width: 720px)").matches;

  if (isMobile) {
    const cols = grid.querySelectorAll(".track-column:not(.filtered-out)");
    cols.forEach(col => {
      const cells = [...col.querySelectorAll(".talk-cell[data-start]:not(.filtered-out)")];
      let target = null;
      for (const cell of cells) {
        const [sh, sm] = cell.dataset.start.split(":").map(Number);
        const [eh, em] = cell.dataset.end.split(":").map(Number);
        const s = sh * 60 + sm;
        const e = eh * 60 + em;
        if (minutes >= s && minutes < e) { target = { cell, s, e }; break; }
      }
      if (!target) return;
      const line = document.createElement("div");
      line.className = "now-line now-line--column";
      line.dataset.label = label;
      const cellRect = target.cell.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const ratio = (minutes - target.s) / (target.e - target.s);
      const y = cellRect.top - colRect.top + cellRect.height * ratio;
      line.style.top = `${y}px`;
      col.style.position = "relative";
      col.append(line);
    });
    return;
  }

  // Desktop: singola linea orizzontale nel wrap, posizionata sul talk-cell
  // corrente (il subgrid garantisce l'allineamento tra le 3 aule sulla stessa
  // riga slot, quindi una sola y va bene).
  const cells = [...grid.querySelectorAll(".talk-cell[data-start]:not(.filtered-out)")];
  let target = null;
  for (const cell of cells) {
    const [sh, sm] = cell.dataset.start.split(":").map(Number);
    const [eh, em] = cell.dataset.end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    if (minutes >= s && minutes < e) { target = { cell, s, e }; break; }
  }
  if (!target) return;
  const line = document.createElement("div");
  line.className = "now-line";
  line.dataset.label = label;
  const cellRect = target.cell.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const ratio = (minutes - target.s) / (target.e - target.s);
  const y = cellRect.top - wrapRect.top + cellRect.height * ratio;
  line.style.top = `${y + wrap.scrollTop}px`;
  wrap.append(line);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

// AIUCD 2026 Companion · rendering Agenda
//
// Diviso in due funzioni esposte:
//   - renderMineList(rootEl, data, onTalkClick): vista "I miei talk" (drawer)
//   - renderPathsOverlay(rootEl, data, onTalkClick): vista "Percorsi suggeriti" (overlay)
//
// renderPath è un wrapper retro-compatibile che inoltra a renderMineList.

import * as agenda from "./agenda.js";
import { getNow } from "./livestate.js";
import { showAgendaMenu } from "./calendar-menu.js?v=f4-5";
import { t, formatDay, getLang, translateRoom, field } from "./i18n.js?v=f4-5";

// Etichette user-facing dei tre criteri di costruzione dei percorsi.
function CRITERIA_LABELS_FN() {
  return getLang() === "en" ? {
    A: "Dive into a theme",
    B: "Explore the whole conference",
    C: "Connect different areas",
  } : {
    A: "Approfondisci un tema",
    B: "Esplora tutto il convegno",
    C: "Connetti aree diverse",
  };
}

function CRITERIA_HINTS_FN() {
  return getLang() === "en" ? {
    A: "Talks tightly connected to a single thread: ideal to go deep on a theme.",
    B: "A cross-cutting overview touching the main conference areas: ideal if you don't want to miss anything.",
    C: "Talks distant from each other by area but united by an idea: ideal for unexpected connections.",
  } : {
    A: "Relazioni strettamente legate a un singolo filo conduttore: ideale per andare in profondità su un tema.",
    B: "Una panoramica trasversale che tocca le aree principali del convegno: ideale se non vuoi perderti nulla.",
    C: "Relazioni lontane fra loro per area ma unite da un'idea: ideale se cerchi connessioni inattese.",
  };
}

function dayLabel(date) {
  return formatDay(date, "long");
}

// =========================================================================
// "I miei talk" view (drawer)
// =========================================================================

const _mineState = {
  data: null,
  root: null,
  onTalkClick: null,
  refreshTimer: null,
  unsubscribeAgenda: null,
};

export function renderMineList(rootEl, data, onTalkClick) {
  _mineState.data = data;
  _mineState.root = rootEl;
  _mineState.onTalkClick = onTalkClick;

  renderMyAgenda();

  // Re-render when agenda changes (so list stays current)
  if (_mineState.unsubscribeAgenda) _mineState.unsubscribeAgenda();
  _mineState.unsubscribeAgenda = agenda.onChange(() => {
    if (_mineState.root && document.body.contains(_mineState.root)) {
      renderMyAgenda();
    }
  });

  // Auto-refresh "live status" every 30s
  if (_mineState.refreshTimer) clearInterval(_mineState.refreshTimer);
  _mineState.refreshTimer = setInterval(() => {
    if (_mineState.root && document.body.contains(_mineState.root)) {
      renderMyAgenda();
    }
  }, 30_000);
}

// Backward-compat wrapper. Some legacy code may still call renderPath; route to mine list.
export function renderPath(rootEl, data, onTalkClick) {
  return renderMineList(rootEl, data, onTalkClick);
}

function renderMyAgenda() {
  const root = _mineState.root;
  if (!root) return;

  const ids = agenda.getAll();
  const isEn = getLang() === "en";
  if (ids.length === 0) {
    root.innerHTML = `
      <div class="my-agenda-empty drawer-empty">
        <strong>${isEn ? "Nothing in your agenda." : "Niente in agenda."}</strong>
        <p>${isEn
          ? "Tap <span class=\"icon icon--star-outline\" aria-hidden=\"true\"></span> on a talk from the Programme or Browse to start. Or add an entire path from <em>Explore the suggested paths</em> in the Programme."
          : "Tocca <span class=\"icon icon--star-outline\" aria-hidden=\"true\"></span> su una relazione dal Programma o da Esplora per cominciare. Oppure aggiungi un percorso intero da <em>Esplora i percorsi</em> nel Programma."}</p>
      </div>
    `;
    return;
  }

  // Resolve each id to its (day, time, room)
  const items = ids.map(id => {
    const slot = findSlot(_mineState.data, id);
    return slot ? { id, ...slot } : null;
  }).filter(Boolean);

  // Sort chronologically
  items.sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));

  // Group by day
  const byDay = new Map();
  for (const it of items) {
    if (!byDay.has(it.day)) byDay.set(it.day, []);
    byDay.get(it.day).push(it);
  }

  // Detect conflicts (same day+start)
  const conflictKeys = new Set();
  const seen = new Map();
  for (const it of items) {
    const key = `${it.day}|${it.start}`;
    if (seen.has(key)) {
      conflictKeys.add(key);
    } else {
      seen.set(key, it);
    }
  }

  // Determine "now" status for each item
  const now = getNow();
  const todayIso = now.toISOString().slice(0, 10);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  function statusOf(it) {
    if (it.day < todayIso) return "past";
    if (it.day > todayIso) return "future";
    const s = toMin(it.start);
    const e = toMin(it.end);
    if (nowMin >= e) return "past";
    if (nowMin >= s && nowMin < e) return "live";
    if (s - nowMin <= 30) return "next";
    return "future";
  }

  // Compute traveler banner
  const live = items.find(it => statusOf(it) === "live");
  const next = items.find(it => statusOf(it) === "next" || statusOf(it) === "future");

  let traveler = "";
  const nowLabel = isEn ? "Now" : "Adesso";
  const nextLabel = isEn ? "Next talk" : "Prossima relazione";
  if (live) {
    const paper = _mineState.data.papersById.get(live.id);
    traveler = `<span class="pulse"></span>${nowLabel}: <strong>#${live.id}</strong> ${isEn ? "in" : "in"} ${translateRoom(live.room)} · ${live.start}–${live.end} · ${escapeHtml(paper?.title?.slice(0, 60) || "")}${(paper?.title?.length || 0) > 60 ? "…" : ""}`;
  } else if (next) {
    const paper = _mineState.data.papersById.get(next.id);
    const minTo = (toMin(next.start) - nowMin);
    if (next.day === todayIso && minTo > 0 && minTo <= 90) {
      traveler = `${nextLabel}: <strong>#${next.id}</strong> ${isEn ? "in" : "in"} ${translateRoom(next.room)} · ${next.start} ${isEn ? `(in ${minTo} min)` : `(tra ${minTo} min)`} · ${escapeHtml(paper?.title?.slice(0, 60) || "")}`;
    } else if (next.day !== todayIso) {
      traveler = `${nextLabel}: <strong>${next.day}</strong> ${isEn ? "at" : "alle"} ${next.start} ${isEn ? "in" : "in"} ${translateRoom(next.room)}.`;
    } else {
      traveler = `${nextLabel}: <strong>${next.start}</strong> ${isEn ? "in" : "in"} ${translateRoom(next.room)}.`;
    }
  } else {
    traveler = isEn ? "Done for today: all the talks in your agenda are over." : "Per oggi è fatta: tutte le relazioni in agenda sono già passate.";
  }

  root.innerHTML = `
    <div class="my-agenda-banner">
      <div class="stat"><span class="count">${items.length}</span> ${isEn ? "talks in your agenda" : "relazioni in agenda"}</div>
      <div class="traveler">${traveler}</div>
      <div class="actions">
        <button class="btn btn-calendar" id="export-cal"><span class="icon icon--calendar" aria-hidden="true"></span> ${t("calendar.menu_label")}</button>
        <button class="btn btn-secondary" id="clear-all" title="${isEn ? "Remove all" : "Rimuovi tutto"}">${isEn ? "Empty" : "Svuota"}</button>
      </div>
    </div>
    ${[...byDay.entries()].map(([day, dayItems]) => `
      <div class="my-agenda-day">
        <h3>${dayLabel(day) || day}</h3>
        ${dayItems.map(it => myAgendaRow(it, statusOf(it), conflictKeys.has(`${it.day}|${it.start}`))).join("")}
      </div>
    `).join("")}
  `;

  // Wire row clicks (open modal)
  root.querySelectorAll(".my-agenda-row[data-paper-id]").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest(".remove-btn")) return;
      const pid = parseInt(row.dataset.paperId, 10);
      const paper = _mineState.data.papersById.get(pid);
      const slot = findSlot(_mineState.data, pid);
      const day = _mineState.data.program.days.find(d => d.date === slot?.day);
      const block = day?.blocks.find(b => b.type === "session" && b.tracks.find(t => t.room === slot?.room));
      const track = block?.tracks.find(t => t.room === slot?.room);
      if (paper && _mineState.onTalkClick) _mineState.onTalkClick(paper, slot, track, day);
    });
  });

  // Remove buttons
  root.querySelectorAll(".remove-btn[data-paper-id]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const pid = parseInt(btn.dataset.paperId, 10);
      agenda.toggle(pid);
    });
  });

  // Calendar export menu (Google / Apple / Outlook / .ics)
  const calBtn = root.querySelector("#export-cal");
  if (calBtn) calBtn.addEventListener("click", e => {
    e.stopPropagation();
    showAgendaMenu(calBtn, items, _mineState.data.papersById);
  });

  // Clear all
  const clearBtn = root.querySelector("#clear-all");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    if (confirm("Svuotare l'agenda? Verranno rimosse tutte le relazioni salvate.")) {
      agenda.clear();
    }
  });
}

function myAgendaRow(it, status, isConflict) {
  const paper = _mineState.data.papersById.get(it.id);
  if (!paper) return "";
  const authors = (paper.authors || []).slice(0, 2).map(a => a.name).join(", ");
  return `
    <div class="my-agenda-row" data-paper-id="${paper.id}" data-status="${status}">
      <div class="when">
        ${it.start}–${it.end}
        <span class="where">${escapeHtml(it.room)}</span>
      </div>
      <div class="what">
        <span class="talk-id">#${paper.id}</span>${escapeHtml(paper.title)}
        ${isConflict ? `<span class="my-agenda-conflict-marker"><span class="icon icon--warning" aria-hidden="true"></span> conflitto</span>` : ""}
        <span class="who">${escapeHtml(authors)}</span>
      </div>
      <button class="remove-btn" data-paper-id="${paper.id}" aria-label="Rimuovi" title="Rimuovi dall'agenda">×</button>
    </div>
  `;
}

// =========================================================================
// Percorsi suggeriti view (overlay full-screen)
// =========================================================================

const _pathsState = {
  data: null,
  root: null,
  onTalkClick: null,
  selectedCriterion: "all",
  selectedPath: null,
};

export function renderPathsOverlay(rootEl, data, onTalkClick, initialPathId = null) {
  _pathsState.data = data;
  _pathsState.root = rootEl;
  _pathsState.onTalkClick = onTalkClick;
  // initialPathId apre direttamente il dettaglio (es. click su tile da Noa);
  // viene validato contro la lista — se l'id non esiste si torna alla lista.
  if (initialPathId && data.paths?.some(p => p.id === initialPathId)) {
    _pathsState.selectedPath = initialPathId;
    const sel = data.paths.find(p => p.id === initialPathId);
    if (sel) _pathsState.selectedCriterion = sel.criterion;
  } else {
    _pathsState.selectedPath = null;
  }

  renderPathsView();
}

function renderPathsView() {
  const root = _pathsState.root;
  root.innerHTML = `
    <div class="ai-disclaimer">
      <span class="badge">IA · revisionato</span>
      <div>
        <strong>Percorsi suggeriti dall'IA, revisionati dal comitato di programma.</strong>
        Quando un percorso include due talk allo stesso orario, vedi entrambe le opzioni — la scelta è tua.
      </div>
    </div>
    <div class="criterion-tabs" role="tablist" id="criterion-tabs"></div>
    <div id="path-list-or-detail"></div>
  `;
  renderCriterionTabs();
  if (_pathsState.selectedPath) renderPathDetail();
  else renderPathList();
}

function renderCriterionTabs() {
  const tabs = _pathsState.root.querySelector("#criterion-tabs");
  const counts = countByCriterion();
  const hints = CRITERIA_HINTS_FN();
  const buttons = [
    { code: "all", label: `Tutti (${_pathsState.data.paths.length})`, hint: "Tutti i percorsi suggeriti." },
    { code: "A",   label: `Approfondisci (${counts.A})`,         hint: hints.A },
    { code: "B",   label: `Esplora (${counts.B})`,                hint: hints.B },
    { code: "C",   label: `Connetti (${counts.C})`,               hint: hints.C },
  ];
  tabs.innerHTML = buttons.map(b => `
    <button class="criterion-tab" role="tab"
      aria-selected="${b.code === _pathsState.selectedCriterion}"
      data-criterion="${b.code}"
      title="${escapeHtml(b.hint)}">${b.label}</button>
  `).join("");
  tabs.querySelectorAll(".criterion-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      _pathsState.selectedCriterion = btn.dataset.criterion;
      _pathsState.selectedPath = null;
      tabs.querySelectorAll(".criterion-tab").forEach(b =>
        b.setAttribute("aria-selected", b.dataset.criterion === _pathsState.selectedCriterion)
      );
      renderPathList();
    });
  });
}

function renderPathList() {
  const area = _pathsState.root.querySelector("#path-list-or-detail");
  const filtered = _pathsState.selectedCriterion === "all"
    ? _pathsState.data.paths
    : _pathsState.data.paths.filter(p => p.criterion === _pathsState.selectedCriterion);

  area.innerHTML = `<div class="paths-list">${filtered.map(p => pathCardHtml(p)).join("")}</div>`;
  area.querySelectorAll(".path-card").forEach(card => {
    card.addEventListener("click", () => {
      _pathsState.selectedPath = card.dataset.pathId;
      renderPathDetail();
    });
  });
}

function pathCardHtml(path) {
  const conflictCount = path.conflict_paper_ids.length;
  return `
    <div class="path-card" data-path-id="${path.id}" data-criterion="${path.criterion}">
      <div class="path-id" title="${escapeHtml(CRITERIA_HINTS_FN()[path.criterion] || "")}">${path.criterion}${path.id.slice(1)} · ${CRITERIA_LABELS_FN()[path.criterion]}</div>
      <div class="path-name">${escapeHtml(path.name)}</div>
      <div class="path-intro">${escapeHtml(path.intro)}</div>
      <div class="path-meta">
        <span class="chip">${path.paper_ids.length} talk</span>
        ${conflictCount > 0 ? `<span class="chip conflict-chip"><span class="icon icon--warning" aria-hidden="true"></span> ${conflictCount} ${conflictCount === 1 ? "scelta" : "scelte"}</span>` : ""}
      </div>
    </div>
  `;
}

function renderPathDetail() {
  const area = _pathsState.root.querySelector("#path-list-or-detail");
  const path = _pathsState.data.paths.find(p => p.id === _pathsState.selectedPath);
  if (!path) { renderPathList(); return; }

  const items = [];
  for (const pid of path.paper_ids) {
    const slot = findSlot(_pathsState.data, pid);
    if (slot) items.push({ paper_id: pid, ...slot });
  }
  items.sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));

  const byTime = new Map();
  for (const it of items) {
    const key = `${it.day}|${it.start}`;
    if (!byTime.has(key)) byTime.set(key, []);
    byTime.get(key).push(it);
  }

  const days = [...new Set(items.map(it => it.day))].sort();
  const allInAgenda = path.paper_ids.every(pid => agenda.isSaved(pid));
  const someInAgenda = path.paper_ids.some(pid => agenda.isSaved(pid));

  area.innerHTML = `
    <div class="path-detail">
      <div class="path-detail-head">
        <button class="back-btn" id="back-btn">← Tutti i percorsi</button>
        <div>
          <h3>${escapeHtml(path.name)}</h3>
          <div class="intro">${escapeHtml(path.intro)}</div>
          <div class="path-meta" style="margin-top:12px">
            <span class="chip" title="${escapeHtml(CRITERIA_HINTS_FN()[path.criterion] || "")}">${path.criterion} · ${CRITERIA_LABELS_FN()[path.criterion]}</span>
            <span class="chip">${items.length} ${getLang() === "en" ? "talks" : "relazioni"}</span>
            ${path.conflict_paper_ids.length > 0
              ? `<span class="chip conflict-chip"><span class="icon icon--warning" aria-hidden="true"></span> ${countConflictGroups(byTime)} ${countConflictGroups(byTime) === 1 ? (getLang() === "en" ? "choice" : "scelta") : (getLang() === "en" ? "choices" : "scelte")} ${getLang() === "en" ? "to make" : "da fare"}</span>`
              : ""}
          </div>
          <button class="btn ${allInAgenda ? 'btn-saved' : 'btn-primary'} add-all-btn" id="add-all-btn">
            ${allInAgenda
              ? `<span class="icon icon--star-filled" aria-hidden="true"></span> Tutte le ${items.length} relazioni già in agenda — rimuovi`
              : someInAgenda
                ? `<span class="icon icon--star-filled" aria-hidden="true"></span> Aggiungi le altre ${items.length - path.paper_ids.filter(pid => agenda.isSaved(pid)).length} all'agenda`
                : `<span class="icon icon--star-outline" aria-hidden="true"></span> Aggiungi tutto il percorso (${items.length} relazioni) all'agenda`}
          </button>
        </div>
      </div>
      ${path.intro_voice ? `
      <div class="path-noa-intro" role="note" aria-label="Introduzione di Noa">
        <span class="noa-glyph glyph glyph--memories" aria-hidden="true"></span>
        <p>${escapeHtml(path.intro_voice)}</p>
      </div>
      ` : ""}
      <div class="path-timeline">
        ${days.map(d => renderDayTimeline(d, byTime, path)).join("")}
      </div>
    </div>
  `;
  area.querySelector("#back-btn").addEventListener("click", () => {
    _pathsState.selectedPath = null;
    renderPathList();
  });
  area.querySelector("#add-all-btn").addEventListener("click", () => {
    if (allInAgenda) {
      agenda.removeMany(path.paper_ids);
    } else {
      agenda.addMany(path.paper_ids);
    }
    renderPathDetail();
  });
  area.querySelectorAll(".timeline-talk[data-paper-id], .conflict-option[data-paper-id]").forEach(el => {
    el.addEventListener("click", () => {
      const pid = parseInt(el.dataset.paperId, 10);
      const paper = _pathsState.data.papersById.get(pid);
      const slot = findSlot(_pathsState.data, pid);
      const day = _pathsState.data.program.days.find(d => d.date === slot?.day);
      const block = day?.blocks.find(b => b.type === "session" && b.tracks.find(t => t.room === slot?.room));
      const track = block?.tracks.find(t => t.room === slot?.room);
      if (paper && _pathsState.onTalkClick) _pathsState.onTalkClick(paper, slot, track, day);
    });
  });
}

function renderDayTimeline(date, byTime, path) {
  const entries = [...byTime.entries()]
    .filter(([key]) => key.startsWith(date + "|"))
    .map(([, items]) => items)
    .sort((a, b) => a[0].start.localeCompare(b[0].start));

  return `
    <div class="timeline-day">
      <div class="timeline-day-header">${dayLabel(date) || date}</div>
      ${entries.map(items => items.length === 1
        ? renderSingleTalk(items[0])
        : renderConflict(items, path)
      ).join("")}
    </div>
  `;
}

function renderSingleTalk(item) {
  const paper = _pathsState.data.papersById.get(item.paper_id);
  if (!paper) return "";
  const authors = (paper.authors || []).slice(0, 2).map(a => a.name).join(", ");
  return `
    <div class="timeline-talk" data-paper-id="${paper.id}">
      <div>
        <div class="when">${item.start}–${item.end}</div>
        <div class="where">${item.room}</div>
      </div>
      <div>
        <span class="talk-id">#${paper.id}</span>
        <span class="what">${escapeHtml(paper.title)}</span>
        <div class="who">${escapeHtml(authors)}</div>
      </div>
    </div>
  `;
}

function renderConflict(items, path) {
  const time = `${items[0].start}–${items[0].end}`;
  return `
    <div class="timeline-conflict">
      <div class="timeline-conflict-header">conflitto orario · scegli quale seguire</div>
      <div class="conflict-options">
        <div class="when">${time}</div>
        ${items.map((it, i) => {
          const paper = _pathsState.data.papersById.get(it.paper_id);
          if (!paper) return "";
          const authors = (paper.authors || []).slice(0, 2).map(a => a.name).join(", ");
          return `
            <div class="conflict-option" data-paper-id="${paper.id}">
              <div class="where">${it.room}</div>
              <div class="what"><span class="talk-id">#${paper.id}</span>${escapeHtml(paper.title)}</div>
              <div class="who">${escapeHtml(authors)}</div>
            </div>
            ${i < items.length - 1 ? '<div class="conflict-vs">oppure</div>' : ''}
          `;
        }).join("")}
      </div>
    </div>
  `;
}

// =========================================================================
// helpers
// =========================================================================

function findSlot(data, paperId) {
  for (const day of data.program.days) {
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

function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function countByCriterion() {
  const c = { A: 0, B: 0, C: 0 };
  for (const p of _pathsState.data.paths) c[p.criterion]++;
  return c;
}

function countConflictGroups(byTime) {
  let n = 0;
  for (const items of byTime.values()) {
    if (items.length > 1) n++;
  }
  return n;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

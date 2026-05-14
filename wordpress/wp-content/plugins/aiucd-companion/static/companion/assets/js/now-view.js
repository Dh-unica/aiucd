// AIUCD 2026 Companion · live snapshot integrato nel tab Programma.
// Nota: la vecchia vista "In corso" (renderNow) è stata fusa nel tab Programma
// nello Sprint A1 (2026-05-09) ed è stata rimossa nello Sprint A2.

import { getNow } from "./livestate.js";

const ROOMS = ["Aula 5A", "Aula 6A", "Aula 8A"];

// =====================================================================
// LIVE SNAPSHOT — versione compatta per integrazione nel tab Programma
// =====================================================================

/**
 * Renderizza una snapshot compatta dello stato live nel container dato.
 * Mostra contenuto solo se day.date corrisponde a oggi e siamo dentro
 * l'orario delle sessioni. Altrimenti svuota il container (no rumore).
 *
 * @param {HTMLElement} rootEl - container dove appendere lo snapshot
 * @param {object}      data   - struttura dati completa (papersById, program)
 * @param {object}      opts   - { day, onTalkClick }
 */
export function renderLiveSnapshot(rootEl, data, opts = {}) {
  if (!rootEl) return;
  const { day, onTalkClick } = opts;
  if (!day) { rootEl.innerHTML = ""; return; }

  const now = getNow();
  const today = now.toISOString().slice(0, 10);

  // Nessuno snapshot se il giorno selezionato non è oggi.
  if (day.date !== today) { rootEl.innerHTML = ""; return; }

  // Calcola i bounds del giorno per capire se siamo prima/durante/dopo le sessioni.
  let dayStart = null, dayEnd = null;
  for (const b of day.blocks || []) {
    if (b.start) {
      const s = parseTime(day.date, b.start);
      if (!dayStart || s < dayStart) dayStart = s;
    }
    if (b.end) {
      const e = parseTime(day.date, b.end);
      if (!dayEnd || e > dayEnd) dayEnd = e;
    }
    if (b.type === "session") {
      for (const t of b.tracks) {
        for (const tk of t.talks) {
          if (tk.start) { const s = parseTime(day.date, tk.start); if (!dayStart || s < dayStart) dayStart = s; }
          if (tk.end)   { const e = parseTime(day.date, tk.end);   if (!dayEnd   || e > dayEnd)   dayEnd   = e; }
        }
      }
    }
  }

  // Fuori orario sessioni in un giorno di convegno: messaggio breve.
  if (dayStart && now < dayStart) {
    const minTo = Math.round((dayStart - now) / 60000);
    rootEl.innerHTML = `
      <div class="live-snapshot is-empty">
        <span class="snap-pulse" aria-hidden="true"></span>
        Le sessioni di oggi iniziano <strong>tra ${minTo} min</strong>
        (${formatHHMM(dayStart)}).
      </div>`;
    return;
  }
  if (dayEnd && now >= dayEnd) {
    rootEl.innerHTML = `
      <div class="live-snapshot is-empty">
        Le sessioni di oggi sono terminate alle <strong>${formatHHMM(dayEnd)}</strong>.
      </div>`;
    return;
  }

  // Stato live: strip + mini-cards delle aule.
  const liveCount = countLive(now, day);
  const nextChange = nextChangeAt(now, day);
  const plenary = day.blocks.find(b =>
    b.type === "plenary" && timeBetween(now, day.date, b.start, b.end)
  );

  const summaryHtml = liveCount > 0
    ? `<span class="snap-pulse" aria-hidden="true"></span><strong>${liveCount}</strong> relazioni in corso`
    : `Tutte le aule in pausa`;
  const changeHtml = nextChange
    ? ` · prossimo cambio <strong>fra ${nextChange.minutes} min</strong>`
    : "";

  rootEl.innerHTML = `
    <div class="live-snapshot">
      <div class="live-snapshot-strip">
        <span class="snap-time">${formatHHMM(now)}</span>
        <span class="snap-summary">${summaryHtml}${changeHtml}</span>
        <span class="snap-tag">in tempo reale</span>
      </div>
      <div class="live-snapshot-rooms"></div>
    </div>`;

  const roomsContainer = rootEl.querySelector(".live-snapshot-rooms");

  if (plenary) {
    roomsContainer.append(makeMiniCardForPlenary(plenary, day));
  }
  for (const room of ROOMS) {
    const info = findRoomSessionAt(now, day, room);
    roomsContainer.append(makeMiniCardForRoom(room, day, now, info, data, onTalkClick));
  }
}

function makeMiniCardForPlenary(block, day) {
  const card = document.createElement("div");
  card.className = "snap-card";
  card.dataset.state = "live";
  const pct = progressOf(block, day);
  card.innerHTML = `
    <div class="snap-card-head">
      <span class="snap-room">Aula Capitini</span>
      <span class="snap-state">Plenaria</span>
    </div>
    <div class="snap-talk">${escapeHtml(block.title || "")}</div>
    <div class="snap-meta">${block.start}–${block.end} · ${pct}%</div>
    <div class="snap-progress"><div class="snap-progress-fill" style="width:${pct}%"></div></div>
  `;
  return card;
}

function makeMiniCardForRoom(room, day, now, info, data, onTalkClick) {
  const card = document.createElement("div");
  card.className = "snap-card";

  if (!info) {
    card.dataset.state = "finished";
    card.innerHTML = `
      <div class="snap-card-head">
        <span class="snap-room">${escapeHtml(room)}</span>
        <span class="snap-state">Concluso</span>
      </div>
      <div class="snap-talk snap-talk-empty">Per ora in questa aula non c'è niente.</div>`;
    return card;
  }

  const { track, talk, next, state, session } = info;
  card.dataset.state = state;

  const stateLabel = ({
    live: "In corso",
    discussion: "Discussione",
    break: "Pausa",
    upcoming: "Tra poco",
    finished: "Concluso",
  })[state] || "—";

  if (state === "live" && talk) {
    const paper = data.papersById.get(talk.paper_id);
    const pct = progressOf(talk, day);
    const left = minutesLeft(talk, day);
    card.innerHTML = `
      <div class="snap-card-head">
        <span class="snap-room">${escapeHtml(room)}</span>
        <span class="snap-state">${stateLabel}</span>
      </div>
      <div class="snap-talk" data-paper-id="${talk.paper_id}">${escapeHtml(paper?.title || `#${talk.paper_id}`)}</div>
      <div class="snap-meta">${session?.session_id || ""}${track?.code ? " · " + track.code : ""} · ${talk.start}–${talk.end} · ${left} min residui</div>
      <div class="snap-progress"><div class="snap-progress-fill" style="width:${pct}%"></div></div>
    `;
    const t = card.querySelector(".snap-talk[data-paper-id]");
    if (t && onTalkClick && paper) {
      t.style.cursor = "pointer";
      t.addEventListener("click", () => onTalkClick(paper, talk, track, day));
    }
    return card;
  }

  // discussion / break / upcoming
  const nextPaper = next ? data.papersById.get(next.paper_id) : null;
  card.innerHTML = `
    <div class="snap-card-head">
      <span class="snap-room">${escapeHtml(room)}</span>
      <span class="snap-state">${stateLabel}</span>
    </div>
    <div class="snap-talk snap-talk-empty">${
      state === "discussion"
        ? `Discussione finale ${session?.session_id || ""}.`
        : nextPaper
          ? `Prossimo: ${escapeHtml(nextPaper.title)}`
          : "—"
    }</div>
    ${next?.start ? `<div class="snap-meta">Riprende alle <strong>${next.start}</strong></div>` : ""}
  `;
  return card;
}

// ---- helpers --------------------------------------------------------

function parseTime(date, hhmm) {
  const [Y, M, D] = date.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Y, M - 1, D, h, m, 0);
}

function timeBetween(now, date, start, end) {
  if (!start || !end) return false;
  return now >= parseTime(date, start) && now < parseTime(date, end);
}

function progressOf(item, day) {
  if (!item.start || !item.end) return 0;
  const now = getNow();
  const s = parseTime(day.date, item.start);
  const e = parseTime(day.date, item.end);
  if (now < s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

function minutesLeft(item, day) {
  if (!item.end) return 0;
  const now = getNow();
  const e = parseTime(day.date, item.end);
  return Math.max(0, Math.round((e - now) / 60000));
}

function findRoomSessionAt(now, day, room) {
  // Look across the day's blocks for any session that contains this room.
  // Determine the "current state" of that room.
  const sessions = day.blocks.filter(b => b.type === "session");
  for (const session of sessions) {
    const track = session.tracks.find(t => t.room === room);
    if (!track) continue;
    // Live talk?
    for (let i = 0; i < track.talks.length; i++) {
      const talk = track.talks[i];
      if (timeBetween(now, day.date, talk.start, talk.end)) {
        return {
          session, track, talk, next: track.talks[i + 1] || null, state: "live",
        };
      }
    }
    // Are we within session bounds but between talks (discussion)?
    const talks = track.talks.filter(t => t.start && t.end);
    if (talks.length) {
      const sessionStart = parseTime(day.date, talks[0].start);
      const sessionEnd = parseTime(day.date, talks[talks.length - 1].end);
      // discussion = 20 min after last talk, conventional
      const discussionEnd = new Date(sessionEnd.getTime() + 20 * 60000);
      if (now >= sessionEnd && now < discussionEnd) {
        return { session, track, talk: null, next: null, state: "discussion" };
      }
      if (now >= sessionStart && now < sessionEnd) {
        // between two talks somehow
        const next = talks.find(t => parseTime(day.date, t.start) > now);
        return { session, track, talk: null, next, state: "live" };
      }
      if (now < sessionStart) {
        // upcoming
        const breakBefore = day.blocks.find(b => b.type === "break" &&
          timeBetween(now, day.date, b.start, b.end));
        if (breakBefore) {
          return { session, track, talk: null, next: talks[0], state: "break" };
        }
        return { session, track, talk: null, next: talks[0], state: "upcoming" };
      }
    }
  }
  // No session contains "now" — fallback: pick the next session with this room
  const futureSession = sessions.find(s => s.tracks.find(t => t.room === room && t.talks.find(tt => tt.start && parseTime(day.date, tt.start) > now)));
  if (futureSession) {
    const track = futureSession.tracks.find(t => t.room === room);
    const next = track.talks.find(tt => tt.start && parseTime(day.date, tt.start) > now);
    return { session: futureSession, track, talk: null, next, state: "break" };
  }
  return null;
}

function countLive(now, day) {
  let count = 0;
  for (const block of day.blocks) {
    if (block.type === "session") {
      for (const t of block.tracks) {
        for (const tk of t.talks) {
          if (timeBetween(now, day.date, tk.start, tk.end)) count++;
        }
      }
    } else if (block.type === "plenary") {
      if (timeBetween(now, day.date, block.start, block.end)) count++;
    }
  }
  return count;
}

function nextChangeAt(now, day) {
  const events = [];
  for (const block of day.blocks) {
    if (block.start) events.push(parseTime(day.date, block.start));
    if (block.end)   events.push(parseTime(day.date, block.end));
    if (block.type === "session") {
      for (const t of block.tracks) {
        for (const tk of t.talks) {
          if (tk.start) events.push(parseTime(day.date, tk.start));
          if (tk.end)   events.push(parseTime(day.date, tk.end));
        }
      }
    }
  }
  const future = events.filter(e => e > now).sort((a, b) => a - b);
  if (!future.length) return null;
  const minutes = Math.round((future[0] - now) / 60000);
  return { minutes, time: future[0] };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

function formatHHMM(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

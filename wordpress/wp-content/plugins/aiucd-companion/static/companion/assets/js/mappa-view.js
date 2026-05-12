// AIUCD 2026 Companion · vista Mappa (Campus Sa Duchessa, Corpo Aggiunto)
// Mostra le piante reali (PDF rasterizzato) del Corpo aggiunto con marker
// cliccabili sopra le aule. Lo stato live è calcolato come prima.

import { getNow } from "./livestate.js";

let _state = {
  data: null,
  root: null,
  selectedRoom: null,
  selectedFloor: "primo-piano",
  onTalkClick: null,
  timer: null,
};

const ROOMS = ["Aula Capitini", "Aula 5A", "Aula 6A", "Aula 2A"];

// Posizione percentuale del marker sulla relativa immagine di piano.
// Coordinate misurate pixel-per-pixel sull'immagine 1600×1131 del PDF
// e convertite in % (centro + dimensioni della bbox). Il rettangolo coincide
// con il perimetro reale di muratura della stanza.
const ROOM_LAYOUT = {
  "Aula Capitini": {
    floor: "primo-piano",
    top: 23.78, left: 46.56,
    width: 19.38, height: 33.78,
  },
  "Aula 5A": {
    floor: "primo-piano",
    top: 59.02, left: 33.75,
    width: 18.12, height: 11.94,
  },
  "Aula 6A": {
    floor: "primo-piano",
    top: 59.02, left: 65.78,
    width: 17.81, height: 11.94,
  },
  "Aula 2A": {
    floor: "primo-piano",
    top: 84.44, left: 33.75,
    width: 18.12, height: 15.03,
  },
};

const ROOM_DESCRIPTIONS = {
  "Aula Capitini": {
    location: "Corpo aggiunto · primo piano",
    role: "Plenarie, keynote e cerimonie del convegno",
    travel: "Dall'ingresso del Corpo aggiunto: scala o ascensore al primo piano. L'Aula Magna è la prima sala in cima alle scale; l'Area Poster si trova nello spazio antistante.",
  },
  "Aula 5A": {
    location: "Corpo aggiunto · primo piano · ala ovest",
    role: "Sessioni parallele track A",
    travel: "Al primo piano, attraversa l'Area Poster verso sud e prosegui sul corridoio: Aula 5A è la prima sala sulla sinistra.",
  },
  "Aula 6A": {
    location: "Corpo aggiunto · primo piano · ala est",
    role: "Sessioni parallele track B",
    travel: "Al primo piano, attraversa l'Area Poster verso sud: Aula 6A è la prima sala sulla destra, di fronte ad Aula 5A.",
  },
  "Aula 2A": {
    location: "Corpo aggiunto · primo piano · estremità sud",
    role: "Sessioni parallele track C",
    travel: "Al primo piano, scendi lungo il corridoio centrale oltre Aula 5A e Aula 6A: Aula 2A è la sala in fondo, sul lato sud-ovest.",
  },
};

// Quando il companion gira dentro WP, le immagini stanno sotto wp-content/plugins/
// raggiungibili via window.AIUCD_BASE_URL. In standalone restano paths relativi.
const ASSET_BASE = (typeof window !== "undefined" && window.AIUCD_BASE_URL)
  ? window.AIUCD_BASE_URL.replace(/\/$/, "") + "/"
  : "";

const FLOORS = [
  {
    id: "primo-piano",
    label: "Primo piano",
    img: ASSET_BASE + "assets/img/mappa/primo-piano.jpg",
    alt: "Pianta del primo piano del Corpo aggiunto: Aula Magna Capitini, Area Poster, Aula 5A, Aula 6A, Aula 2A.",
    caption: "Tutte le sessioni e le plenarie si tengono qui. L'Area Poster è davanti all'Aula Capitini.",
  },
  {
    id: "piano-terra",
    label: "Piano terra",
    img: ASSET_BASE + "assets/img/mappa/piano-terra.jpg",
    alt: "Pianta del piano terra del Corpo aggiunto: ingressi, Aula Specchi, area catering.",
    caption: "Ingressi al campus, area catering nel giardino esterno. Sali al primo piano per le aule del convegno.",
  },
];

export function renderMappa(rootEl, data, onTalkClick) {
  _state.data = data;
  _state.root = rootEl;
  _state.onTalkClick = onTalkClick;

  // Indicazioni stradali Google Maps verso la sede: coordinate Facoltà di
  // Studi Umanistici, Sa Duchessa. `dir/?api=1&destination=…` apre l'app
  // Maps su mobile o la web app su desktop, partendo automaticamente dalla
  // posizione corrente dell'utente (utile per chi arriva in treno/nave).
  const VENUE_LAT = 39.2288167208065;
  const VENUE_LON = 9.111890995970645;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${VENUE_LAT}%2C${VENUE_LON}&travelmode=walking`;

  rootEl.innerHTML = `
    <div class="section-head">
      <h2><span class="sub-mark"></span>Sede del convegno</h2>
      <p class="section-sub">Campus Sa Duchessa — Corpo aggiunto. Tap su un'aula per stato in tempo reale e indicazioni.</p>
      <a class="venue-directions-btn"
         href="${directionsUrl}"
         target="_blank"
         rel="noopener"
         aria-label="Apri Google Maps con le indicazioni dalla tua posizione alla sede del convegno">
        <span class="icon icon--compass" aria-hidden="true"></span>
        <span>Come arrivare alla sede · indicazioni con Google Maps</span>
      </a>
    </div>
    <div class="mappa-layout">
      <div class="mappa-canvas">
        <div class="mappa-floors-tabs" role="tablist" aria-label="Piani del Corpo aggiunto">
          ${FLOORS.map(f => `
            <button type="button"
                    role="tab"
                    class="mappa-floor-tab"
                    data-floor="${f.id}"
                    aria-selected="${f.id === _state.selectedFloor}">
              ${f.label}
            </button>
          `).join("")}
        </div>
        <div class="mappa-floor-stage" id="mappa-floor-stage">
          ${buildFloorView(_state.selectedFloor)}
        </div>
        <div class="mappa-legend">
          <span class="mappa-legend-item"><span class="dot live"></span>Relazione in corso</span>
          <span class="mappa-legend-item"><span class="dot discussion"></span>Discussione</span>
          <span class="mappa-legend-item"><span class="dot break"></span>Pausa / non in uso</span>
          <span class="mappa-legend-item"><span class="dot upcoming"></span>In programma</span>
          <span class="mappa-legend-item"><span class="dot finished"></span>Concluso</span>
        </div>
      </div>
      <div class="mappa-side" id="mappa-side">
        <div class="empty">Tap su un'aula per vedere cosa avviene adesso e come arrivarci.</div>
      </div>
    </div>
  `;

  wireFloorTabs();
  wireRoomMarkers();
  refreshStates();
  if (_state.timer) clearInterval(_state.timer);
  _state.timer = setInterval(refreshStates, 30_000);

  // Listen for cross-tab "goto room" events from the talk modal
  window.addEventListener("companion:goto-room", e => {
    if (e.detail?.room) selectRoom(e.detail.room);
  });
}

export function selectRoomExternal(room) {
  selectRoom(room);
}

function buildFloorView(floorId) {
  const floor = FLOORS.find(f => f.id === floorId);
  if (!floor) return "";
  const markers = Object.entries(ROOM_LAYOUT)
    .filter(([, layout]) => layout.floor === floorId)
    .map(([name, layout]) => {
      const trackLabel = ({
        "Aula Capitini": "PLENARIE",
        "Aula 5A": "TRACK A",
        "Aula 6A": "TRACK B",
        "Aula 2A": "TRACK C",
      })[name] || "";
      return `
        <button type="button"
                class="room-marker"
                data-room="${escapeAttr(name)}"
                style="top:${layout.top}%; left:${layout.left}%; width:${layout.width}%; height:${layout.height}%;"
                aria-label="${escapeAttr(name)} — stato live">
          <span class="room-marker-name">${escapeHtml(name.replace("Aula ", ""))}</span>
          ${trackLabel ? `<span class="room-marker-tag">${trackLabel}</span>` : ""}
        </button>
      `;
    }).join("");

  return `
    <figure class="mappa-floor-figure">
      <div class="mappa-floor-canvas">
        <img class="mappa-floor-img" src="${floor.img}" alt="${escapeAttr(floor.alt)}" loading="lazy" />
        <div class="mappa-markers" aria-hidden="${floorId !== "primo-piano" ? "true" : "false"}">
          ${markers}
        </div>
      </div>
      <figcaption class="mappa-floor-caption">${escapeHtml(floor.caption)}</figcaption>
    </figure>
  `;
}

function wireFloorTabs() {
  const tabs = _state.root.querySelectorAll(".mappa-floor-tab");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const floor = btn.dataset.floor;
      if (floor === _state.selectedFloor) return;
      _state.selectedFloor = floor;
      tabs.forEach(t => t.setAttribute("aria-selected", t.dataset.floor === floor ? "true" : "false"));
      const stage = _state.root.querySelector("#mappa-floor-stage");
      if (stage) {
        stage.innerHTML = buildFloorView(floor);
        wireRoomMarkers();
        refreshStates();
      }
    });
  });
}

function wireRoomMarkers() {
  const markers = _state.root.querySelectorAll(".room-marker[data-room]");
  markers.forEach(btn => {
    btn.addEventListener("click", () => selectRoom(btn.dataset.room));
  });
}

function selectRoom(roomName) {
  // Se il marker è su un piano diverso, switcha al piano giusto prima.
  const layout = ROOM_LAYOUT[roomName];
  if (layout && layout.floor !== _state.selectedFloor) {
    _state.selectedFloor = layout.floor;
    _state.root.querySelectorAll(".mappa-floor-tab").forEach(t => {
      t.setAttribute("aria-selected", t.dataset.floor === layout.floor ? "true" : "false");
    });
    const stage = _state.root.querySelector("#mappa-floor-stage");
    if (stage) {
      stage.innerHTML = buildFloorView(layout.floor);
      wireRoomMarkers();
    }
  }
  _state.selectedRoom = roomName;
  _state.root.querySelectorAll(".room-marker[data-room]").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.room === roomName);
  });
  refreshStates();
  renderSidePanel();
}

function refreshStates() {
  const now = getNow();
  const today = now.toISOString().slice(0, 10);
  const day = _state.data.program.days.find(d => d.date === today);

  for (const room of ROOMS) {
    const btn = _state.root.querySelector(`.room-marker[data-room="${cssEscape(room)}"]`);
    if (!btn) continue;
    const info = computeRoomState(now, day, room);
    btn.dataset.state = info.state;
  }

  // Refresh side panel if a room is selected
  if (_state.selectedRoom) renderSidePanel();
}

function renderSidePanel() {
  const side = _state.root.querySelector("#mappa-side");
  if (!_state.selectedRoom) {
    side.innerHTML = `<div class="empty">Tap su un'aula per vedere cosa avviene adesso e come arrivarci.</div>`;
    side.removeAttribute("data-state");
    return;
  }

  const room = _state.selectedRoom;
  const desc = ROOM_DESCRIPTIONS[room] || {};
  const now = getNow();
  const today = now.toISOString().slice(0, 10);
  const day = _state.data.program.days.find(d => d.date === today);
  const info = computeRoomState(now, day, room);
  side.dataset.state = info.state;

  const stateLabel = ({
    live: "Relazione in corso",
    discussion: "Discussione",
    break: "In pausa",
    upcoming: "In programma",
    finished: "Concluso",
    closed: "Non in uso oggi",
  })[info.state] || "—";

  let liveBlock = "";
  if (info.state === "live" && info.talk) {
    const paper = _state.data.papersById.get(info.talk.paper_id);
    if (paper) {
      const authors = (paper.authors || []).slice(0, 2).map(a => a.name).join(", ");
      liveBlock = `
        <div class="talk-now-block" data-paper-id="${paper.id}">
          <div class="when">${info.talk.start}–${info.talk.end} · in corso</div>
          <div class="what">#${paper.id} ${escapeHtml(paper.title)}</div>
          <div class="who">${escapeHtml(authors)}</div>
        </div>
      `;
    }
  } else if (info.next) {
    const paper = _state.data.papersById.get(info.next.paper_id);
    if (paper) {
      const authors = (paper.authors || []).slice(0, 2).map(a => a.name).join(", ");
      liveBlock = `
        <div class="talk-now-block" data-paper-id="${paper.id}">
          <div class="when">prossimo · ${info.next.start}</div>
          <div class="what">#${paper.id} ${escapeHtml(paper.title)}</div>
          <div class="who">${escapeHtml(authors)}</div>
        </div>
      `;
    }
  }

  side.innerHTML = `
    <div class="room-title">${escapeHtml(room)}</div>
    <span class="room-state-badge">${stateLabel}</span>
    ${desc.role ? `<div style="font-size: var(--fs-xs); color: var(--muted); margin-bottom: var(--space-sm);">${escapeHtml(desc.role)}</div>` : ""}
    ${liveBlock}
    <h4>Posizione</h4>
    <div style="font-size: var(--fs-sm);">${escapeHtml(desc.location || "")}</div>
    <h4>Come arrivarci</h4>
    <div class="mappa-tip">${escapeHtml(desc.travel || "—")}</div>
  `;

  // Click on a talk block opens the modal
  const block = side.querySelector(".talk-now-block");
  if (block) {
    block.addEventListener("click", () => {
      const pid = parseInt(block.dataset.paperId, 10);
      const paper = _state.data.papersById.get(pid);
      if (paper && _state.onTalkClick) _state.onTalkClick(paper);
    });
  }
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

function computeRoomState(now, day, room) {
  if (!day) return { state: "upcoming" };

  // Capitini: plenary blocks
  if (room === "Aula Capitini") {
    const livePlenary = day.blocks.find(b =>
      b.type === "plenary" && timeBetween(now, day.date, b.start, b.end)
    );
    if (livePlenary) return { state: "live", plenary: livePlenary };
    const futurePlenary = day.blocks.find(b =>
      b.type === "plenary" && b.start && parseTime(day.date, b.start) > now
    );
    if (futurePlenary) return { state: "upcoming" };
    const pastPlenary = day.blocks.find(b =>
      b.type === "plenary" && b.end && parseTime(day.date, b.end) < now
    );
    if (pastPlenary) return { state: "finished" };
    return { state: "closed" };
  }

  // Other rooms: parallel sessions
  const sessions = day.blocks.filter(b => b.type === "session");
  for (const session of sessions) {
    const track = session.tracks.find(t => t.room === room);
    if (!track) continue;
    for (let i = 0; i < track.talks.length; i++) {
      const talk = track.talks[i];
      if (timeBetween(now, day.date, talk.start, talk.end)) {
        return { state: "live", session, track, talk, next: track.talks[i+1] || null };
      }
    }
    // Check if we're in discussion period (after last talk + 20 min)
    const talks = track.talks.filter(t => t.start && t.end);
    if (talks.length) {
      const lastEnd = parseTime(day.date, talks[talks.length - 1].end);
      const discEnd = new Date(lastEnd.getTime() + 20 * 60_000);
      if (now >= lastEnd && now < discEnd) {
        return { state: "discussion", session, track };
      }
    }
  }

  // Look for upcoming session with this room today
  for (const session of sessions) {
    const track = session.tracks.find(t => t.room === room);
    if (!track) continue;
    const upcoming = track.talks.find(t => t.start && parseTime(day.date, t.start) > now);
    if (upcoming) return { state: "break", session, track, next: upcoming };
  }

  // Past today, no future
  for (const session of sessions) {
    const track = session.tracks.find(t => t.room === room);
    if (!track) continue;
    return { state: "finished", session, track };
  }

  return { state: "closed" };
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function cssEscape(s) {
  return s.replace(/"/g, '\\"');
}

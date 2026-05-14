// AIUCD 2026 Companion · Noa drawer (Sprint B1 iter 2, 2026-05-10)
// Architettura rivisitata: Noa è un FAB sempre visibile + drawer richiamabile.
// Sostituisce l'onboarding banner statico, il banner CTA percorsi e il gap-tip
// standalone che vivevano nel Programma. Tutto il contenuto di Noa è ora qui.

import * as agenda from "./agenda.js";
import { liveState, getNow } from "./livestate.js";
import { t, getLang } from "./i18n.js?v=f4-4";
import { getGapSuggestion, NOA_VOICE_TONE } from "./avatar.js?v=noa1";
import { createDrawer } from "./drawer-controller.js";

let _state = {
  root: null,
  data: null,
  drawer: null,   // istanza createDrawer
};

const NOA_SEEN_KEY = "aiucd2026-noa-seen";

const CRITERIA_LABELS = {
  A: "Approfondisci un tema",
  B: "Esplora tutto il convegno",
  C: "Connetti aree diverse",
};

export function initNoaDrawer(data) {
  _state.data = data;

  const root = document.getElementById("noa-drawer");
  const backdrop = document.getElementById("noa-drawer-backdrop");
  const fab = document.getElementById("noa-fab");
  if (!root || !fab) return;
  _state.root = root;

  _state.drawer = createDrawer({
    root,
    backdrop,
    onClose: () => {},
  });

  fab.addEventListener("click", () => {
    if (_state.drawer.isOpen()) {
      _state.drawer.close();
    } else {
      renderDrawerContent();
      _state.drawer.open(fab);
      // Marca come visto al primo open
      try { localStorage.setItem(NOA_SEEN_KEY, "true"); } catch (e) { /* no-op */ }
      updateFabBadge();
    }
  });

  // Re-render se l'agenda cambia (impatta sezione "Suggerimenti per te")
  agenda.onChange(() => {
    if (_state.drawer.isOpen()) renderDrawerContent();
    updateFabBadge();
  });

  // Refresh badge ogni 60s (gap-tip che cambia con l'orario)
  setInterval(updateFabBadge, 60_000);
  updateFabBadge();

  // Custom event per aprirla da altrove
  window.addEventListener("companion:open-noa-drawer", () => {
    renderDrawerContent();
    _state.drawer.open(fab);
  });
}

function updateFabBadge() {
  const fab = document.getElementById("noa-fab");
  if (!fab) return;
  const seen = localStorage.getItem(NOA_SEEN_KEY) === "true";
  let badgeText = "";
  if (!seen) {
    badgeText = "·";
  } else {
    const gap = getGapSuggestion(_state.data.program);
    if (gap) badgeText = "·";
  }
  let badge = fab.querySelector(".noa-fab-badge");
  if (badgeText) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "noa-fab-badge";
      badge.setAttribute("aria-hidden", "true");
      fab.append(badge);
    }
    badge.textContent = badgeText;
    fab.dataset.hasSuggestion = "true";
  } else {
    if (badge) badge.remove();
    fab.dataset.hasSuggestion = "false";
  }
}

function renderDrawerContent() {
  const data = _state.data;
  const ls = liveState(data.program);
  const ctxBlock = renderContextBlock(ls);
  const pathsBlock = renderPathsBlock(data);
  const suggBlock = renderSuggestionsBlock(data);

  _state.root.innerHTML = `
    <div class="noa-drawer-inner">
      <header class="noa-drawer-head">
        <div class="noa-drawer-avatar" aria-hidden="true">
          <span class="glyph glyph--memories glyph--lg"></span>
        </div>
        <div class="noa-drawer-headtext">
          <h2 id="noa-drawer-title">${t("noa.greeting")}</h2>
          <p>${getLang() === "en" ? "I'm your guide through the three days of AIUCD 2026. I can suggest paths, fill the gaps in your day, help you avoid agenda conflicts." : "Sono la tua guida per i tre giorni di AIUCD 2026. Posso suggerirti percorsi, riempire i tempi morti, evitarti i conflitti d'agenda."}</p>
        </div>
        <button class="drawer-close" id="noa-drawer-close" type="button" aria-label="${t("drawer.close")}">
          <span class="icon icon--close" aria-hidden="true"></span>
        </button>
      </header>

      <div class="noa-drawer-body">
        ${ctxBlock}
        ${pathsBlock}
        ${suggBlock}
      </div>

      <footer class="noa-drawer-foot">
        <button class="noa-link" id="noa-reset-onboarding" type="button">Reimposta benvenuto</button>
      </footer>
    </div>
  `;

  // Wire close button
  _state.root.querySelector("#noa-drawer-close")?.addEventListener("click", () => _state.drawer.close());

  // Wire reset onboarding
  _state.root.querySelector("#noa-reset-onboarding")?.addEventListener("click", () => {
    try { localStorage.removeItem(NOA_SEEN_KEY); } catch (e) { /* no-op */ }
    updateFabBadge();
    _state.drawer.close();
  });

  // Wire path tiles → open paths overlay focused on a specific path.
  // `returnTo: "noa"` segnala ad app.js che alla chiusura dell'overlay deve
  // riaprire il drawer di Noa: senza, l'utente che entra in un percorso e
  // poi torna indietro non vede più Noa e perde il punto di partenza.
  _state.root.querySelectorAll(".noa-path-tile").forEach(tile => {
    tile.addEventListener("click", () => {
      const pathId = tile.dataset.pathId;
      _state.drawer.close();
      window.dispatchEvent(new CustomEvent("companion:open-paths-overlay", {
        detail: { pathId, returnTo: "noa" },
      }));
    });
  });

  // Wire CTA "vedi tutti i percorsi" — stesso meccanismo di ritorno.
  _state.root.querySelector("#noa-all-paths-btn")?.addEventListener("click", () => {
    _state.drawer.close();
    window.dispatchEvent(new CustomEvent("companion:open-paths-overlay", {
      detail: { returnTo: "noa" },
    }));
  });

  // Wire CTA Sprint D8 "Cosa fare nei dintorni?" — apre Esplora Cagliari
  // pre-filtrato sui minuti del gap rilevato. `cagliariTimeMin` è letto da
  // app.js che inoltra il filtro a cagliari-view via evento custom.
  _state.root.querySelectorAll("#noa-explore-cagliari-btn, #noa-cagliari-general-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const minutes = parseInt(btn.dataset.minutes || "0", 10);
      _state.drawer.close();
      window.dispatchEvent(new CustomEvent("companion:goto-tab", {
        detail: {
          tab: "cagliari",
          ...(minutes > 0 ? { cagliariTimeMin: minutes, cagliariMode: "walking" } : {}),
        },
      }));
    });
  });

  // Wire CTA "apri agenda"
  _state.root.querySelector("#noa-open-agenda-btn")?.addEventListener("click", () => {
    _state.drawer.close();
    window.dispatchEvent(new CustomEvent("companion:open-agenda-drawer"));
  });
}

function renderContextBlock(ls) {
  const data = _state.data;
  const days = data.program.days || [];
  if (!days.length) return "";

  const today = getNow().toISOString().slice(0, 10);
  const isLastDay = days[days.length - 1].date === today && (ls.state === "live" || ls.state === "break");

  let title = "";
  let body = "";
  let cta = "";

  if (ls.state === "pre") {
    const opening = days[0].blocks?.find(b => b.start);
    if (opening) {
      const t = `${days[0].date} ${opening.start}`;
      const dt = new Date(`${days[0].date}T${opening.start}:00`);
      const diffMs = dt - getNow();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      title = `Manca ancora qualche giorno`;
      body = diffDays > 1
        ? `<p>Apriamo il ${days[0].date.split("-").reverse().join("/")} alle ${opening.start}. Sono ${diffDays} giorni: in attesa puoi sfogliare i 134 contributi e costruire la tua agenda.</p>`
        : `<p>Apriamo domani alle ${opening.start}. Se hai un momento, dai un'occhiata ai 134 contributi e segna le stelle.</p>`;
      cta = `<button class="noa-cta-btn" id="noa-open-agenda-btn"><span class="icon icon--star-filled" aria-hidden="true"></span> Apri la tua agenda</button>`;
    }
  } else if (ls.state === "live" || ls.state === "break") {
    const gap = getGapSuggestion(data.program);
    if (gap) {
      title = isLastDay ? "Ultimo giorno · ti suggerisco" : "In questo momento";
      body = `<p>${gap.text}</p>`;
      // Sprint D8: se l'utente ha tempo, suggerisco di esplorare i POI della
      // città filtrati sulla finestra di tempo disponibile.
      if (gap.minutes >= 30) {
        cta = `<button class="noa-cta-btn" id="noa-explore-cagliari-btn" data-minutes="${gap.minutes}"><span class="icon icon--compass" aria-hidden="true"></span> Cosa fare nei dintorni? (${gap.minutes} min)</button>`;
      }
    } else {
      title = isLastDay ? "Ultimo giorno" : "In corso";
      body = ls.state === "live"
        ? `<p>Il convegno è in corso. Apri il Programma per vedere cosa c'è in tutte le aule.</p>`
        : `<p>Stiamo in pausa. Tornano alle ${nextResumeTime(data.program)}.</p>`;
    }
  } else if (ls.state === "post") {
    title = "Convegno concluso";
    body = `<p>Per ora è fatta. Riguarda le relazioni che hai salvato; tra qualche tempo escono atti e registrazioni sul sito AIUCD.</p>`;
    cta = `<button class="noa-cta-btn" id="noa-open-agenda-btn"><span class="icon icon--star-filled" aria-hidden="true"></span> ${t("topbar.my_aiucd")}</button>`;
  }

  if (!title) return "";

  return `
    <section class="noa-section noa-section--context">
      <h3>${title}</h3>
      ${body}
      ${cta}
    </section>
  `;
}

function renderPathsBlock(data) {
  const paths = Array.isArray(data.paths) ? data.paths : (data.paths?.paths || []);
  if (!paths.length) return "";

  // Raggruppa per criterion
  const byCriterion = { A: [], B: [], C: [] };
  for (const p of paths) {
    if (byCriterion[p.criterion]) byCriterion[p.criterion].push(p);
  }

  const groupHTML = ["A", "B", "C"].map(c => {
    const items = byCriterion[c];
    if (!items.length) return "";
    return `
      <div class="noa-paths-group">
        <h4>${c} · ${CRITERIA_LABELS[c]} <span class="noa-paths-count">(${items.length})</span></h4>
        <div class="noa-paths-tiles">
          ${items.map(p => `
            <button class="noa-path-tile" data-path-id="${p.id}" type="button" title="${escapeHtml(p.intro || "")}">
              <span class="noa-path-tile-id">${p.id.toUpperCase()}</span>
              <span class="noa-path-tile-name">${escapeHtml(p.name)}</span>
              <span class="noa-path-tile-meta">${p.paper_ids.length} relazioni</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  return `
    <section class="noa-section noa-section--paths">
      <h3>14 percorsi tra le 134 relazioni</h3>
      <p>Ho cucito i contributi in itinerari tematici. Sceglilo da qui o tocca la tile.</p>
      ${groupHTML}
      <button class="noa-cta-btn noa-cta-btn--ghost" id="noa-all-paths-btn"><span class="icon icon--compass" aria-hidden="true"></span> Vedi tutti i percorsi a schermo intero</button>
    </section>
  `;
}

function renderSuggestionsBlock(data) {
  const myTalks = agenda.getAll();
  if (!myTalks.length) {
    return `
      <section class="noa-section noa-section--suggestions">
        <h3>Suggerimenti per te</h3>
        <p>L'agenda è vuota. Tocca <span class="icon icon--star-outline" aria-hidden="true"></span> su una relazione per cominciare a costruirla; ti dirò se ci sono conflitti o tempi morti.</p>
      </section>
    `;
  }

  // Conta talk salvati e conflitti per ogni giorno
  const days = data.program.days || [];
  const lines = [];
  for (const day of days) {
    const talksOfDay = collectDayTalks(day, myTalks);
    if (!talksOfDay.length) continue;
    const conflicts = countConflicts(talksOfDay);
    const dayLabel = day.label || day.date;
    if (conflicts > 0) {
      lines.push(`<li><strong>${dayLabel}</strong>: ${talksOfDay.length} relazioni in agenda · ${conflicts} ${conflicts === 1 ? "conflitto" : "conflitti"} <span class="icon icon--warning" aria-hidden="true"></span></li>`);
    } else {
      lines.push(`<li><strong>${dayLabel}</strong>: ${talksOfDay.length} relazioni in agenda</li>`);
    }
  }

  return `
    <section class="noa-section noa-section--suggestions">
      <h3>Suggerimenti per te</h3>
      <ul class="noa-suggestions-list">
        ${lines.join("") || "<li>L'agenda è valida: nessun conflitto.</li>"}
      </ul>
      <button class="noa-cta-btn noa-cta-btn--ghost" id="noa-open-agenda-btn"><span class="icon icon--star-filled" aria-hidden="true"></span> ${getLang() === "en" ? `Open "${t("topbar.my_aiucd")}"` : `Apri "${t("topbar.my_aiucd")}"`}</button>
      <button class="noa-cta-btn noa-cta-btn--ghost" id="noa-cagliari-general-btn" data-minutes="0"><span class="icon icon--compass" aria-hidden="true"></span> Esplora Cagliari nei dintorni</button>
    </section>
  `;
}

// === Helpers ===

function nextResumeTime(program) {
  const ls = liveState(program);
  if (!ls.day || !ls.block) return "—";
  const day = ls.day;
  for (const b of day.blocks) {
    if (b.start && b.start > (ls.block.end || "")) return b.start;
  }
  return "—";
}

function collectDayTalks(day, savedIds) {
  const set = new Set(savedIds);
  const out = [];
  for (const block of (day.blocks || [])) {
    if (block.type !== "session") continue;
    for (const t of (block.tracks || [])) {
      for (const tk of (t.talks || [])) {
        if (set.has(tk.paper_id)) {
          out.push({ paper_id: tk.paper_id, start: tk.start, end: tk.end, room: t.room });
        }
      }
    }
  }
  return out;
}

function countConflicts(talks) {
  const slots = new Map();
  for (const tk of talks) {
    const k = `${tk.start}-${tk.end}`;
    if (!slots.has(k)) slots.set(k, 0);
    slots.set(k, slots.get(k) + 1);
  }
  let c = 0;
  for (const v of slots.values()) if (v > 1) c++;
  return c;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

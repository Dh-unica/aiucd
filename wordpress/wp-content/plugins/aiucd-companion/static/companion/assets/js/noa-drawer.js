// AIUCD 2026 Companion · Noa drawer (Sprint B1 iter 2, 2026-05-10)
// Architettura rivisitata: Noa è un FAB sempre visibile + drawer richiamabile.
// Sostituisce l'onboarding banner statico, il banner CTA percorsi e il gap-tip
// standalone che vivevano nel Programma. Tutto il contenuto di Noa è ora qui.

import * as agenda from "./agenda.js";
import { liveState, getNow } from "./livestate.js";
import { t, getLang } from "./i18n.js?v=f4-6";
import { getGapSuggestion, NOA_VOICE_TONE } from "./avatar.js?v=noa2";
import { createDrawer } from "./drawer-controller.js";

let _state = {
  root: null,
  data: null,
  drawer: null,   // istanza createDrawer
};

const NOA_SEEN_KEY = "aiucd2026-noa-seen";

// Helper i18n locale: tutte le stringhe del drawer Noa sono in coppie
// (EN, IT). I titoli dei paper restano IT per coerenza con catalogo.json,
// ma TUTTO il chrome del drawer è bilingue.
const tr = (en, it) => (getLang() === "en" ? en : it);

const CRITERIA_LABELS_IT = {
  A: "Approfondisci un tema",
  B: "Esplora tutto il convegno",
  C: "Connetti aree diverse",
};
const CRITERIA_LABELS_EN = {
  A: "Dive deeper into a theme",
  B: "Explore the whole conference",
  C: "Connect different areas",
};
function criteriaLabel(c) {
  return (getLang() === "en" ? CRITERIA_LABELS_EN : CRITERIA_LABELS_IT)[c] || c;
}

// Quantità contributi accettati al convegno — costante derivata, non i18n.
const N_CONTRIBUTIONS = 134;

// Formatta una data ISO (YYYY-MM-DD) nel formato locale del lang corrente.
function formatDate(iso) {
  const [Y, M, D] = iso.split("-").map(Number);
  const d = new Date(Y, M - 1, D);
  return d.toLocaleDateString(getLang() === "en" ? "en-GB" : "it-IT",
    { day: "2-digit", month: "long", year: "numeric" });
}

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

  const introText = tr(
    "I'm your guide through the three days of AIUCD 2026. I can suggest paths, fill the gaps in your day, help you avoid agenda conflicts.",
    "Sono la tua guida per i tre giorni di AIUCD 2026. Posso suggerirti percorsi, riempire i tempi morti, evitarti i conflitti d'agenda."
  );
  const resetLabel = tr("Reset welcome message", "Reimposta benvenuto");

  _state.root.innerHTML = `
    <div class="noa-drawer-inner">
      <header class="noa-drawer-head">
        <div class="noa-drawer-avatar" aria-hidden="true">
          <span class="glyph glyph--memories glyph--lg"></span>
        </div>
        <div class="noa-drawer-headtext">
          <h2 id="noa-drawer-title">${t("noa.greeting")}</h2>
          <p>${introText}</p>
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
        <button class="noa-link" id="noa-reset-onboarding" type="button">${resetLabel}</button>
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
      const dt = new Date(`${days[0].date}T${opening.start}:00`);
      const diffMs = dt - getNow();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const dateStr = formatDate(days[0].date);
      title = tr("A few days to go", "Manca ancora qualche giorno");
      body = diffDays > 1
        ? `<p>${tr(
            `We open on ${dateStr} at ${opening.start}. That's ${diffDays} days: while you wait you can browse the ${N_CONTRIBUTIONS} contributions and build your agenda.`,
            `Apriamo il ${days[0].date.split("-").reverse().join("/")} alle ${opening.start}. Sono ${diffDays} giorni: in attesa puoi sfogliare i ${N_CONTRIBUTIONS} contributi e costruire la tua agenda.`
          )}</p>`
        : `<p>${tr(
            `We open tomorrow at ${opening.start}. If you have a moment, take a look at the ${N_CONTRIBUTIONS} contributions and tap the stars.`,
            `Apriamo domani alle ${opening.start}. Se hai un momento, dai un'occhiata ai ${N_CONTRIBUTIONS} contributi e segna le stelle.`
          )}</p>`;
      cta = `<button class="noa-cta-btn" id="noa-open-agenda-btn"><span class="icon icon--star-filled" aria-hidden="true"></span> ${tr("Open your agenda", "Apri la tua agenda")}</button>`;
    }
  } else if (ls.state === "live" || ls.state === "break") {
    const gap = getGapSuggestion(data.program);
    if (gap) {
      title = isLastDay
        ? tr("Last day · my suggestion", "Ultimo giorno · ti suggerisco")
        : tr("Right now", "In questo momento");
      body = `<p>${gap.text}</p>`;
      // Sprint D8: se l'utente ha tempo, suggerisco di esplorare i POI della
      // città filtrati sulla finestra di tempo disponibile.
      if (gap.minutes >= 30) {
        cta = `<button class="noa-cta-btn" id="noa-explore-cagliari-btn" data-minutes="${gap.minutes}"><span class="icon icon--compass" aria-hidden="true"></span> ${tr(
          `What to do nearby? (${gap.minutes} min)`,
          `Cosa fare nei dintorni? (${gap.minutes} min)`
        )}</button>`;
      }
    } else {
      title = isLastDay ? tr("Last day", "Ultimo giorno") : tr("In progress", "In corso");
      body = ls.state === "live"
        ? `<p>${tr(
            "The conference is live. Open the Program to see what's happening in all the rooms.",
            "Il convegno è in corso. Apri il Programma per vedere cosa c'è in tutte le aule."
          )}</p>`
        : `<p>${tr(
            `We're on a break. Back at ${nextResumeTime(data.program)}.`,
            `Stiamo in pausa. Tornano alle ${nextResumeTime(data.program)}.`
          )}</p>`;
    }
  } else if (ls.state === "post") {
    title = tr("Conference concluded", "Convegno concluso");
    body = `<p>${tr(
      "That's a wrap. Review the talks you saved; proceedings and recordings will be published on the AIUCD website soon.",
      "Per ora è fatta. Riguarda le relazioni che hai salvato; tra qualche tempo escono atti e registrazioni sul sito AIUCD."
    )}</p>`;
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

  const totalPaths = paths.length;
  const pathsCount = (n) => tr(n === 1 ? "1 talk" : `${n} talks`,
                              n === 1 ? "1 relazione" : `${n} relazioni`);

  const groupHTML = ["A", "B", "C"].map(c => {
    const items = byCriterion[c];
    if (!items.length) return "";
    return `
      <div class="noa-paths-group">
        <h4>${c} · ${criteriaLabel(c)} <span class="noa-paths-count">(${items.length})</span></h4>
        <div class="noa-paths-tiles">
          ${items.map(p => `
            <button class="noa-path-tile" data-path-id="${p.id}" type="button" title="${escapeHtml(p.intro || "")}">
              <span class="noa-path-tile-id">${p.id.toUpperCase()}</span>
              <span class="noa-path-tile-name">${escapeHtml(p.name)}</span>
              <span class="noa-path-tile-meta">${pathsCount(p.paper_ids.length)}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  return `
    <section class="noa-section noa-section--paths">
      <h3>${tr(
        `${totalPaths} paths through the ${N_CONTRIBUTIONS} talks`,
        `${totalPaths} percorsi tra le ${N_CONTRIBUTIONS} relazioni`
      )}</h3>
      <p>${tr(
        "I've woven the contributions into thematic journeys. Pick one here or tap a tile.",
        "Ho cucito i contributi in itinerari tematici. Scegline uno da qui o tocca la tile."
      )}</p>
      ${groupHTML}
      <button class="noa-cta-btn noa-cta-btn--ghost" id="noa-all-paths-btn"><span class="icon icon--compass" aria-hidden="true"></span> ${tr(
        "See all paths in full screen",
        "Vedi tutti i percorsi a schermo intero"
      )}</button>
    </section>
  `;
}

function renderSuggestionsBlock(data) {
  const sectionTitle = tr("Suggestions for you", "Suggerimenti per te");
  const myTalks = agenda.getAll();
  if (!myTalks.length) {
    return `
      <section class="noa-section noa-section--suggestions">
        <h3>${sectionTitle}</h3>
        <p>${tr(
          "Your agenda is empty. Tap the star icon on any talk to start building it; I'll warn you about clashes or downtime.",
          "L'agenda è vuota. Tocca la stella su una relazione per cominciare a costruirla; ti dirò se ci sono conflitti o tempi morti."
        )}</p>
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
    const n = talksOfDay.length;
    const inAgenda = tr(
      n === 1 ? "1 talk on your agenda" : `${n} talks on your agenda`,
      n === 1 ? "1 relazione in agenda" : `${n} relazioni in agenda`
    );
    if (conflicts > 0) {
      const cText = tr(
        conflicts === 1 ? "1 clash" : `${conflicts} clashes`,
        conflicts === 1 ? "1 conflitto" : `${conflicts} conflitti`
      );
      lines.push(`<li><strong>${dayLabel}</strong>: ${inAgenda} · ${cText} <span class="icon icon--warning" aria-hidden="true"></span></li>`);
    } else {
      lines.push(`<li><strong>${dayLabel}</strong>: ${inAgenda}</li>`);
    }
  }

  const noClash = tr("Your agenda looks good: no clashes.", "L'agenda è valida: nessun conflitto.");
  const openMine = tr(`Open "${t("topbar.my_aiucd")}"`, `Apri "${t("topbar.my_aiucd")}"`);
  const exploreNearby = tr("Explore Cagliari nearby", "Esplora Cagliari nei dintorni");

  return `
    <section class="noa-section noa-section--suggestions">
      <h3>${sectionTitle}</h3>
      <ul class="noa-suggestions-list">
        ${lines.join("") || `<li>${noClash}</li>`}
      </ul>
      <button class="noa-cta-btn noa-cta-btn--ghost" id="noa-open-agenda-btn"><span class="icon icon--star-filled" aria-hidden="true"></span> ${openMine}</button>
      <button class="noa-cta-btn noa-cta-btn--ghost" id="noa-cagliari-general-btn" data-minutes="0"><span class="icon icon--compass" aria-hidden="true"></span> ${exploreNearby}</button>
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

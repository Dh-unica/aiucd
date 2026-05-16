// AIUCD 2026 Companion · entry point

import { loadAllData } from "./data.js?v=f4-6";
import { liveState, getCountdownInfo, getOpeningTime, getNow, checkClockSkew } from "./livestate.js?v=f4-6";
import { renderProgram } from "./program-view.js?v=f4-7";
import { renderMineList, renderPathsOverlay } from "./path-view.js?v=f4-6";
import { renderMappa } from "./mappa-view.js?v=f4-6";
import { renderCagliari, onCagliariVisible } from "./cagliari-view.js?v=f4-6";
import { renderCatalog, onCatalogVisible } from "./catalog-view.js?v=f4-6";
import { renderPoster } from "./poster-view.js?v=f4-9";
import { renderNumeri, onNumeriVisible } from "./numeri-view.js?v=f4-6";
import * as modal from "./talk-modal-v2.js?v=f4-6";
import * as agenda from "./agenda.js";
import { createDrawer } from "./drawer-controller.js";
import { initNoaDrawer } from "./noa-drawer.js?v=f4-6";
import { loadI18n, t, getLang } from "./i18n.js?v=f4-6";

async function init() {
  // Carica dizionario i18n (it/en). Mette `data-lang` su <html> e localizza
  // gli elementi statici della shell (tabs, drawer titles, ecc.).
  await loadI18n();
  document.documentElement.setAttribute("data-lang", getLang());
  applyStaticI18n();
  // Tab navigation: top tab-nav (desktop) + mobile bottom-nav (Sprint A4)
  const tabBtns = document.querySelectorAll(".tab-btn");
  const mbTabs = document.querySelectorAll(".mb-tab");
  const tabSections = document.querySelectorAll(".tab-section");

  function selectTab(name, push = true) {
    tabBtns.forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
    mbTabs.forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
    tabSections.forEach(s => s.dataset.active = s.dataset.tab === name);
    if (push) window.history.replaceState(null, "", `#${name}`);
    if (name === "catalogo") onCatalogVisible();
    if (name === "numeri") onNumeriVisible();
    if (name === "cagliari") onCagliariVisible();
  }
  tabBtns.forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));
  mbTabs.forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.tab)));

  // Initial tab from hash. Whitelist le tab valide: hash usati per gesture
  // diverse (es. `#noa` dal FAB globale per aprire il drawer di Noa) non sono
  // tab e cadrebbero in selectTab() lasciando tutte le sezioni nascoste.
  const validTabs = new Set(Array.from(tabSections).map(s => s.dataset.tab));
  const rawHash = (window.location.hash || "").slice(1);
  let initialTab;
  if (rawHash === "path") {
    // Legacy hash #path
    initialTab = "programma";
  } else if (validTabs.has(rawHash)) {
    initialTab = rawHash;
  } else {
    // Hash sconosciuto o vuoto (incluso `#noa`): default Programma. Non
    // pushiamo nulla in history per non sovrascrivere `#noa` (lo legge
    // noa-drawer.js per auto-aprire il drawer).
    initialTab = "programma";
  }
  selectTab(initialTab, false);

  // Modalità kiosk
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "kiosk") {
    document.documentElement.dataset.mode = "kiosk";
  }

  // Clock-skew check (non bloccante): se l'orologio del dispositivo è
  // sfasato di oltre 5 minuti dal server, mostra un banner discreto.
  checkClockSkew().then(showClockSkewBanner).catch(() => {});

  // Load data
  let data;
  try {
    data = await loadAllData();
  } catch (e) {
    console.error("data load failed", e);
    console.error("Suggerimento dev: verifica che scripts/build.py sia stato eseguito e che data/generated/ contenga i JSON.");
    document.querySelector('section[data-tab="programma"]').innerHTML = `
      <div class="placeholder">
        <strong>Non riesco a leggere i dati del convegno.</strong>
        Riprova tra un momento. Se il problema persiste, scrivi alla segreteria del convegno.
      </div>
    `;
    return;
  }

  // Live indicator (countdown granulare): aggiorna label, detail, barra di progressione
  // e azione di click adattiva al contesto.
  let lastCountdownState = null;
  function refreshLiveIndicator() {
    const ind = document.getElementById("live-indicator");
    if (!ind) return;
    const info = getCountdownInfo(data.program);
    const baseState = info.state.startsWith("pre") ? "pre" : info.state;
    ind.dataset.state = baseState;
    ind.dataset.variant = info.state;
    ind.dataset.lastDay = info.lastDay ? "true" : "false";
    const labelEl = ind.querySelector(".live-indicator-label");
    const detailEl = ind.querySelector(".live-indicator-detail");
    const fillEl = ind.querySelector(".live-indicator-progress-fill");
    if (labelEl) labelEl.textContent = info.label;
    if (detailEl) {
      detailEl.textContent = info.detail || "";
      detailEl.hidden = !info.detail;
    }
    if (fillEl) {
      const pct = Math.round((info.progress || 0) * 100);
      fillEl.style.width = `${pct}%`;
    }
    // ARIA-label completo per screen reader
    const aria = info.detail ? `${info.label} · ${info.detail}` : info.label;
    ind.setAttribute("aria-label", aria);
    lastCountdownState = info.state;
  }
  refreshLiveIndicator();
  setInterval(refreshLiveIndicator, 30_000);

  // Countdown T-N nel tab "Programma" quando mancano <=10 giorni all'apertura.
  // Il prefisso compare sia nel tab top sia nel mobile-bottom-tab; classe
  // .tab-btn--countdown rende rust il tab per attirare l'attenzione.
  function refreshProgramCountdown() {
    const opening = getOpeningTime(data.program);
    const ls = liveState(data.program);
    const topBadge = document.getElementById("tab-countdown-top");
    const mobBadge = document.getElementById("tab-countdown-mobile");
    const topBtn = document.querySelector('.tab-btn[data-tab="programma"]');
    const mobBtn = document.querySelector('.mb-tab[data-tab="programma"]');
    if (!opening || !topBadge || !mobBadge) return;

    // Mostra solo durante pre, e solo se mancano ≤ 10 giorni.
    if (ls.state !== "pre") {
      topBadge.hidden = true; topBadge.textContent = "";
      mobBadge.hidden = true; mobBadge.textContent = "";
      topBtn?.classList.remove("tab-btn--countdown");
      mobBtn?.classList.remove("tab-btn--countdown");
      return;
    }
    const diffMs = opening - getNow();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 10 || diffDays <= 0) {
      topBadge.hidden = true; topBadge.textContent = "";
      mobBadge.hidden = true; mobBadge.textContent = "";
      topBtn?.classList.remove("tab-btn--countdown");
      mobBtn?.classList.remove("tab-btn--countdown");
      return;
    }
    const label = `T-${diffDays} `;
    topBadge.textContent = label;
    topBadge.hidden = false;
    mobBadge.textContent = label;
    mobBadge.hidden = false;
    topBtn?.classList.add("tab-btn--countdown");
    mobBtn?.classList.add("tab-btn--countdown");
  }
  refreshProgramCountdown();
  setInterval(refreshProgramCountdown, 60_000);

  // Deep-link adattivo: il click sul countdown porta al contesto rilevante per lo stato.
  document.getElementById("live-indicator")?.addEventListener("click", () => {
    const state = lastCountdownState || "pre";
    if (state === "post") {
      selectTab("numeri");
      return;
    }
    if (state === "live" || state === "break") {
      selectTab("programma");
      // scroll al live snapshot
      requestAnimationFrame(() => {
        document.getElementById("live-snapshot-host")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    // pre / pre-soon / pre-imminent → vai alla griglia Programma sul primo giorno
    selectTab("programma");
    requestAnimationFrame(() => {
      document.querySelector('section[data-tab="programma"] .day-tabs')?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // Render Programma (include la live snapshot integrata, vedi A1)
  const programRoot = document.querySelector('section[data-tab="programma"]');
  const onTalkClick = (paper, slot, track, day) => modal.open(paper, slot, track, day);
  renderProgram(programRoot, data, onTalkClick);

  // Render Mappa
  const mappaRoot = document.querySelector('section[data-tab="mappa"]');
  renderMappa(mappaRoot, data, onTalkClick);

  // Render Catalogo
  const catalogRoot = document.querySelector('section[data-tab="catalogo"]');
  renderCatalog(catalogRoot, data, onTalkClick);

  // Render Poster Gallery
  const posterRoot = document.querySelector('section[data-tab="poster"]');
  renderPoster(posterRoot, data, onTalkClick);

  // Render Numeri (dashboard di submission)
  const numeriRoot = document.querySelector('section[data-tab="numeri"]');
  renderNumeri(numeriRoot);

  // Render Esplora Cagliari (Sprint D)
  const cagliariRoot = document.querySelector('section[data-tab="cagliari"]');
  if (cagliariRoot) renderCagliari(cagliariRoot, data);

  // Noa: avatar floating + drawer richiamabile (Sprint B1 iter 2).
  // Sostituisce onboarding banner, paths-cta e gap-tip standalone che vivevano
  // dentro il Programma. Ora Noa è onnipresente da tutte le tab.
  initNoaDrawer(data);

  // ---------------------------------------------------------------------
  // Drawer "I miei talk" + overlay "Percorsi suggeriti"
  // ---------------------------------------------------------------------
  const agendaDrawerEl = document.getElementById("agenda-drawer");
  const agendaBackdropEl = document.getElementById("agenda-drawer-backdrop");
  const pathsOverlayEl = document.getElementById("paths-overlay");
  const pathsBackdropEl = document.getElementById("paths-overlay-backdrop");

  const agendaDrawer = createDrawer({
    root: agendaDrawerEl,
    backdrop: agendaBackdropEl,
  });
  // Memorizziamo la sorgente di apertura dell'overlay paths: se è stato
  // aperto dal drawer Noa, alla chiusura riaprire Noa così l'utente non
  // perde il contesto da cui era partito.
  let pathsOverlayReturnTo = null;
  const pathsOverlay = createDrawer({
    root: pathsOverlayEl,
    backdrop: pathsBackdropEl,
    onClose: () => {
      if (pathsOverlayReturnTo === "noa") {
        pathsOverlayReturnTo = null;
        // Tick successivo: il close del drawer-controller restituisce il
        // focus all'opener; rilanciamo l'apertura di Noa dopo che il
        // restore-focus è completato.
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent("companion:open-noa-drawer"));
        });
      } else {
        pathsOverlayReturnTo = null;
      }
    },
  });

  function buildAgendaDrawerShell() {
    const count = agenda.getAll().length;
    agendaDrawerEl.innerHTML = `
      <div class="drawer-handle" aria-hidden="true"></div>
      <header class="drawer-head">
        <h2 id="agenda-drawer-title">
          <span class="drawer-icon icon icon--star-filled" aria-hidden="true"></span>
          ${t("topbar.my_aiucd")}
          <span class="count-pill" id="drawer-count">${count}</span>
        </h2>
        <button class="drawer-close" id="drawer-close-btn" type="button" aria-label="${getLang() === "en" ? "Close" : "Chiudi"}">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="drawer-body" id="agenda-drawer-body"></div>
    `;
    agendaDrawerEl.querySelector("#drawer-close-btn").addEventListener("click", () => {
      agendaDrawer.close();
    });
    const body = agendaDrawerEl.querySelector("#agenda-drawer-body");
    renderMineList(body, data, onTalkClick);
  }

  function buildPathsOverlayShell(initialPathId = null) {
    pathsOverlayEl.innerHTML = `
      <header class="paths-overlay-head">
        <h2 id="paths-overlay-title">
          <span class="overlay-icon icon icon--compass" aria-hidden="true"></span>
          Percorsi suggeriti
        </h2>
        <button class="drawer-close" id="paths-close-btn" type="button" aria-label="Chiudi">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div class="paths-overlay-body" id="paths-overlay-body"></div>
    `;
    pathsOverlayEl.querySelector("#paths-close-btn").addEventListener("click", () => {
      pathsOverlay.close();
    });
    const body = pathsOverlayEl.querySelector("#paths-overlay-body");
    renderPathsOverlay(body, data, onTalkClick, initialPathId);
  }

  // Topbar ★ button → opens drawer
  const topbarAgendaBtn = document.getElementById("topbar-agenda-btn");
  if (topbarAgendaBtn) {
    topbarAgendaBtn.addEventListener("click", () => {
      buildAgendaDrawerShell();
      agendaDrawer.open(topbarAgendaBtn);
    });
  }

  // Update count badge in topbar
  function refreshAgendaCount() {
    const el = document.getElementById("topbar-agenda-count");
    if (!el) return;
    const n = agenda.getAll().length;
    el.textContent = String(n);
    el.dataset.empty = n === 0 ? "true" : "false";
    // Also update the in-drawer pill if drawer is mounted
    const pill = document.getElementById("drawer-count");
    if (pill) pill.textContent = String(n);
  }
  refreshAgendaCount();
  agenda.onChange(() => {
    refreshAgendaCount();
    // Notifica il widget globale nell'header WP (mu-plugin) per aggiornare
    // il contatore "★ Il mio AIUCD26 (N)" senza attendere lo storage event.
    if (window.AIUCD_SITE_WIDGETS && typeof window.AIUCD_SITE_WIDGETS.refresh === "function") {
      window.AIUCD_SITE_WIDGETS.refresh();
    }
  });

  // Deep-link da pagine WP esterne: /companion/?action=open-agenda apre il drawer
  // al boot (link dal widget "★ Il mio AIUCD26" nell'header).
  if (new URLSearchParams(location.search).get("action") === "open-agenda") {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("companion:open-agenda-drawer"));
    }, 100);
  }

  // Custom events to open drawer/overlay from anywhere in the app
  window.addEventListener("companion:open-agenda-drawer", () => {
    buildAgendaDrawerShell();
    agendaDrawer.open(topbarAgendaBtn);
  });
  window.addEventListener("companion:open-paths-overlay", (e) => {
    pathsOverlayReturnTo = e?.detail?.returnTo || null;
    buildPathsOverlayShell(e?.detail?.pathId || null);
    pathsOverlay.open();
  });

  // Cross-tab: when a talk's "Vai alla mappa" button fires, switch to mappa
  window.addEventListener("companion:goto-room", () => {
    selectTab("mappa");
  });

  // Cross-tab generic: vai a un tab specifico, opzionalmente con subview
  // Retro-compat: se tab === "path", apri il drawer (vecchi link/eventi).
  window.addEventListener("companion:goto-tab", e => {
    const { tab, subview, cagliariTimeMin, cagliariMode } = e.detail || {};
    if (tab === "path") {
      if (subview === "paths") {
        buildPathsOverlayShell();
        pathsOverlay.open();
      } else {
        buildAgendaDrawerShell();
        agendaDrawer.open(topbarAgendaBtn);
      }
      return;
    }
    if (tab) selectTab(tab);
    // Pre-filtro per la tab Esplora Cagliari (Sprint D): dispatchato da Noa
    // quando rileva un gap fra due relazioni, in modo da mostrare solo i POI
    // raggiungibili nella finestra di tempo disponibile.
    if (tab === "cagliari" && (cagliariTimeMin || cagliariMode)) {
      window.dispatchEvent(new CustomEvent("companion:cagliari-set-filter", {
        detail: { minutes: cagliariTimeMin, mode: cagliariMode },
      }));
    }
  });

}

// Sostituisce in-place i `textContent` degli elementi statici della shell HTML
// (tab-nav, topbar, mobile-bottom-nav) con le traduzioni del dizionario i18n.
// Lasciamo intatti il markup HTML e gli ID; cambiamo solo il testo visibile.
// Chiavi mancanti o lingua = "it" → nessuna modifica (testo già in italiano).
function applyStaticI18n() {
  const map = [
    // Topbar (anche se nascosta in WP-embed, in standalone è visibile)
    ['.topbar-agenda-label', 'topbar.my_aiucd'],
    ['.live-indicator[data-state="pre"] .live-indicator-label', 'topbar.preconvegno'],
    // Tab nav (desktop)
    ['.tab-btn[data-tab="catalogo"] .tab-label, .tab-btn[data-tab="catalogo"]', 'tab.esplora'],
    ['.tab-btn[data-tab="programma"] .tab-label', 'tab.programma'],
    ['.tab-btn[data-tab="poster"]', 'tab.poster'],
    ['.tab-btn[data-tab="mappa"]', 'tab.sede'],
    ['.tab-btn[data-tab="cagliari"]', 'tab.cagliari'],
    ['.tab-btn[data-tab="numeri"]', 'tab.numeri'],
    // Mobile bottom-nav
    ['.mb-tab[data-tab="catalogo"] .mb-tab-label', 'tab.esplora'],
    ['.mb-tab[data-tab="poster"] .mb-tab-label', 'tab.poster'],
    ['.mb-tab[data-tab="mappa"] .mb-tab-label', 'tab.sede'],
    ['.mb-tab[data-tab="cagliari"] .mb-tab-label', 'tab.cagliari_short'],
    ['.mb-tab[data-tab="numeri"] .mb-tab-label', 'tab.numeri_short'],
  ];
  for (const [sel, key] of map) {
    document.querySelectorAll(sel).forEach(el => {
      // I tab-btn semplici contengono solo testo; sovrascriviamo solo i nodi
      // testuali, mantenendo eventuali figli (badge countdown, span).
      if (el.children.length === 0) {
        el.textContent = t(key);
      } else {
        // Per "Programma" il bottone contiene un <span class="tab-countdown">
        // e un <span class="tab-label">. Target più specifico già nel selector.
        const text = el.childNodes[el.childNodes.length - 1];
        if (text && text.nodeType === 3) text.nodeValue = t(key);
      }
    });
  }
  // Tab "Programma" desktop: il bottone ha 2 figli (countdown + label) — già coperto da .tab-label
  // Mobile "Programma" idem
  document.querySelectorAll('.mb-tab[data-tab="programma"] .mb-tab-label').forEach(el => {
    // Mantiene il <span class="mb-tab-countdown"> + cambia il testo finale
    const last = el.childNodes[el.childNodes.length - 1];
    if (last && last.nodeType === 3) last.nodeValue = t('tab.programma');
  });
}

// Banner non-bloccante che avvisa l'utente se il suo orologio è impreciso.
// Lo stato "live / pre / break / post" del companion deriva da `new Date()`
// del browser: se il device è fuori sync l'esperienza è degradata.
function showClockSkewBanner(skew) {
  if (!skew || skew.ok === true) return;
  if (document.getElementById("aiucd-clock-skew-banner")) return;
  const min = Math.abs(skew.deltaMin);
  const direction = t(skew.direction === "ahead" ? "clock_skew.ahead" : "clock_skew.behind");
  const banner = document.createElement("div");
  banner.id = "aiucd-clock-skew-banner";
  banner.className = "aiucd-skew-banner";
  banner.setAttribute("role", "status");
  // Costruiamo il messaggio dalla stringa i18n con {min} e {direction} interpolati.
  // Lo splittiamo in modo da poter rendere `{min} min {direction}` in <strong>.
  const fullMsg = t("clock_skew.message", { min: `__MIN__${min}__MIN__`, direction: `__DIR__${direction}__DIR__` });
  const html = fullMsg
    .replace(/__MIN__(\d+)__MIN__/, '<strong>$1')
    .replace(/__DIR__(\w+)__DIR__/, '$1</strong>');
  banner.innerHTML = `
    <span class="aiucd-skew-icon" aria-hidden="true">⏱</span>
    <span class="aiucd-skew-text">${html}</span>
    <button class="aiucd-skew-close" type="button" aria-label="${t('clock_skew.close')}">×</button>
  `;
  banner.querySelector(".aiucd-skew-close").addEventListener("click", () => banner.remove());
  document.body.appendChild(banner);
}

init();

/**
 * AIUCD Site Widgets
 *
 * Due chip nell'header del tema, presenti su TUTTE le pagine del sito.
 *   1. Live-indicator del convegno (countdown / live / break / post),
 *      con detail granulare, icona e barra di progressione. Recupera il
 *      programma da `program.json` del plugin companion: senza programma
 *      degrada a logica grossa (T-N giorni / Domani / Apre tra X min / In
 *      corso / Concluso) basata su `openingISO` / `closingISO`.
 *   2. Contatore agenda ("★ Il mio AIUCD26 N") che riflette il localStorage
 *      del companion; visibile anche se N=0 con stile "empty".
 *
 * Si attacca a <div id="aiucd-site-widgets"> renderizzato dall'header del
 * tema aiucd-theme. Dipende da window.AIUCD_LIVESTATE (vedi livestate.js
 * caricato prima dal mu-plugin).
 *
 * Comportamento click adattivo:
 *   - se NON sei sulla pagina companion: link a /companion/[?action=…|#programma]
 *   - se SEI sulla pagina companion + state=live → dispatchEvent
 *     'companion:goto-room' con la sala del talk corrente.
 *   - se SEI sulla pagina companion + agenda → dispatchEvent
 *     'companion:open-agenda-drawer' (drawer locale, no reload).
 */
(function () {
  const cfg = window.AIUCD_SITE_CONFIG || {};

  // Lo slot canonico vive in themes/aiucd-theme/parts/header.html. Se il tema
  // attivo non è aiucd-theme (es. twentytwentyfour vanilla in produzione),
  // creiamo dinamicamente lo slot e lo inseriamo nel header del tema FSE
  // attivo; in fallback estremo, mostriamo il widget come banner flottante
  // top-right (mai bloccante, sempre dismissibile con un click esterno).
  function ensureSlot() {
    let s = document.getElementById("aiucd-site-widgets");
    if (s) return s;
    s = document.createElement("div");
    s.id = "aiucd-site-widgets";
    s.className = "aiucd-site-widgets";
    s.setAttribute("aria-label", "Stato convegno AIUCD 2026");

    // Strategia di posizionamento (in ordine di preferenza):
    //   1. Subito dopo il Polylang switcher (= riga della nav + flag),
    //      stessa altezza, allineato a destra.
    //   2. Dentro un wp-block-group "space-between" dell'header FSE.
    //   3. Floating top-right come ultimo fallback.
    const pll = document.querySelector(".polylang-switcher");
    if (pll && pll.parentElement) {
      pll.parentElement.appendChild(s);
      s.classList.add("aiucd-site-widgets--inline");
      return s;
    }

    const headerCandidate =
      document.querySelector("header.wp-block-template-part") ||
      document.querySelector("header.site-header") ||
      document.querySelector("header[role='banner']") ||
      document.querySelector("body > header") ||
      document.querySelector(".wp-site-blocks > header");

    if (headerCandidate) {
      const flexRow =
        headerCandidate.querySelector(".wp-block-group.is-content-justification-space-between") ||
        headerCandidate.querySelector(".wp-block-group.is-layout-flex") ||
        headerCandidate.querySelector(".wp-block-group");
      (flexRow || headerCandidate).appendChild(s);
    } else {
      s.classList.add("aiucd-site-widgets--floating");
      document.body.appendChild(s);
    }
    return s;
  }

  const slot = ensureSlot();
  if (!slot) return;

  // I chip in modalità inline sono posizionati top-right dell'header via
  // CSS (vedi site-widgets.css → .aiucd-site-widgets--inline). Sono
  // ancorati alla riga 1 (livello brand/logo), dove c'è spazio libero a
  // destra anche con nav lunghe (Call for Papers / Verso il Convegno / …).
  // Niente calcoli runtime → niente layout shift.

  const STORAGE_KEY  = cfg.agendaStorageKey || "aiucd2026-agenda";
  const OPENING_MS   = new Date(cfg.openingISO || "2026-06-03T12:00:00+02:00").getTime();
  const CLOSING_MS   = new Date(cfg.closingISO || "2026-06-05T18:00:00+02:00").getTime();
  const COMPANION    = (cfg.lang === "en" ? cfg.companionUrlEn : cfg.companionUrlIt) || "/companion/";
  const AGENDA_LABEL = cfg.lang === "en" ? "My AIUCD26" : "Il mio AIUCD26";
  const PROGRAM_URL  = cfg.programUrl || "/wp-content/plugins/aiucd-companion/static/data/generated/program.json";
  const MANIFEST_URL = cfg.manifestUrl || "/wp-content/plugins/aiucd-companion/static/data/generated/manifest.json";

  // Stato locale: programma fetchato (può restare null se la rete fallisce).
  let program = null;

  // ─────────────────────────────────────────────────────────────────────
  // 1. Caricamento program.json (lazy, idle, sessionStorage cache)
  // ─────────────────────────────────────────────────────────────────────
  function cachedProgram() {
    try {
      const raw = sessionStorage.getItem("aiucd-site-widgets:program");
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.version || !obj.payload) return null;
      // sessione di durata cap (1h) per evitare staleness se non si chiude la tab
      if (Date.now() - (obj.ts || 0) > 60 * 60 * 1000) return null;
      return obj;
    } catch (_) { return null; }
  }
  function storeProgram(version, payload) {
    try {
      sessionStorage.setItem("aiucd-site-widgets:program",
        JSON.stringify({ version, payload, ts: Date.now() }));
    } catch (_) { /* quota / private mode → no-op */ }
  }

  async function loadProgram() {
    // 1) Prova cache di sessione
    const cached = cachedProgram();
    if (cached) {
      program = cached.payload;
      render();
    }
    // 2) Fetch manifest per la version (cache-busting)
    let version = "0";
    try {
      const m = await fetch(MANIFEST_URL, { cache: "no-cache" });
      if (m.ok) version = (await m.json()).version || "0";
    } catch (_) { /* offline */ }
    // Se la cache copre già la versione corrente, no refetch
    if (cached && cached.version === version) return;
    try {
      const r = await fetch(PROGRAM_URL + "?v=" + encodeURIComponent(version),
                            { cache: "default" });
      if (!r.ok) return;
      program = await r.json();
      storeProgram(version, program);
      render();
    } catch (_) { /* keep degraded mode */ }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Computazione countdown info
  // ─────────────────────────────────────────────────────────────────────
  // Mini-dizionario per il fallback (quando program.json non è disponibile
  // o livestate.js fallisce); coerente con I18N di livestate.js.
  const FALLBACK_I18N = {
    it: { post: "Convegno concluso", live: "In corso", pre_days: (d) => `T-${d} giorni`, tomorrow: "Domani", opens_in: (m) => `Apre tra ${m} min` },
    en: { post: "Conference concluded", live: "Live now", pre_days: (d) => `T-${d} days`, tomorrow: "Tomorrow", opens_in: (m) => `Opens in ${m}m` },
  };

  function computeInfo() {
    const lang = cfg.lang === "en" ? "en" : "it";
    if (program && window.AIUCD_LIVESTATE) {
      try {
        return window.AIUCD_LIVESTATE.getCountdownInfo(program, lang);
      } catch (e) {
        // Difensivo: se livestate solleva, cadi nel fallback grossolano
        console && console.warn && console.warn("[site-widgets] livestate fail", e);
      }
    }
    // Fallback: stato a granulo grosso senza programma
    const T = FALLBACK_I18N[lang];
    const now = Date.now();
    if (now >= CLOSING_MS) return { state: "post", label: T.post, detail: "", progress: 1 };
    if (now >= OPENING_MS) return { state: "live", label: T.live, detail: "", progress: 0 };
    const diffMs = OPENING_MS - now;
    const diffMin = Math.round(diffMs / 60000);
    const diffDays = Math.ceil(diffMs / 86400000);
    if (diffDays > 1) return { state: "pre", label: T.pre_days(diffDays), detail: "", progress: 0 };
    if (diffMin > 60) return { state: "pre-soon", label: T.tomorrow, detail: "", progress: 0 };
    if (diffMin > 0)  return { state: "pre-imminent", label: T.opens_in(diffMin), detail: "", progress: 0 };
    return { state: "live", label: T.live, detail: "", progress: 0 };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. Agenda counter
  // ─────────────────────────────────────────────────────────────────────
  function readAgendaCount() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 0;
    } catch (_) { return 0; }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Render
  // ─────────────────────────────────────────────────────────────────────
  // Icona per ogni stato (small glyph). Resta semantico anche solo testo
  // (l'aria-label legge la label).
  const STATE_ICON = {
    "pre":           "▸",  // upcoming
    "pre-soon":      "▸",
    "pre-imminent":  "◉",  // imminent
    "live":          "●",  // live (pulsato via CSS)
    "break":         "▮",  // paused
    "post":          "✓",  // done
  };

  function isOnCompanion() {
    const normalize = u => u.replace(/\/$/, "");
    try {
      const here = normalize(location.pathname);
      const it = normalize(new URL(COMPANION, location.origin).pathname);
      return here === it;
    } catch (_) { return false; }
  }

  function render() {
    const info = computeInfo();
    const count = readAgendaCount();
    const onComp = isOnCompanion();

    // Countdown link: su companion punta a #programma (smooth scroll), altrove
    // al companion vero. Per evitare hash su pagine non companion (che non
    // hanno #programma) usiamo l'URL completo + hash.
    const cdHref = onComp ? "#programma" : (COMPANION + "#programma");
    const agendaHref = onComp ? "#" : (COMPANION + "?action=open-agenda");

    const progressPct = Math.round(Math.min(1, Math.max(0, info.progress || 0)) * 100);
    const showDetail = !!info.detail;
    const icon = STATE_ICON[info.state] || "•";

    slot.innerHTML = `
      <a href="${cdHref}"
         class="aiucd-chip aiucd-chip--countdown"
         data-state="${info.state}"
         aria-label="${escapeAttr(info.label + (info.detail ? " · " + info.detail : ""))}">
        <span class="aiucd-chip-icon" aria-hidden="true">${icon}</span>
        <span class="aiucd-chip-text">
          <span class="aiucd-chip-label">${escapeHtml(info.label)}</span>
          ${showDetail ? `<span class="aiucd-chip-detail">${escapeHtml(info.detail)}</span>` : ""}
        </span>
        <span class="aiucd-chip-progress" aria-hidden="true">
          <span class="aiucd-chip-progress-fill" style="width:${progressPct}%"></span>
        </span>
      </a>
      <a href="${agendaHref}"
         class="aiucd-chip aiucd-chip--agenda"
         data-empty="${count === 0 ? "true" : "false"}"
         aria-label="${escapeAttr(AGENDA_LABEL + ", " + count)}">
        <span class="aiucd-chip-star" aria-hidden="true">★</span>
        <span class="aiucd-chip-label">${escapeHtml(AGENDA_LABEL)}</span>
        <span class="aiucd-chip-count">${count}</span>
      </a>
    `;

    // Click adattivo: su pagina companion intercetta e dispatcha eventi
    // interni anziché redirect. Su pagine non companion lascia il navigate.
    if (onComp) {
      const cdEl = slot.querySelector(".aiucd-chip--countdown");
      const agEl = slot.querySelector(".aiucd-chip--agenda");
      if (cdEl) {
        cdEl.addEventListener("click", e => {
          // state=live + room nota → vai direttamente all'aula nello scheduler
          if (info.state === "live" && info.room) {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("companion:goto-room",
              { detail: { room: info.room } }));
          }
          // altri stati: lascia che l'anchor sposti il viewport su #programma
        });
      }
      if (agEl) {
        agEl.addEventListener("click", e => {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("companion:open-agenda-drawer"));
        });
      }
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ─────────────────────────────────────────────────────────────────────
  // 5. Loop & event wiring
  // ─────────────────────────────────────────────────────────────────────
  render();
  // refresh ogni 30s durante live (transizioni talk/break frequenti), ogni
  // 60s altrimenti. Cap minimo a 30s comunque.
  setInterval(() => render(), 30_000);
  // sync agenda counter da altre tab
  window.addEventListener("storage", e => { if (e.key === STORAGE_KEY) render(); });
  // sync su return-to-tab
  window.addEventListener("focus", render);

  // Fetch program in idle (non blocca TTFB)
  const startLoad = () => { loadProgram(); };
  if ("requestIdleCallback" in window) {
    requestIdleCallback(startLoad, { timeout: 2000 });
  } else {
    setTimeout(startLoad, 400);
  }

  // Espone refresh per il companion (chiamato quando aggiorna l'agenda
  // nella stessa tab — `storage` event non si emette in tab same-origin).
  window.AIUCD_SITE_WIDGETS = { refresh: render };
})();

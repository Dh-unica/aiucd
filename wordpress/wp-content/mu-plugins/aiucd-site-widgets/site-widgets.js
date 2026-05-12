/**
 * AIUCD Site Widgets
 * Renderizza due chip nell'header:
 *   - countdown convegno (T-N giorni / Apre tra N min / In corso / Concluso)
 *   - contatore agenda "★ Il mio AIUCD26 (N)" (solo se N > 0)
 * Si attacca a <div id="aiucd-site-widgets"> inserito dall'header del tema.
 * Funziona in ogni pagina del sito (homepage, programma, comitati, …) e
 * dialoga col companion via localStorage + deep-link ?action=open-agenda.
 */
(function () {
  const cfg = window.AIUCD_SITE_CONFIG || {};
  const slot = document.getElementById("aiucd-site-widgets");
  if (!slot) return;

  const STORAGE_KEY  = cfg.agendaStorageKey || "aiucd2026-agenda";
  const OPENING_MS   = new Date(cfg.openingISO || "2026-06-03T12:00:00+02:00").getTime();
  const CLOSING_MS   = new Date(cfg.closingISO || "2026-06-05T18:00:00+02:00").getTime();
  const COMPANION    = (cfg.lang === "en" ? cfg.companionUrlEn : cfg.companionUrlIt) || "/companion/";
  const AGENDA_LABEL = cfg.lang === "en" ? "My AIUCD26" : "Il mio AIUCD26";

  // ── Stato countdown ──
  // pre / pre-soon (<24h) / pre-imminent (<60min) / live / post
  function computeCountdown() {
    const now = Date.now();
    if (now >= CLOSING_MS) return { state: "post", label: cfg.lang === "en" ? "Concluded" : "Concluso" };
    if (now >= OPENING_MS) return { state: "live", label: cfg.lang === "en" ? "Live now" : "In corso" };
    const diffMs = OPENING_MS - now;
    const diffMin = Math.round(diffMs / 60000);
    const diffDays = Math.ceil(diffMs / 86400000);
    if (diffDays > 1) return { state: "pre", label: `T-${diffDays} ${cfg.lang === "en" ? "days" : "giorni"}` };
    if (diffMin > 60) return { state: "pre-soon", label: cfg.lang === "en" ? "Tomorrow" : "Domani" };
    if (diffMin > 0)  return { state: "pre-imminent", label: cfg.lang === "en" ? `Opens in ${diffMin}m` : `Apre tra ${diffMin} min` };
    return { state: "live", label: cfg.lang === "en" ? "Live now" : "In corso" };
  }

  function readAgendaCount() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 0;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.length : 0;
    } catch { return 0; }
  }

  // ── Render ──
  function render() {
    const cd = computeCountdown();
    const count = readAgendaCount();
    const showAgenda = count > 0;
    const onCompanion = location.pathname.replace(/\/$/, "") ===
                         new URL(COMPANION, location.origin).pathname.replace(/\/$/, "");

    // Companion link: T-22 GIORNI è sempre un link al companion.
    // Su pagina companion, il link torna in cima e simula click sul programma.
    const cdHref = onCompanion ? "#programma" : COMPANION;

    slot.innerHTML = `
      <a href="${cdHref}" class="aiucd-chip aiucd-chip--countdown" data-state="${cd.state}" aria-label="${cd.label}">
        <span class="aiucd-chip-dot" aria-hidden="true"></span>
        <span class="aiucd-chip-label">${cd.label}</span>
      </a>
      ${showAgenda ? `
      <a href="${COMPANION}?action=open-agenda" class="aiucd-chip aiucd-chip--agenda" aria-label="${AGENDA_LABEL}, ${count}">
        <span class="aiucd-chip-star" aria-hidden="true">★</span>
        <span class="aiucd-chip-label">${AGENDA_LABEL}</span>
        <span class="aiucd-chip-count">${count}</span>
      </a>` : ""}
    `;
  }

  // ── Loop ──
  render();
  // Ricalcolo countdown ogni minuto (transizioni di stato).
  setInterval(render, 60_000);
  // Ricalcolo agenda counter ad ogni storage event (altre tab) + focus window.
  window.addEventListener("storage", e => { if (e.key === STORAGE_KEY) render(); });
  window.addEventListener("focus", render);

  // Espone uno hook che il companion può chiamare quando aggiorna l'agenda
  // senza passare per il storage event (stessa tab).
  window.AIUCD_SITE_WIDGETS = { refresh: render };
})();

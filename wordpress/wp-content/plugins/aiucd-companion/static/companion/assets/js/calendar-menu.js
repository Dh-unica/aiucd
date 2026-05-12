// AIUCD 2026 Companion · menu/popover "Aggiungi al calendario"
// Tre opzioni esplicite: Google · Apple/iPhone · Outlook · scarica .ics

import * as cal from "./calendar-export.js";

let _openMenu = null;

/**
 * Mostra il menu ancorato a `triggerEl` per UN evento (paper + slot).
 * Esempio: nel modale del talk.
 */
export function showSingleEventMenu(triggerEl, paper, slot) {
  const ev = cal.eventFromPaper(paper, slot);
  if (!ev) {
    alert("Per questa relazione non ho ancora un orario, quindi non posso aggiungerla al tuo calendario.");
    return;
  }
  showMenu(triggerEl, [
    {
      icon: "📅",
      label: "Google Calendar",
      sub: "Apre Google Calendar nel browser",
      action: () => window.open(cal.googleCalendarUrl(ev), "_blank", "noopener"),
    },
    {
      icon: "📱",
      label: "Apple Calendar / iPhone",
      sub: "Scarica il file: tap su un iPhone aggiunge l'evento",
      action: () => cal.downloadIcs([ev], `aiucd-talk-${paper.id}.ics`),
    },
    {
      icon: "💼",
      label: "Outlook Web",
      sub: "Apre Outlook nel browser",
      action: () => window.open(cal.outlookCalendarUrl(ev), "_blank", "noopener"),
    },
    {
      icon: "📥",
      label: "Scarica file calendario (.ics)",
      sub: "Per qualsiasi altro client (Thunderbird, Fastmail, ecc.)",
      action: () => cal.downloadIcs([ev], `aiucd-talk-${paper.id}.ics`),
    },
  ], `Aggiungi “${truncate(paper.title, 50)}” al tuo calendario`);
}

/**
 * Mostra il menu per L'INTERA agenda (lista di papers + slot).
 * Esempio: nella vista "I miei talk".
 */
export function showAgendaMenu(triggerEl, items, papersById) {
  if (!items.length) {
    alert("Niente in agenda da esportare. Salva prima qualche relazione con la stella.");
    return;
  }
  const events = items.map(it => {
    const paper = papersById.get(it.id);
    return paper ? cal.eventFromPaper(paper, it) : null;
  }).filter(Boolean);

  if (!events.length) {
    alert("Per le relazioni in agenda non ho ancora orari da esportare.");
    return;
  }

  showMenu(triggerEl, [
    {
      icon: "📱",
      label: "Apple Calendar / iPhone",
      sub: `Scarica il file: tap apre l'app calendario e aggiunge ${events.length} eventi`,
      action: () => cal.downloadIcs(events, "aiucd-2026-agenda.ics"),
    },
    {
      icon: "📅",
      label: "Google Calendar",
      sub: `Scarica il file e importa con "Importa" da Impostazioni`,
      action: () => {
        cal.downloadIcs(events, "aiucd-2026-agenda.ics");
        setTimeout(() => {
          if (confirm("File scaricato. Apro Google Calendar per l'importazione?\n\nClicca OK, poi: ⚙ Impostazioni → Importa ed esporta → Seleziona file.")) {
            window.open("https://calendar.google.com/calendar/u/0/r/settings/export", "_blank", "noopener");
          }
        }, 600);
      },
    },
    {
      icon: "💼",
      label: "Outlook / qualsiasi altro",
      sub: `Scarica il file .ics standard, importalo in qualsiasi client`,
      action: () => cal.downloadIcs(events, "aiucd-2026-agenda.ics"),
    },
  ], `Esporta la tua agenda · ${events.length} relazioni`);
}

// ===== popover engine ===============================================

function showMenu(triggerEl, options, title) {
  closeMenu();

  const menu = document.createElement("div");
  menu.className = "cal-menu";
  menu.innerHTML = `
    <div class="cal-menu-head">
      <div class="cal-menu-title">${escapeHtml(title)}</div>
      <button class="cal-menu-close" aria-label="Chiudi">×</button>
    </div>
    <div class="cal-menu-list"></div>
  `;
  const list = menu.querySelector(".cal-menu-list");
  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "cal-menu-item";
    btn.innerHTML = `
      <span class="cal-icon" aria-hidden="true">${opt.icon}</span>
      <span class="cal-text">
        <span class="cal-label">${escapeHtml(opt.label)}</span>
        <span class="cal-sub">${escapeHtml(opt.sub)}</span>
      </span>
    `;
    btn.addEventListener("click", () => {
      opt.action();
      closeMenu();
    });
    list.append(btn);
  }
  menu.querySelector(".cal-menu-close").addEventListener("click", closeMenu);

  document.body.appendChild(menu);
  positionMenu(menu, triggerEl);

  _openMenu = menu;
  // Click fuori chiude
  setTimeout(() => {
    document.addEventListener("click", outsideHandler);
  }, 0);
}

function outsideHandler(e) {
  if (_openMenu && !_openMenu.contains(e.target)) closeMenu();
}

function closeMenu() {
  if (_openMenu) {
    _openMenu.remove();
    _openMenu = null;
  }
  document.removeEventListener("click", outsideHandler);
}

function positionMenu(menu, triggerEl) {
  // Su mobile (≤620 px): bottom sheet
  const isMobile = window.innerWidth <= 620;
  if (isMobile) {
    menu.classList.add("bottom-sheet");
    return;
  }
  // Desktop: ancorato sotto il trigger, allineato a destra.
  // Il menu va prima reso visibile (è già stato appeso al body) per misurarne
  // l'altezza reale e decidere se aprire verso il basso o verso l'alto.
  const rect = triggerEl.getBoundingClientRect();
  const menuWidth = 360;
  const margin = 12;
  const viewportH = window.innerHeight;
  menu.style.position = "fixed";
  menu.style.width = `${menuWidth}px`;
  // Misura altezza dopo aver impostato la larghezza fissa (così wrap già applicato)
  const menuH = menu.offsetHeight;
  const spaceBelow = viewportH - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  let top;
  if (menuH + 8 <= spaceBelow) {
    top = rect.bottom + 8;
  } else if (menuH + 8 <= spaceAbove) {
    top = rect.top - 8 - menuH;
  } else {
    // Né sotto né sopra c'è spazio sufficiente: ancora al lato disponibile più
    // capiente, clampando per restare sempre interamente nel viewport.
    const fallbackTop = spaceBelow >= spaceAbove ? rect.bottom + 8 : margin;
    top = Math.max(margin, Math.min(viewportH - menuH - margin, fallbackTop));
  }
  const left = Math.max(margin, Math.min(window.innerWidth - menuWidth - margin, rect.right - menuWidth));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function truncate(s, n) {
  if (!s || s.length <= n) return s || "";
  return s.slice(0, n).trim() + "…";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

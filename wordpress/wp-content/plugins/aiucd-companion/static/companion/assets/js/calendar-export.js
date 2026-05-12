// AIUCD 2026 Companion · esportazione al calendario personale
// Tre destinazioni:
//   - Google Calendar: URL "TEMPLATE" che apre il composer di GCal in browser
//     (funziona solo per UN evento alla volta — è una limitazione di GCal)
//   - Apple/iPhone Calendar: download di file .ics (su Safari iOS Apple Calendar
//     intercetta il download e propone "Aggiungi tutti gli eventi")
//   - Outlook web: URL TEMPLATE simile a GCal
//   - Generic .ics download: per qualunque altro client

const TZ = "Europe/Rome";

/**
 * Compone l'URL di Google Calendar per un singolo evento.
 * GCal non offre un endpoint per importare più eventi via URL — per quello
 * serve scaricare il .ics e usare l'import manuale.
 */
export function googleCalendarUrl({ title, start, end, location, description }) {
  const fmt = d => d.replace(/[-:]/g, "").replace(".000Z", "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: description || "",
    location: location || "",
    ctz: TZ,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * Compone l'URL di Outlook Web Calendar per un singolo evento.
 */
export function outlookCalendarUrl({ title, start, end, location, description }) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: title,
    startdt: start,
    enddt: end,
    location: location || "",
    body: description || "",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

/**
 * Genera il file .ics per uno o più eventi e lo scarica come download.
 * Su iOS Safari / Apple Calendar questo viene riconosciuto e si propone
 * di aggiungere gli eventi al calendario predefinito.
 */
export function downloadIcs(events, filename = "aiucd2026.ics") {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AIUCD 2026 Companion//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of events) {
    const dts = formatIcsDate(e.start);
    const dte = formatIcsDate(e.end);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid || `aiucd2026-${cryptoRandom()}`}@aiucd2026.unica.it`,
      `DTSTART;TZID=${TZ}:${dts}`,
      `DTEND;TZID=${TZ}:${dte}`,
      `SUMMARY:${escapeIcs(e.title)}`,
      `LOCATION:${escapeIcs(e.location || "")}`,
      `DESCRIPTION:${escapeIcs(e.description || "")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatIcsDate(iso) {
  // Accetta sia "2026-06-04T15:40:00" sia oggetti Date
  const s = typeof iso === "string" ? iso : iso.toISOString();
  return s.replace(/[-:]/g, "").replace(/\.\d{3}Z?$/, "").replace("Z", "").slice(0, 15);
}

function escapeIcs(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/[,;]/g, c => "\\" + c).replace(/\n/g, "\\n");
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Costruisce un evento canonico dal paper + slot del companion.
 */
export function eventFromPaper(paper, slot) {
  if (!slot || !slot.day || !slot.start || !slot.end) return null;
  const day = slot.day;             // "2026-06-04"
  const start = `${day}T${slot.start}:00`;
  const end = `${day}T${slot.end}:00`;
  const authors = (paper.authors || []).map(a => a.name).join(", ");
  return {
    uid: `aiucd2026-paper-${paper.id}`,
    title: `[${slot.room}] ${paper.title}`,
    start, end,
    location: `${slot.room}, Campus Sa Duchessa, Università di Cagliari`,
    description: `${authors}\n\n${(paper.abstract || "").slice(0, 600)}\n\nAIUCD 2026 · #${paper.id}`,
  };
}

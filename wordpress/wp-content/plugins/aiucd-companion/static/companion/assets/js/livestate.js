// AIUCD 2026 Companion · stato live del convegno
// Calcola "now" rispetto al programma e indica: pre / live / break / post.

// Per testing: ?simulate=2026-06-04T10:30 sostituisce Date.now() con quella data.
function getNow() {
  const params = new URLSearchParams(window.location.search);
  const sim = params.get("simulate");
  if (sim) {
    const d = new Date(sim);
    if (!isNaN(d)) return d;
  }
  return new Date();
}

// Restituisce un Date che rappresenta l'istante (date, hhmm) interpretato
// nel fuso Europe/Rome (gestisce DST automaticamente via Intl).
// In passato si usava `new Date(Y, M-1, D, h, m)` che interpretava nel fuso
// LOCALE del browser, sbagliando per utenti remoti (es. partecipante UTC-5).
function parseTime(date, hhmm) {
  const [Y, M, D] = date.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  // Step 1: assemble UTC istant from raw components
  const utcTs = Date.UTC(Y, M - 1, D, h, m, 0);
  // Step 2: ask Intl how that istant looks in Europe/Rome
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(utcTs)).filter(p => p.type !== "literal")
      .map(p => [p.type, +p.value])
  );
  const romeAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // Step 3: offset is how far Rome is from UTC for that date (DST-aware)
  const offsetMs = romeAsUtc - utcTs;
  // Step 4: shift back so the result, when displayed in Rome, reads (Y,M,D,h,m)
  return new Date(utcTs - offsetMs);
}

function dayBounds(day) {
  const blocks = day.blocks || [];
  let first = null, last = null;
  for (const b of blocks) {
    if (b.start) {
      const s = parseTime(day.date, b.start);
      if (!first || s < first) first = s;
    }
    if (b.end) {
      const e = parseTime(day.date, b.end);
      if (!last || e > last) last = e;
    }
    if (b.type === "session") {
      for (const t of b.tracks) {
        for (const tk of t.talks) {
          if (tk.start) { const s = parseTime(day.date, tk.start); if (!first || s < first) first = s; }
          if (tk.end)   { const e = parseTime(day.date, tk.end);   if (!last  || e > last)  last  = e; }
        }
      }
    }
  }
  return [first, last];
}

export function liveState(program) {
  const now = getNow();
  const days = program.days || [];
  if (!days.length) return { state: "pre", now, day: null };

  const firstStart = parseTime(days[0].date, days[0].blocks[0]?.start || "00:00");
  const lastEnd = (() => {
    const lastDay = days[days.length - 1];
    const [, end] = dayBounds(lastDay);
    return end || parseTime(lastDay.date, "23:59");
  })();

  if (now < firstStart) return { state: "pre", now, day: null };
  if (now > lastEnd)    return { state: "post", now, day: null };

  // Trova il giorno corrente
  const currentDate = now.toISOString().slice(0, 10);
  const day = days.find(d => d.date === currentDate);
  if (!day) {
    // tra giorni del convegno (notte)
    return { state: "break", now, day: null };
  }

  // Trova se siamo in un blocco live, in pausa, o in attesa
  for (const block of day.blocks) {
    if (block.type === "session") {
      for (const t of block.tracks) {
        for (const tk of t.talks) {
          if (tk.start && tk.end) {
            const s = parseTime(day.date, tk.start);
            const e = parseTime(day.date, tk.end);
            if (now >= s && now < e) {
              return { state: "live", now, day, block, track: t, talk: tk };
            }
          }
        }
      }
    }
    if (block.start && block.end) {
      const s = parseTime(day.date, block.start);
      const e = parseTime(day.date, block.end);
      if (now >= s && now < e) {
        if (block.type === "plenary") return { state: "live", now, day, block };
        if (block.type === "break") return { state: "break", now, day, block };
      }
    }
  }
  return { state: "break", now, day };
}

export function nowMinutesOfDay(date) {
  const now = getNow();
  if (now.toISOString().slice(0, 10) !== date) return null;
  return now.getHours() * 60 + now.getMinutes();
}

export function getCurrentDate() {
  return getNow().toISOString().slice(0, 10);
}

// Restituisce l'orario di apertura del convegno (primo block del primo giorno).
export function getOpeningTime(program) {
  const days = program?.days || [];
  if (!days.length) return null;
  const firstDay = days[0];
  const firstBlock = firstDay.blocks?.find(b => b.start);
  if (!firstBlock?.start) return null;
  return parseTime(firstDay.date, firstBlock.start);
}

// Conta quanti talk paralleli sono in corso "ora" e calcola il minuto del prossimo
// cambio (fine talk, fine break o inizio sessione). Usato dal countdown topbar.
function liveSnapshotInfo(program) {
  const ls = liveState(program);
  if (!ls.day) return { liveCount: 0, nextChangeMin: null };
  const now = ls.now;
  const day = ls.day;
  let liveCount = 0;
  let nextChange = null;
  for (const block of day.blocks || []) {
    if (block.type === "session") {
      for (const t of block.tracks || []) {
        for (const tk of t.talks || []) {
          if (!tk.start || !tk.end) continue;
          const s = parseTime(day.date, tk.start);
          const e = parseTime(day.date, tk.end);
          if (now >= s && now < e) {
            liveCount++;
            if (!nextChange || e < nextChange) nextChange = e;
          } else if (now < s) {
            if (!nextChange || s < nextChange) nextChange = s;
          }
        }
      }
    }
    if (block.start && block.end) {
      const s = parseTime(day.date, block.start);
      const e = parseTime(day.date, block.end);
      if (now < s) {
        if (!nextChange || s < nextChange) nextChange = s;
      } else if (now >= s && now < e) {
        if (!nextChange || e < nextChange) nextChange = e;
      }
    }
  }
  const nextChangeMin = nextChange ? Math.max(0, Math.round((nextChange - now) / 60000)) : null;
  return { liveCount, nextChangeMin };
}

// True se "now" cade nell'ultimo giorno del convegno.
function isLastDay(program) {
  const days = program?.days || [];
  if (!days.length) return false;
  const today = getCurrentDate();
  return today === days[days.length - 1].date;
}

// Etichetta granulare del countdown / live-indicator topbar.
// Stati: pre | pre-soon (<24h) | pre-imminent (<60min) | live | break | post
// Restituisce anche progress (0..1), detail (sub-text), liveCount, nextChangeMin, lastDay.
export function getCountdownInfo(program) {
  const now = getNow();
  const ls = liveState(program);
  const opening = getOpeningTime(program);
  const lastDay = isLastDay(program);

  if (ls.state === "live") {
    const snap = liveSnapshotInfo(program);
    let progress = 0;
    if (ls.talk?.start && ls.talk?.end && ls.day) {
      const s = parseTime(ls.day.date, ls.talk.start);
      const e = parseTime(ls.day.date, ls.talk.end);
      if (e > s) progress = Math.min(1, Math.max(0, (now - s) / (e - s)));
    } else if (ls.block?.start && ls.block?.end && ls.day) {
      const s = parseTime(ls.day.date, ls.block.start);
      const e = parseTime(ls.day.date, ls.block.end);
      if (e > s) progress = Math.min(1, Math.max(0, (now - s) / (e - s)));
    }
    const label = snap.liveCount > 1 ? `${snap.liveCount} in corso` : "In corso";
    const detail = snap.nextChangeMin != null
      ? `cambio fra ${snap.nextChangeMin} min`
      : "";
    return { state: "live", label, detail, progress, liveCount: snap.liveCount, nextChangeMin: snap.nextChangeMin, lastDay };
  }

  if (ls.state === "post") {
    return { state: "post", label: "Convegno concluso", detail: "", progress: 1, lastDay };
  }

  if (ls.state === "break") {
    const snap = liveSnapshotInfo(program);
    let progress = 0;
    if (ls.block?.start && ls.block?.end && ls.day) {
      const s = parseTime(ls.day.date, ls.block.start);
      const e = parseTime(ls.day.date, ls.block.end);
      if (e > s) progress = Math.min(1, Math.max(0, (now - s) / (e - s)));
    }
    const detail = snap.nextChangeMin != null
      ? `prossimo cambio fra ${snap.nextChangeMin} min`
      : "";
    return { state: "break", label: lastDay ? "Pausa · ultimo giorno" : "Pausa", detail, progress, nextChangeMin: snap.nextChangeMin, lastDay };
  }

  if (!opening) return { state: "pre", label: "Pre-convegno", detail: "", progress: 0, lastDay: false };

  const diffMs = opening - now;
  const diffMin = Math.round(diffMs / 60000);
  const diffHr  = Math.round(diffMs / 3600000);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const dayShort  = opening.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  const timeShort = opening.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  // Progress pre-: finestra arbitraria di 30 giorni dall'apertura, riempita man mano
  // che ci si avvicina. Usata solo per la barra visiva, non per logica.
  const preWindowMs = 30 * 24 * 60 * 60 * 1000;
  const progressPre = Math.min(1, Math.max(0, 1 - (diffMs / preWindowMs)));

  if (diffDays > 1) {
    return { state: "pre", label: `T-${diffDays} giorni`, detail: `${dayShort} ${timeShort}`, progress: progressPre, lastDay: false };
  }
  if (diffHr > 1) {
    return { state: "pre-soon", label: "Domani", detail: `apre ${timeShort}`, progress: progressPre, lastDay: false };
  }
  if (diffMin > 0) {
    // pre-imminent: progress riempito quasi del tutto, con ultimo 5% riservato all'apertura
    const progressImm = Math.min(0.99, 1 - (diffMin / 60));
    return { state: "pre-imminent", label: `Apre tra ${diffMin} min`, detail: "", progress: progressImm, lastDay: false };
  }
  return { state: "live", label: "In corso", detail: "", progress: 0, lastDay };
}

export { getNow };

// ─────────────────────────────────────────────────────────────────────────
// Clock skew check
// Verifica se l'orologio del dispositivo utente è in linea col server. Se
// il delta supera la soglia, ritorna un descrittore (deltaMin, direzione).
// Pensato per essere chiamato all'avvio dell'app; il banner UI viene
// gestito altrove.
// ─────────────────────────────────────────────────────────────────────────
export async function checkClockSkew(thresholdMin = 5) {
  if (typeof window === "undefined" || !window.fetch) return null;
  // Ignora skew quando si sta simulando un istante: l'utente sta facendo QA
  if (new URLSearchParams(window.location.search).get("simulate")) return null;
  try {
    const t0 = Date.now();
    // HEAD sulla pagina corrente per leggere l'header Date del server.
    const res = await fetch(window.location.pathname, {
      method: "HEAD",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    const t1 = Date.now();
    const dateHeader = res.headers.get("date");
    if (!dateHeader) return null;
    const serverMs = new Date(dateHeader).getTime();
    if (!Number.isFinite(serverMs)) return null;
    const rtt = (t1 - t0) / 2;
    // Stima ottimistica del clock client al momento in cui il server ha emesso Date:
    const clientMsAtServerEmit = t0 + rtt;
    const deltaMs = clientMsAtServerEmit - serverMs;
    const deltaMin = Math.round(deltaMs / 60000);
    if (Math.abs(deltaMin) < thresholdMin) return { deltaMin, ok: true };
    return { deltaMin, ok: false, direction: deltaMin > 0 ? "ahead" : "behind" };
  } catch {
    return null;
  }
}

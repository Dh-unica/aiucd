/**
 * AIUCD Site Widgets · livestate (companion-compat)
 *
 * Porting dell'oracolo `companion/assets/js/livestate.js` come modulo classico
 * usabile da `site-widgets.js`. Espone le 4 funzioni pure che servono al chip
 * countdown / live-indicator nell'header globale del sito:
 *
 *   window.AIUCD_LIVESTATE = {
 *     getNow,            // Date corrente, rispetta ?simulate=YYYY-MM-DDTHH:MM
 *     getOpeningTime,    // Date di apertura (primo blocco del primo giorno)
 *     liveState,         // { state: pre|live|break|post, day, block, track, talk }
 *     getCountdownInfo,  // { state, label, detail, progress, liveCount, nextChangeMin, lastDay }
 *   };
 *
 * Lo stato è derivato dal `program.json` quando disponibile; senza, le funzioni
 * degradano a {state:"pre", label:"Pre-convegno"} (vedi fallback in
 * `getCountdownInfo`).
 *
 * Single source of truth della logica live; manteniamo IT-only (etichette in
 * italiano) — la versione EN è gestita dallo strato di rendering, non qui.
 */
(function () {
  function getNow() {
    try {
      const params = new URLSearchParams(window.location.search);
      const sim = params.get("simulate");
      if (sim) {
        const d = new Date(sim);
        if (!isNaN(d)) return d;
      }
    } catch (_) { /* no-op */ }
    return new Date();
  }

  // Date(date, hhmm) interpretato nel fuso Europe/Rome (DST-aware). Identico
  // all'omonimo in companion/assets/js/livestate.js.
  function parseTime(date, hhmm) {
    const [Y, M, D] = date.split("-").map(Number);
    const [h, m] = hhmm.split(":").map(Number);
    const utcTs = Date.UTC(Y, M - 1, D, h, m, 0);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(utcTs))
        .filter(p => p.type !== "literal")
        .map(p => [p.type, +p.value])
    );
    const romeAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day,
                               parts.hour, parts.minute, parts.second);
    const offsetMs = romeAsUtc - utcTs;
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
        for (const t of (b.tracks || [])) {
          for (const tk of (t.talks || [])) {
            if (tk.start) { const s = parseTime(day.date, tk.start); if (!first || s < first) first = s; }
            if (tk.end)   { const e = parseTime(day.date, tk.end);   if (!last  || e > last)  last  = e; }
          }
        }
      }
    }
    return [first, last];
  }

  function liveState(program) {
    const now = getNow();
    const days = (program && program.days) || [];
    if (!days.length) return { state: "pre", now, day: null };

    const firstStart = parseTime(days[0].date, (days[0].blocks && days[0].blocks[0] && days[0].blocks[0].start) || "00:00");
    const lastEnd = (() => {
      const lastDay = days[days.length - 1];
      const [, end] = dayBounds(lastDay);
      return end || parseTime(lastDay.date, "23:59");
    })();

    if (now < firstStart) return { state: "pre", now, day: null };
    if (now > lastEnd)    return { state: "post", now, day: null };

    const currentDate = now.toISOString().slice(0, 10);
    const day = days.find(d => d.date === currentDate);
    if (!day) return { state: "break", now, day: null };

    for (const block of (day.blocks || [])) {
      if (block.type === "session") {
        for (const t of (block.tracks || [])) {
          for (const tk of (t.talks || [])) {
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

  function getOpeningTime(program) {
    const days = (program && program.days) || [];
    if (!days.length) return null;
    const firstDay = days[0];
    const firstBlock = (firstDay.blocks || []).find(b => b.start);
    if (!firstBlock || !firstBlock.start) return null;
    return parseTime(firstDay.date, firstBlock.start);
  }

  function liveSnapshotInfo(program) {
    const ls = liveState(program);
    if (!ls.day) return { liveCount: 0, nextChangeMin: null };
    const now = ls.now;
    const day = ls.day;
    let liveCount = 0;
    let nextChange = null;
    for (const block of (day.blocks || [])) {
      if (block.type === "session") {
        for (const t of (block.tracks || [])) {
          for (const tk of (t.talks || [])) {
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

  function isLastDay(program) {
    const days = (program && program.days) || [];
    if (!days.length) return false;
    const today = getNow().toISOString().slice(0, 10);
    return today === days[days.length - 1].date;
  }

  function getCountdownInfo(program) {
    const now = getNow();
    const ls = liveState(program);
    const opening = getOpeningTime(program);
    const lastDay = isLastDay(program);

    if (ls.state === "live") {
      const snap = liveSnapshotInfo(program);
      let progress = 0;
      if (ls.talk && ls.talk.start && ls.talk.end && ls.day) {
        const s = parseTime(ls.day.date, ls.talk.start);
        const e = parseTime(ls.day.date, ls.talk.end);
        if (e > s) progress = Math.min(1, Math.max(0, (now - s) / (e - s)));
      } else if (ls.block && ls.block.start && ls.block.end && ls.day) {
        const s = parseTime(ls.day.date, ls.block.start);
        const e = parseTime(ls.day.date, ls.block.end);
        if (e > s) progress = Math.min(1, Math.max(0, (now - s) / (e - s)));
      }
      const label = snap.liveCount > 1 ? `${snap.liveCount} in corso` : "In corso";
      const detail = snap.nextChangeMin != null ? `cambio fra ${snap.nextChangeMin} min` : "";
      return { state: "live", label, detail, progress,
               liveCount: snap.liveCount, nextChangeMin: snap.nextChangeMin,
               lastDay, talk: ls.talk || null, room: ls.track && ls.track.room || null };
    }

    if (ls.state === "post") {
      return { state: "post", label: "Convegno concluso", detail: "", progress: 1, lastDay };
    }

    if (ls.state === "break") {
      const snap = liveSnapshotInfo(program);
      let progress = 0;
      if (ls.block && ls.block.start && ls.block.end && ls.day) {
        const s = parseTime(ls.day.date, ls.block.start);
        const e = parseTime(ls.day.date, ls.block.end);
        if (e > s) progress = Math.min(1, Math.max(0, (now - s) / (e - s)));
      }
      const detail = snap.nextChangeMin != null ? `riprende fra ${snap.nextChangeMin} min` : "";
      return { state: "break", label: lastDay ? "Pausa · ultimo giorno" : "Pausa",
               detail, progress, nextChangeMin: snap.nextChangeMin, lastDay };
    }

    if (!opening) {
      return { state: "pre", label: "Pre-convegno", detail: "", progress: 0, lastDay: false };
    }

    const diffMs = opening - now;
    const diffMin = Math.round(diffMs / 60000);
    const diffHr  = Math.round(diffMs / 3600000);
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    const dayShort  = opening.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
    const timeShort = opening.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

    const preWindowMs = 30 * 24 * 60 * 60 * 1000;
    const progressPre = Math.min(1, Math.max(0, 1 - (diffMs / preWindowMs)));

    if (diffDays > 1) {
      return { state: "pre", label: `T-${diffDays} giorni`, detail: `${dayShort} ${timeShort}`, progress: progressPre, lastDay: false };
    }
    if (diffHr > 1) {
      return { state: "pre-soon", label: "Domani", detail: `apre ${timeShort}`, progress: progressPre, lastDay: false };
    }
    if (diffMin > 0) {
      const progressImm = Math.min(0.99, 1 - (diffMin / 60));
      return { state: "pre-imminent", label: `Apre tra ${diffMin} min`, detail: "", progress: progressImm, lastDay: false };
    }
    return { state: "live", label: "In corso", detail: "", progress: 0, lastDay };
  }

  window.AIUCD_LIVESTATE = { getNow, getOpeningTime, liveState, getCountdownInfo };
})();

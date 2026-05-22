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
 *     getCountdownInfo,  // (program, lang) → { state, label, detail, progress, … }
 *   };
 *
 * Lo stato è derivato dal `program.json` quando disponibile; senza, le funzioni
 * degradano a {state:"pre", label:"Pre-convegno"} (vedi fallback in
 * `getCountdownInfo`).
 *
 * Bilingue: tutte le label/detail sono in italiano per default; passare
 * `lang === "en"` a `getCountdownInfo` produce le stringhe inglesi corrispondenti.
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

  // Prossimo evento del giorno che inizia dopo `now`. Usato per i buchi di
  // programma: il badge annuncia cosa sta per iniziare invece di "Pausa".
  // I blocchi sessione non hanno start a livello di blocco → primo talk.
  function nextEventOfDay(day, now) {
    let best = null;
    for (const block of (day.blocks || [])) {
      let start = block.start ? parseTime(day.date, block.start) : null;
      if (block.type === "session") {
        let sFirst = null;
        for (const t of (block.tracks || [])) {
          for (const tk of (t.talks || [])) {
            if (tk.start) {
              const s = parseTime(day.date, tk.start);
              if (!sFirst || s < sFirst) sFirst = s;
            }
          }
        }
        if (sFirst && (!start || sFirst < start)) start = sFirst;
      }
      if (start && start > now && (!best || start < best.when)) {
        best = {
          when: start,
          name: block.title || block.label || null,
          name_en: block.title_en || block.label_en || null,
        };
      }
    }
    return best;
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
          if (block.type === "break") {
            // La colazione di benvenuto è l'apertura, non una pausa.
            if (block.opening) return { state: "live", now, day, block };
            return { state: "break", now, day, block };
          }
        }
      }
    }
    // Buco di programma: stato "break" senza blocco-pausa reale; `next`
    // permette al badge di annunciare il prossimo evento.
    return { state: "break", now, day, next: nextEventOfDay(day, now) };
  }

  function getOpeningTime(program) {
    const days = (program && program.days) || [];
    if (!days.length) return null;
    const firstDay = days[0];
    const firstBlock = (firstDay.blocks || []).find(b => b.start);
    if (!firstBlock || !firstBlock.start) return null;
    return parseTime(firstDay.date, firstBlock.start);
  }

  // Numero di giorni di CALENDARIO (fuso Europe/Rome) che separano `from` da
  // `target`. A differenza di una differenza in millisecondi divisa per 24h,
  // questo conteggio cambia a MEZZANOTTE: due istanti dello stesso giorno
  // solare danno sempre lo stesso risultato, indipendentemente dall'orario
  // di apertura del convegno.
  function calendarDaysUntil(target, from) {
    const romeMidnightTs = (date) => {
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Rome",
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      const p = Object.fromEntries(
        fmt.formatToParts(date)
          .filter(x => x.type !== "literal")
          .map(x => [x.type, +x.value])
      );
      return Date.UTC(p.year, p.month - 1, p.day);
    };
    return Math.round((romeMidnightTs(target) - romeMidnightTs(from)) / 86400000);
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

  // Mini-dizionario di stringhe: tutto ciò che il widget mostra nei chip
  // countdown è qui. Aggiungere nuove lingue = aggiungere una chiave qui.
  const I18N = {
    it: {
      live_single:    "In corso",
      live_multi:     (n) => `${n} in corso`,
      live_change_in: (m) => `cambio fra ${m} min`,
      post:           "Convegno concluso",
      break_lastday:  "Pausa · ultimo giorno",
      break:          "Pausa",
      break_resume:   (m) => `riprende fra ${m} min`,
      pre_static:     "Pre-convegno",
      pre_days:       (d) => `-${d} giorni`,
      tomorrow:       "Domani",
      today:          "Oggi",
      opens_at:       (t) => `apre ${t}`,
      opens_in:       (m) => `Apre tra ${m} min`,
      soon:           "A breve",
      sessions_generic: "Sessioni parallele",
      locale:         "it-IT",
    },
    en: {
      live_single:    "Live now",
      live_multi:     (n) => `${n} live`,
      live_change_in: (m) => `next change in ${m}m`,
      post:           "Conference concluded",
      break_lastday:  "Break · last day",
      break:          "Break",
      break_resume:   (m) => `resumes in ${m}m`,
      pre_static:     "Pre-conference",
      pre_days:       (d) => `-${d} days`,
      tomorrow:       "Tomorrow",
      today:          "Today",
      opens_at:       (t) => `opens at ${t}`,
      opens_in:       (m) => `Opens in ${m}m`,
      soon:           "Soon",
      sessions_generic: "Parallel sessions",
      locale:         "en-GB",
    },
  };

  function getCountdownInfo(program, lang) {
    const T = I18N[lang === "en" ? "en" : "it"];
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
      const label = snap.liveCount > 1 ? T.live_multi(snap.liveCount) : T.live_single;
      let detail = snap.nextChangeMin != null ? T.live_change_in(snap.nextChangeMin) : "";
      // Evento plenario/inaugurale in corso (colazione di benvenuto, apertura
      // dei lavori, keynote…): il badge annuncia il nome dell'evento.
      if (ls.block && !ls.talk) {
        const evName = (lang === "en"
          ? (ls.block.title_en || ls.block.label_en)
          : null) || ls.block.title || ls.block.label;
        if (evName) detail = evName;
      }
      return { state: "live", label, detail, progress,
               liveCount: snap.liveCount, nextChangeMin: snap.nextChangeMin,
               lastDay, talk: ls.talk || null, room: ls.track && ls.track.room || null };
    }

    if (ls.state === "post") {
      return { state: "post", label: T.post, detail: "", progress: 1, lastDay };
    }

    if (ls.state === "break") {
      // Buco di programma (nessun blocco-pausa reale copre "now"): non è una
      // pausa, è un intervallo tra eventi → annuncia il prossimo evento con
      // lo stile "imminente" invece del generico "Pausa".
      if (!ls.block && ls.next) {
        const nx = ls.next;
        const whenShort = nx.when.toLocaleTimeString(T.locale, { hour: "2-digit", minute: "2-digit" });
        const nm = (lang === "en" ? nx.name_en : null) || nx.name || T.sessions_generic;
        const minsTo = Math.max(0, Math.round((nx.when - now) / 60000));
        const prog = Math.min(0.99, Math.max(0, 1 - (minsTo / 60)));
        return { state: "pre-imminent", label: T.soon,
                 detail: `${nm} · ${whenShort}`, progress: prog, lastDay };
      }
      const snap = liveSnapshotInfo(program);
      let progress = 0;
      if (ls.block && ls.block.start && ls.block.end && ls.day) {
        const s = parseTime(ls.day.date, ls.block.start);
        const e = parseTime(ls.day.date, ls.block.end);
        if (e > s) progress = Math.min(1, Math.max(0, (now - s) / (e - s)));
      }
      const detail = snap.nextChangeMin != null ? T.break_resume(snap.nextChangeMin) : "";
      return { state: "break", label: lastDay ? T.break_lastday : T.break,
               detail, progress, nextChangeMin: snap.nextChangeMin, lastDay };
    }

    if (!opening) {
      return { state: "pre", label: T.pre_static, detail: "", progress: 0, lastDay: false };
    }

    const diffMs = opening - now;
    const diffMin = Math.round(diffMs / 60000);
    // Giorni mancanti contati sul calendario (Europe/Rome): il valore resta
    // costante per tutto il giorno solare e decrementa a mezzanotte, non
    // all'orario di apertura del convegno.
    const diffDays = calendarDaysUntil(opening, now);

    const dayShort  = opening.toLocaleDateString(T.locale, { weekday: "short", day: "numeric", month: "short" });
    const timeShort = opening.toLocaleTimeString(T.locale, { hour: "2-digit", minute: "2-digit" });

    const preWindowMs = 30 * 24 * 60 * 60 * 1000;
    const progressPre = Math.min(1, Math.max(0, 1 - (diffMs / preWindowMs)));

    // diffDays >= 2 → "N giorni"; == 1 → "Domani"; == 0 → l'apertura è oggi.
    if (diffDays >= 2) {
      return { state: "pre", label: T.pre_days(diffDays), detail: `${dayShort} ${timeShort}`, progress: progressPre, lastDay: false };
    }
    if (diffDays === 1) {
      return { state: "pre-soon", label: T.tomorrow, detail: T.opens_at(timeShort), progress: progressPre, lastDay: false };
    }
    // Apertura oggi: finché manca piu di un'ora mostra "Oggi", poi il
    // conto alla rovescia in minuti.
    if (diffMin > 60) {
      return { state: "pre-soon", label: T.today, detail: T.opens_at(timeShort), progress: progressPre, lastDay: false };
    }
    if (diffMin > 0) {
      const progressImm = Math.min(0.99, 1 - (diffMin / 60));
      return { state: "pre-imminent", label: T.opens_in(diffMin), detail: "", progress: progressImm, lastDay: false };
    }
    return { state: "live", label: T.live_single, detail: "", progress: 0, lastDay };
  }

  window.AIUCD_LIVESTATE = { getNow, getOpeningTime, liveState, getCountdownInfo };
})();

// AIUCD 2026 Companion · avatar guida "Noa" (Sprint B1)
//
// Espone:
//   - NOA_VOICE_TONE: documento di voice & tone (principi + esempi + cosa evitare),
//     consultabile dai vari moduli per scrivere copy in voce coerente.
//   - renderAvatarBubble(rootEl, opts): renderizza una "bolla Noa" inline.
//   - getGapSuggestion(program): se l'utente ha un gap >= 30 min nella propria
//     agenda salvata per oggi, restituisce una frase suggerita in voce di Noa.
//
// Nota: gli asset SVG dedicati dell'avatar arriveranno nello Sprint C. Per ora
// usiamo come placeholder uno dei sei glifi nuragici (memories: la voce/memoria
// che si trasmette) ereditando la stessa estetica già adottata per le aree.

import * as agenda from "./agenda.js";
import { getNow } from "./livestate.js";

// =====================================================================
// VOICE & TONE — documento operativo per il copy in voce di Noa
// =====================================================================

export const NOA_VOICE_TONE = {
  name: "Noa",
  role: "Guida del convegno AIUCD 2026 · Cagliari, 3—5 giugno.",
  principles: [
    "Prima persona singolare: parla come una persona, non come un sistema.",
    "Asciutta: una frase, due al massimo. Mai pedante.",
    "Pratica: ogni messaggio porta a un'azione possibile (una relazione, un poster, un caffè).",
    "Ammette quando non sa: meglio dire 'non ho dati' che inventare.",
    "Riferimenti sardi con misura: massimo uno per pagina, mai folclore turistico.",
    "Niente burocratese, niente marketing, niente acronimi non spiegati.",
  ],
  dontDoList: [
    "Non sgargiante (no superlativi, no 'incredibile', 'imperdibile').",
    "Non infantile (no emoji decorativi, no 'ciao ciao').",
    "Non pedante (no 'come saprai', 'ricorda che', 'è importante che').",
    "Non burocratico (no 'si informa', 'si rende noto', 'in caso di').",
    "Non promette cose che non controlla (no 'sicuramente ti piacerà').",
  ],
  sampleLines: [
    "Ciao, sono Noa. Sono la tua guida per i 3 giorni di AIUCD 2026.",
    "Hai 47 minuti tra la relazione delle 11:30 e quella delle 14:00. Posso suggerirti un caffè in zona o un poster da vedere?",
    "Ho costruito 14 percorsi attraverso le 134 relazioni. Scegline uno: ti porto io.",
    "Per ora gli scriba riposano. Le sessioni riprendono alle 14:00 in Aula 5A.",
    "Niente in agenda. Tappa una stella su una relazione per cominciare.",
    "Non riesco a leggere i dati del convegno. Riprova tra un momento.",
    "Sto leggendo il programma. Un secondo.",
  ],
};

// =====================================================================
// renderAvatarBubble — bolla riusabile
// =====================================================================

/**
 * Renderizza una "bolla Noa" dentro rootEl.
 *
 * @param {HTMLElement} rootEl
 * @param {object} opts
 *   - context: "onboarding" | "programma-gap" | "path-intro" | "empty-state"
 *   - text:    contenuto principale (string o HTML safe-by-caller)
 *   - heading: opzionale, override del piccolo titolo "Noa dice"
 *   - dismissId: opzionale, chiave localStorage; se fornita aggiunge "×" e marca seen
 *   - onDismiss: callback opzionale al click su "×"
 */
export function renderAvatarBubble(rootEl, opts = {}) {
  if (!rootEl) return;
  const {
    context = "empty-state",
    text = "",
    heading = "Noa dice",
    dismissId = null,
    onDismiss = null,
  } = opts;

  const variantClass = `noa-bubble--${context}`;
  const dismissible = !!(dismissId || onDismiss);

  rootEl.innerHTML = `
    <aside class="noa-bubble ${variantClass}" role="note" aria-label="Messaggio di Noa">
      <span class="noa-bubble-glyph glyph glyph--memories" aria-hidden="true"></span>
      <div class="noa-bubble-content">
        <div class="noa-bubble-heading">${escapeHtml(heading)}</div>
        <div class="noa-bubble-text">${text}</div>
      </div>
      ${dismissible ? `<button class="noa-bubble-action" type="button" aria-label="Chiudi messaggio di Noa"><span aria-hidden="true">×</span></button>` : ""}
    </aside>
  `;

  if (dismissible) {
    const btn = rootEl.querySelector(".noa-bubble-action");
    btn?.addEventListener("click", () => {
      if (dismissId) {
        try { localStorage.setItem(dismissId, "true"); } catch (e) { /* no-op */ }
      }
      rootEl.innerHTML = "";
      if (typeof onDismiss === "function") onDismiss();
    });
  }
}

// =====================================================================
// getGapSuggestion — calcola un buco in agenda e propone una frase di Noa
// =====================================================================

/**
 * Cerca, nei talk salvati per il giorno corrente, una coppia di talk
 * consecutivi separati da >= 30 minuti. Restituisce { minutes, fromEnd, toStart, text }
 * oppure null se non c'è gap utile o l'agenda di oggi è vuota.
 *
 * Caso particolare: se c'è UN solo talk salvato oggi ed è già passato, restituisce
 * null (niente gap da consigliare).
 *
 * @param {object} program
 */
export function getGapSuggestion(program) {
  const now = getNow();
  const today = now.toISOString().slice(0, 10);
  if (!program?.days) return null;
  const day = program.days.find(d => d.date === today);
  if (!day) return null;

  // Indice paper_id -> { start, end, room } per il giorno di oggi.
  const slotById = new Map();
  for (const block of day.blocks || []) {
    if (block.type !== "session") continue;
    for (const track of block.tracks || []) {
      for (const talk of track.talks || []) {
        if (talk.start && talk.end) {
          slotById.set(talk.paper_id, {
            start: talk.start,
            end: talk.end,
            room: track.room,
          });
        }
      }
    }
  }

  // Raccoglie i talk dell'agenda di oggi e li ordina per orario di inizio.
  const ids = agenda.getAll();
  const todayItems = ids
    .map(id => {
      const s = slotById.get(id);
      return s ? { id, ...s } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start));

  if (todayItems.length < 2) return null;

  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < todayItems.length - 1; i++) {
    const cur = todayItems[i];
    const next = todayItems[i + 1];
    const endMin = toMin(cur.end);
    const startMin = toMin(next.start);
    const gap = startMin - endMin;
    if (gap < 30) continue;
    // Considera solo gap che terminano in futuro (l'inizio del prossimo talk
    // non è ancora passato).
    if (startMin <= nowMin) continue;

    // Costruisce la frase in voce di Noa.
    const text = buildGapSentence(gap, cur.end, next.start, next.room);
    return {
      minutes: gap,
      fromEnd: cur.end,
      toStart: next.start,
      nextRoom: next.room,
      text,
    };
  }

  return null;
}

function buildGapSentence(minutes, fromEnd, toStart, room) {
  // Variazioni semplici per evitare frasi sempre uguali, ma sempre nello stesso
  // tono. Tutte preservano la stessa struttura: durata + azione possibile.
  const where = room ? ` in ${escapeHtml(room)}` : "";
  if (minutes >= 90) {
    return `Hai <strong>${minutes} minuti</strong> tra la relazione delle ${fromEnd} e quella delle ${toStart}${where}. Tempo abbastanza per un poster, un caffè e tornare con calma.`;
  }
  if (minutes >= 60) {
    return `Hai <strong>${minutes} minuti</strong> tra la relazione delle ${fromEnd} e quella delle ${toStart}${where}. Posso consigliarti un poster da vedere o un caffè in zona.`;
  }
  return `Hai <strong>${minutes} minuti</strong> tra la relazione delle ${fromEnd} e quella delle ${toStart}${where}. Un caffè veloce o un giro tra i poster ci stanno.`;
}

// =====================================================================
// helpers
// =====================================================================

function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[c]));
}

// AIUCD 2026 Companion · modale talk

import { AREA_BY_CODE, areaLabel } from "./data.js?v=f4-3";
import * as agenda from "./agenda.js";
import { showSingleEventMenu } from "./calendar-menu.js?v=f4-3";
import { t, getLang, translateRoom } from "./i18n.js?v=f4-3";

let _backdrop = null;

function ensureModal() {
  if (_backdrop) return _backdrop;
  _backdrop = document.createElement("div");
  _backdrop.className = "modal-backdrop";
  _backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <div class="modal-meta" id="modal-meta"></div>
        <button class="close-btn" aria-label="${getLang() === "en" ? "Close" : "Chiudi"}" id="modal-close">×</button>
      </div>
      <div class="modal-body">
        <h3 id="modal-title"></h3>
        <div class="authors" id="modal-authors"></div>
        <div class="abstract" id="modal-abstract"></div>
      </div>
      <div class="modal-actions" id="modal-actions"></div>
    </div>
  `;
  document.body.append(_backdrop);
  _backdrop.querySelector("#modal-close").addEventListener("click", close);
  _backdrop.addEventListener("click", e => {
    if (e.target === _backdrop) close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && _backdrop.dataset.open === "true") {
      e.stopImmediatePropagation();
      close();
    }
  }, true);
  return _backdrop;
}

export function open(paper, slot, track, day) {
  const m = ensureModal();
  const area = AREA_BY_CODE[paper.area_code] || AREA_BY_CODE.other;

  const meta = m.querySelector("#modal-meta");
  const time = slot?.start && slot?.end ? `${slot.start}–${slot.end}` : "";
  const dayLabel = day?.label?.split(" ").slice(0, 3).join(" ") || "";
  meta.innerHTML = `
    <span class="chip area-chip" style="background:${area.color}"><span class="glyph glyph--${paper.area_code || 'other'} glyph--sm" aria-hidden="true"></span>${areaLabel(paper.area_code || 'other')}</span>
    ${slot ? `<span class="chip">${dayLabel} · ${time}</span>` : ""}
    ${track ? `<span class="chip">${track.code} · ${translateRoom(track.room)}</span>` : ""}
    <span class="chip">${paper.mode === "Poster" ? "◆ " + t("catalog.posters") : "● " + (getLang() === "en" ? "Oral" : "Oral")}</span>
  `;

  m.querySelector("#modal-title").textContent = paper.title;

  const authorsLine = (paper.authors || []).map(a => {
    const aff = a.aff ? ` (${a.aff})` : "";
    return `${a.name}${aff}`;
  }).join("; ");
  m.querySelector("#modal-authors").textContent = authorsLine || "—";

  m.querySelector("#modal-abstract").textContent = paper.abstract || (getLang() === "en" ? "Abstract not available." : "Abstract non disponibile.");

  const actions = m.querySelector("#modal-actions");
  const saved = agenda.isSaved(paper.id);
  // Lo "slot" passato dai vari moduli ha .start e .end ma non sempre .day:
  // nel caso del Programma .day è sull'oggetto `day` separato.
  const slotDay = slot?.day || day?.date;
  const hasSlot = !!(slot && slot.start && slot.end && slotDay);
  const isEn = getLang() === "en";
  const savedLabel   = `<span class="icon icon--star-filled" aria-hidden="true"></span> ${isEn ? "In agenda — remove" : "In agenda — rimuovi"}`;
  const unsavedLabel = `<span class="icon icon--star-outline" aria-hidden="true"></span> ${t("talk.add_to_agenda")}`;
  actions.innerHTML = `
    <button class="btn ${saved ? 'btn-saved' : 'btn-primary'}" id="modal-save-btn">
      ${saved ? savedLabel : unsavedLabel}
    </button>
    ${hasSlot ? `<button class="btn btn-calendar" id="modal-cal-btn"><span class="icon icon--calendar" aria-hidden="true"></span> ${isEn ? "Add to calendar" : "Aggiungi al calendario"}</button>` : ""}
    ${track ? `<button class="btn btn-secondary" id="modal-room-btn"><span class="icon icon--external" aria-hidden="true"></span> ${t("talk.goto_map")} · ${translateRoom(track.room)}</button>` : ""}
  `;
  actions.querySelector("#modal-save-btn").addEventListener("click", () => {
    const nowSaved = agenda.toggle(paper.id);
    actions.querySelector("#modal-save-btn").innerHTML =
      nowSaved ? savedLabel : unsavedLabel;
    actions.querySelector("#modal-save-btn").className =
      `btn ${nowSaved ? "btn-saved" : "btn-primary"}`;
  });
  const roomBtn = actions.querySelector("#modal-room-btn");
  if (roomBtn && track) {
    roomBtn.addEventListener("click", () => {
      close();
      // Switch to mappa tab and select the room
      window.dispatchEvent(new CustomEvent("companion:goto-room", {
        detail: { room: track.room },
      }));
    });
  }
  const calBtn = actions.querySelector("#modal-cal-btn");
  if (calBtn && hasSlot) {
    calBtn.addEventListener("click", e => {
      e.stopPropagation();
      // Costruisce slot canonico: garantisce day + room presenti
      const slotForCal = {
        ...slot,
        day: slot.day || day?.date,
        room: slot.room || track?.room || "",
      };
      showSingleEventMenu(calBtn, paper, slotForCal);
    });
  }

  m.dataset.open = "true";
}

export function close() {
  if (!_backdrop) return;
  _backdrop.dataset.open = "false";
}

/* AIUCD 2026 · Noa FAB globale (sprint B2, 2026-05-15)
 * Caricato su TUTTE le pagine WP. Vanilla JS, nessuna dipendenza.
 * Responsabilità:
 *   - Gestire la chiusura del bubble di benvenuto (one-shot via localStorage).
 *   - Non mostrare di nuovo il bubble dopo il primo dismiss.
 *
 * Il click sul FAB è gestito nativamente dal browser perché il FAB stesso
 * è un <a href="..."> che porta alla pagina del companion con ?noa=1#noa,
 * gancio letto da noa-drawer.js per aprire il drawer all'arrivo.
 */
(function () {
  "use strict";

  var BUBBLE_DISMISSED_KEY = "aiucd2026-noa-bubble-dismissed";

  function safeGet(key) {
    try { return window.localStorage.getItem(key); }
    catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { window.localStorage.setItem(key, value); }
    catch (e) { /* private mode etc — no-op */ }
  }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    var bubble = document.getElementById("noa-fab-bubble");
    if (!bubble) return;

    // Se già dismisso in passato, nascondi subito (senza animare).
    if (safeGet(BUBBLE_DISMISSED_KEY) === "true") {
      bubble.style.display = "none";
      return;
    }

    var close = bubble.querySelector(".noa-fab-bubble-close");
    if (close) {
      close.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        bubble.style.transition = "opacity 0.2s, transform 0.2s";
        bubble.style.opacity = "0";
        bubble.style.transform = "translateY(8px)";
        safeSet(BUBBLE_DISMISSED_KEY, "true");
        setTimeout(function () { bubble.remove(); }, 220);
      });
    }

    // Auto-dismiss dopo 8 secondi: il bubble è un'invitazione, non
    // un'interruzione. Resta visibile abbastanza per essere letto.
    setTimeout(function () {
      if (!document.body.contains(bubble)) return;
      bubble.style.transition = "opacity 0.5s, transform 0.5s";
      bubble.style.opacity = "0";
      bubble.style.transform = "translateY(8px)";
      // Non scriviamo BUBBLE_DISMISSED_KEY: il bubble potrà ricomparire
      // su altre sessioni finché l'utente non lo chiude esplicitamente o
      // clicca il FAB. Mostrarlo una sola volta sul totale è troppo
      // poco; mostrarlo a ogni navigazione è invasivo. Compromesso:
      // marca solo se chiuso esplicitamente o se l'utente apre Noa.
      setTimeout(function () { bubble.remove(); }, 520);
    }, 8000);

    // Se clicca il FAB, marca dismisso (ha capito che esiste).
    var fab = document.getElementById("noa-fab-global");
    if (fab) {
      fab.addEventListener("click", function () {
        safeSet(BUBBLE_DISMISSED_KEY, "true");
      });
    }
  });
})();

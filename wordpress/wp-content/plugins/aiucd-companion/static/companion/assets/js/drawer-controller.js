// AIUCD 2026 Companion · drawer/overlay controller
// Reusable: handles open/close state, focus trap, ESC-to-close, click-on-backdrop,
// and restores focus to the opener element when closed.

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function createDrawer({ root, backdrop, onClose }) {
  if (!root) throw new Error("createDrawer: root is required");

  let isOpen = false;
  let opener = null;
  let keydownHandler = null;
  let focusinHandler = null;

  function getFocusables() {
    return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter(el => {
      // Skip hidden/inert elements
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const focusables = getFocusables();
    if (focusables.length === 0) {
      e.preventDefault();
      root.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open(triggerEl) {
    if (isOpen) return;
    opener = triggerEl || document.activeElement;
    isOpen = true;
    root.hidden = false;
    if (backdrop) backdrop.hidden = false;
    // Force reflow so the transition runs from initial state
    // eslint-disable-next-line no-unused-expressions
    root.offsetHeight;
    root.dataset.open = "true";
    if (backdrop) backdrop.dataset.open = "true";

    // Focus first focusable element after transition begins
    requestAnimationFrame(() => {
      const focusables = getFocusables();
      const target = focusables[0] || root;
      if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
      target.focus();
    });

    keydownHandler = e => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      } else {
        trapFocus(e);
      }
    };
    document.addEventListener("keydown", keydownHandler);

    if (backdrop) {
      backdrop.addEventListener("click", close);
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.dataset.open = "false";
    if (backdrop) backdrop.dataset.open = "false";

    // After transition, hide entirely so it doesn't trap focus or block clicks.
    const onTransitionEnd = () => {
      if (!isOpen) {
        root.hidden = true;
        if (backdrop) backdrop.hidden = true;
      }
      root.removeEventListener("transitionend", onTransitionEnd);
    };
    root.addEventListener("transitionend", onTransitionEnd);
    // Fallback timeout in case transitionend doesn't fire (e.g. reduced motion).
    setTimeout(() => {
      if (!isOpen && !root.hidden) {
        root.hidden = true;
        if (backdrop) backdrop.hidden = true;
      }
    }, 500);

    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }
    if (backdrop) {
      backdrop.removeEventListener("click", close);
    }

    if (opener && typeof opener.focus === "function") {
      opener.focus();
    }
    opener = null;

    if (typeof onClose === "function") onClose();
  }

  function toggle(triggerEl) {
    if (isOpen) close();
    else open(triggerEl);
  }

  return {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    root,
  };
}

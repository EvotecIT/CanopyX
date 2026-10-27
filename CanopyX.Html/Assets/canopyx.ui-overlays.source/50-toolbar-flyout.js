  // Native details retain their DOM order; their popup participates in the shared overlay stack.
  UI_TOOLS.toolbarFlyout = (anchor, panel, isOpen, signal) => {
    const trigger = anchor.querySelector(":scope > summary") || anchor;
    const pressed = new Set();
    let positionPending = false, releaseFrame = 0;
    if (!panel.hasAttribute("role")) panel.setAttribute("role", "dialog");
    if (!panel.hasAttribute("aria-label")) panel.setAttribute("aria-label", trigger.getAttribute("aria-label") || trigger.textContent.trim() || trigger.title);
    const overlay = UI_TOOLS.overlay(panel, { kind: "popover", trigger,
      host: anchor.closest(".cx-host") || anchor, portal: panel.parentNode,
      focus: false, decorateTrigger: false }, signal);
    const position = () => {
      if (signal.aborted || !isOpen()) return;
      if (pressed.size || releaseFrame) { positionPending = true; return; }
      positionPending = false;
      const box = trigger.getBoundingClientRect(), fixed = getComputedStyle(panel).position === "fixed";
      const below = Math.max(0, global.innerHeight - box.bottom - 8), above = Math.max(0, box.top - 8);
      const top = below < 120 && above > below, room = top ? above : below;
      panel.style.maxHeight = (panel.matches(".cx-fb,.cx-export-panel") ? room : Math.min(320, room)) + "px";
      panel.style.bottom = "auto";
      UI_TOOLS.position(panel, trigger, top ? "top-start" : "bottom-start");
      if (!fixed && panel.offsetParent) {
        const parent = panel.offsetParent, bounds = parent.getBoundingClientRect();
        panel.style.left = parseFloat(panel.style.left) - bounds.left + parent.scrollLeft - parent.clientLeft + "px";
        panel.style.top = parseFloat(panel.style.top) - bounds.top + parent.scrollTop - parent.clientTop + "px";
      }
    };
    panel.addEventListener("cx-popover:close", event => {
      if (event.target !== panel) return;
      if (anchor.localName === "details") anchor.open = false;
      for (const inner of panel.querySelectorAll("details[open]")) inner.open = false;
      if (event.detail.reason === "cancel") trigger.focus({ preventScroll: true });
    }, { signal });
    panel.addEventListener("pointerdown", event => pressed.add(event.pointerId), { signal });
    const release = event => {
      if (!pressed.delete(event.pointerId)) return;
      if (!releaseFrame) releaseFrame = global.requestAnimationFrame(() => { releaseFrame = 0; if (positionPending) position(); });
    };
    for (const type of ["pointerup", "pointercancel"]) global.addEventListener(type, release, { capture: true, signal });
    global.addEventListener("resize", position, { signal });
    global.addEventListener("scroll", position, { capture: true, signal });
    signal.addEventListener("abort", () => { global.cancelAnimationFrame(releaseFrame); pressed.clear(); }, { once: true });
    return { position, open() { if (isOpen() && !overlay.opened) overlay.open(); position(); },
      close() { overlay.close("toggle", false, true); } };
  };

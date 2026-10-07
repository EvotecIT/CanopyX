
  // ---------- viewport-aware toolbar flyouts ----------
  /** Fits a toolbar panel on either side of its anchor and returns listener cleanup for its owning grid. */
  function watchFlyout(anchorElement, panel, isOpen) {
    const position = () => {
      if (!isOpen()) return;
      // A viewport-fixed panel (every grid toolbar menu) is placed in viewport coordinates. The grid filter builder uses all
      // the room beside its anchor; other panels keep the 320-pixel list cap.
      const anchor = anchorElement.getBoundingClientRect(), fixed = getComputedStyle(panel).position === "fixed";
      const below = Math.max(0, global.innerHeight - anchor.bottom - 8);
      const above = Math.max(0, anchor.top - 8);
      const opensAbove = below < 120 && above > below, room = opensAbove ? above : below;
      panel.style.maxHeight = (panel.classList.contains("cx-fb") ? room : Math.min(320, room)) + "px";
      panel.style.top = opensAbove ? "auto" : fixed ? anchor.bottom + "px" : "100%";
      panel.style.bottom = opensAbove ? fixed ? global.innerHeight - anchor.top + "px" : "100%" : "auto";
      const width = panel.getBoundingClientRect().width;
      panel.style.left = Math.max(8, Math.min(anchor.left, global.innerWidth - width - 8)) - (fixed ? 0 : anchor.left) + "px";
    };
    global.addEventListener("resize", position);
    global.addEventListener("scroll", position, true);
    return {
      position,
      dispose: () => {
        global.removeEventListener("resize", position);
        global.removeEventListener("scroll", position, true);
      }
    };
  }

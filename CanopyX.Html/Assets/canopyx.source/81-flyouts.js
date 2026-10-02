
  // ---------- viewport-aware toolbar flyouts ----------
  /** Fits a toolbar panel on either side of its anchor and returns listener cleanup for its owning grid. */
  function watchFlyout(anchorElement, panel, isOpen) {
    const position = () => {
      if (!isOpen()) return;
      const anchor = anchorElement.getBoundingClientRect();
      const below = Math.max(0, global.innerHeight - anchor.bottom - 8);
      const above = Math.max(0, anchor.top - 8);
      const opensAbove = below < 120 && above > below;
      panel.style.maxHeight = Math.min(320, opensAbove ? above : below) + "px";
      panel.style.top = opensAbove ? "auto" : "100%";
      panel.style.bottom = opensAbove ? "100%" : "auto";
      const width = panel.getBoundingClientRect().width;
      panel.style.left = Math.max(8, Math.min(anchor.left, global.innerWidth - width - 8)) - anchor.left + "px";
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

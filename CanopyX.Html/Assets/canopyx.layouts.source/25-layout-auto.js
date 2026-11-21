  // ---------- layout modes: the automatic layout ----------
  // "auto" is a container query kept by the runtime: cards while the host is narrower than cardsBelow, the wide layout (fit or
  // scroll) otherwise. Cards are virtual rows with measured geometry, so a stylesheet container query alone cannot switch them.
  // The choice stays "auto" while the applied layout follows the host, so saved views keep following the panel they sit in.
  // A hidden host (width 0) keeps its layout until it is shown again.
  function layoutAutoWatch(view) {
    let frame = 0;
    const check = () => {
      frame = 0;
      if (view.destroyed || view.layoutChoice !== "auto" || !view.host.clientWidth) return;
      const mode = layoutFor(view, "auto");
      if (mode === view.layoutMode) return;
      layoutApply(view, mode, view.density);
      view.layoutMenu?.render(); view.sortMenu?.sync();
      view.emit("layout", { mode: "auto", active: mode, density: view.density });
    };
    // Layout writes wait for the next frame, outside ResizeObserver delivery.
    const observer = new ResizeObserver(() => { frame ||= requestAnimationFrame(check); });
    observer.observe(view.host);
    view.lifetime.signal.addEventListener("abort", () => { observer.disconnect(); cancelAnimationFrame(frame); }, { once: true });
  }

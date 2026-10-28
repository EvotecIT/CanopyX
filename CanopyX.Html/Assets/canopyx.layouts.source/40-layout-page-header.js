  // Keep the real, focusable header in the grid's ARIA row order. A presentation-only spacer preserves its footprint
  // while it follows page scrolling. Grids with an internal vertical scrollbar retain their normal sticky header.
  function pageHeaderStart(view) {
    if (view.pageHeader || view.view.autoHeight === false) return;
    const head = view.head, grid = view.grid, signal = view.lifetime.signal,
      names = ["position", "top", "left", "width", "min-width", "clip-path", "z-index"],
      previous = names.map(name => [name, head.style.getPropertyValue(name), head.style.getPropertyPriority(name)]),
      spacer = h("div", "cx-page-header-space");
    spacer.setAttribute("aria-hidden", "true"); spacer.hidden = true;
    grid.insertBefore(spacer, head);
    let frame = 0, fixed = false;
    const restore = () => {
      if (!fixed) return;
      fixed = false; spacer.hidden = true;
      for (const [name, value, priority] of previous) {
        if (value) head.style.setProperty(name, value, priority); else head.style.removeProperty(name);
      }
      view.host.removeAttribute("data-cx-page-header");
    };
    const update = () => {
      frame = 0;
      const box = grid.getBoundingClientRect(), height = head.offsetHeight,
        top = Math.max(0, parseFloat(getComputedStyle(view.host).getPropertyValue("--cx-sticky-top")) || 0),
        fits = grid.scrollHeight <= grid.clientHeight + 1;
      if (view.destroyed || view.layoutMode === "cards" || !height || !fits || box.top >= top || box.bottom <= top || !grid.checkVisibility()) { restore(); return; }
      fixed = true; spacer.hidden = false; spacer.style.height = height + "px";
      const width = Math.max(grid.clientWidth, view.rowWidth || 0), left = box.left + grid.clientLeft - grid.scrollLeft,
        clipLeft = Math.max(0, grid.scrollLeft), clipRight = Math.max(0, width - grid.clientWidth - clipLeft);
      Object.assign(head.style, { position: "fixed", top: Math.min(top, box.bottom - height) + "px", left: left + "px",
        width: width + "px", minWidth: width + "px", clipPath: "inset(0 " + clipRight + "px 0 " + clipLeft + "px)", zIndex: "20" });
      view.host.setAttribute("data-cx-page-header", "true");
      view.gridPopover?.position();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    for (const element of [grid, head, view.host]) observer.observe(element);
    window.addEventListener("scroll", schedule, { capture: true, passive: true, signal });
    window.addEventListener("resize", schedule, { passive: true, signal });
    for (const name of ["query", "layout"]) view.host.addEventListener("canopyx:" + name, schedule, { signal });
    signal.addEventListener("abort", () => { cancelAnimationFrame(frame); observer.disconnect(); restore(); spacer.remove(); }, { once: true });
    view.pageHeader = { schedule }; schedule();
  }

  const uiFocusSelector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  Object.assign(UI_TOOLS, {
    labels: values => Object.assign({}, UI_LABELS, values),
    content: (element, value) => { if (value?.nodeType) element.replaceChildren(value); else hostHtml(element, value, null, "detail"); },
    emit: (root, prefix, name, detail, cancelable = false) => root.dispatchEvent(new CustomEvent("cx-" + prefix + ":" + name, { detail, bubbles: true, cancelable })),
    focusables: root => [...root.querySelectorAll(uiFocusSelector)].filter(element => element.checkVisibility() && !element.closest("[inert]")),
    observe(root, changed, signal) {
      let width = -1, frame = 0;
      const read = () => { const next = root.getBoundingClientRect().width; if (next !== width) { width = next; changed(width); } };
      // Defer layout writes out of ResizeObserver delivery; a stepper can also change its own height.
      const observer = new ResizeObserver(() => { frame ||= requestAnimationFrame(() => { frame = 0; read(); }); });
      observer.observe(root); read();
      const dispose = () => { observer.disconnect(); cancelAnimationFrame(frame); };
      signal?.addEventListener("abort", dispose, { once: true }); return dispose;
    },
    theme(host, element, changed) {
      const attributes = ["data-hfx-style", "data-hfx-mode", "data-hfx-density"];
      const styles = () => new Map([...element.style].filter(name => name.startsWith("--hfx-") || name.startsWith("--cx-") || name === "color-scheme")
        .map(name => [name, [element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]]));
      const attrs = () => new Map(attributes.map(name => [name, element.getAttribute(name)]));
      let previous = new Map(), written = new Map(), previousAttrs = new Map(), writtenAttrs = new Map();
      const restore = () => {
        for (const [name, [value, priority]] of written) if (element.style.getPropertyValue(name) === value && element.style.getPropertyPriority(name) === priority) {
          const original = previous.get(name);
          if (original) element.style.setProperty(name, ...original); else element.style.removeProperty(name);
        }
        for (const [name, value] of writtenAttrs) if (element.getAttribute(name) === value) {
          const original = previousAttrs.get(name);
          if (original === null) element.removeAttribute(name); else element.setAttribute(name, original);
        }
      };
      const watch = watchOverlayTheme(host, element, undefined, () => {
        restore(); previous = styles(); previousAttrs = attrs();
        overlayTheme(host, element);
        for (const [name, value] of previous) element.style.setProperty(name, ...value);
        for (const [name, value] of previousAttrs) if (value !== null) element.setAttribute(name, value);
        written = styles(); writtenAttrs = attrs(); changed?.();
      });
      return () => { watch(); restore(); };
    },
    position(element, anchor, placement = "bottom-start", point) {
      const viewport = global.visualViewport, width = viewport?.width || document.documentElement.clientWidth, height = viewport?.height || global.innerHeight;
      const offsetX = viewport?.offsetLeft || 0, offsetY = viewport?.offsetTop || 0;
      const style = getComputedStyle(element), gap = parseFloat(style.marginTop) || 0, marginX = parseFloat(style.marginLeft) || 0;
      const edge = Math.max(8, gap);
      const box = element.getBoundingClientRect(), target = point ? { left: point.x, right: point.x, top: point.y, bottom: point.y } : anchor.getBoundingClientRect();
      const rtl = getComputedStyle(anchor).direction === "rtl", side = placement.split("-")[0], align = placement.split("-")[1] || "center";
      let x = (target.left + target.right - box.width) / 2, y = target.bottom + gap, actual = side;
      if (side === "top") y = target.top - box.height - gap;
      if (side === "left" || side === "right") { x = side === "left" ? target.left - box.width - gap : target.right + gap; y = target.top; }
      else if (align !== "center") x = (align === "start") !== rtl ? target.left : target.right - box.width;
      if (side === "top" && y < offsetY) { y = target.bottom + gap; actual = "bottom"; }
      else if (side === "bottom" && y + box.height > height + offsetY) { y = target.top - box.height - gap; actual = "top"; }
      else if (side === "right" && x + box.width > width + offsetX) { x = target.left - box.width - gap; actual = "left"; }
      else if (side === "left" && x < offsetX) { x = target.right + gap; actual = "right"; }
      x = Math.max(offsetX + edge, Math.min(x, offsetX + width - box.width - edge));
      y = Math.max(offsetY + edge, Math.min(y, offsetY + height - box.height - edge));
      // Whole device pixels: content inside a scroller is snapped to them, so an overlay on a fractional position would shift a
      // list's rows against the rows outside it by a sub-pixel amount.
      const ratio = global.devicePixelRatio || 1, snap = value => Math.round(value * ratio) / ratio;
      element.style.left = snap(x) - marginX + "px"; element.style.top = snap(y) - gap + "px";
      element.dataset.side = actual;
    }
  });

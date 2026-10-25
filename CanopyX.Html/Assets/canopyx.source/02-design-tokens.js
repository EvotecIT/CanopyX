  // These are use-site defaults only. No shared role is assigned to a component or its parent.
  const STATUS_FALLBACKS = __CX_STATUS_FALLBACKS__;

  const MODE_ATTRIBUTES = ["data-theme", "data-cx-theme", "data-hfx-mode", "data-bs-theme", "data-hfx-theme", "data-hfx-tokens"];
  const THEME_ATTRIBUTES = [...MODE_ATTRIBUTES, "data-hfx-style", "data-hfx-density", "data-cx-fallback-mode", "style", "class"];

  function watchTheme(host, signal) {
    const attributes = THEME_ATTRIBUTES;
    const previous = host.getAttribute("data-cx-fallback-mode");
    const refresh = () => {
      const parent = host.parentElement && getComputedStyle(host.parentElement);
      const inherited = parent?.colorScheme;
      let mode = null;
      if (!parent?.getPropertyValue("--hfx-color-surface").trim()) {
        outer: for (let owner = host; owner; owner = owner.parentElement) for (const attribute of MODE_ATTRIBUTES) {
          const value = owner.getAttribute(attribute);
          if (value === "light" || value === "dark") { mode = value; break outer; }
        }
      }
      if (parent?.getPropertyValue("--hfx-color-surface").trim() || !mode && inherited && inherited !== "normal") {
        if (host.hasAttribute("data-cx-fallback-mode")) host.removeAttribute("data-cx-fallback-mode");
      } else if (host.getAttribute("data-cx-fallback-mode") !== (mode || "auto")) host.setAttribute("data-cx-fallback-mode", mode || "auto");
    };
    const observer = new MutationObserver(refresh);
    for (let owner = host; owner; owner = owner.parentElement) observer.observe(owner, { attributes: true, attributeFilter: attributes });
    refresh();
    const dispose = () => { observer.disconnect(); if (previous === null) host.removeAttribute("data-cx-fallback-mode"); else host.setAttribute("data-cx-fallback-mode", previous); };
    signal?.addEventListener("abort", dispose, { once: true });
    return dispose;
  }

  function overlayTheme(host, element, inherit = false) {
    for (const name of ["data-hfx-style", "data-hfx-mode", "data-hfx-density"]) {
      const owner = host.closest("[" + name + "]");
      if (owner && !inherit) element.setAttribute(name, owner.getAttribute(name)); else element.removeAttribute(name);
    }
    const theme = getComputedStyle(host), parent = inherit && host.parentElement && getComputedStyle(host.parentElement);
    element.style.colorScheme = theme.colorScheme;
    const copied = [];
    for (const name of theme) if ((name.startsWith("--cx-") || name.startsWith("--hfx-")) && (!parent || theme.getPropertyValue(name) !== parent.getPropertyValue(name))) { element.style.setProperty(name, theme.getPropertyValue(name)); copied.push(name); }
    return copied;
  }

  // Persistent siblings and portal sheets follow host roles throughout their owned lifetime.
  function watchOverlayTheme(host, element, signal) {
    if (signal?.aborted) return () => {};
    let copied = [];
    const refresh = () => {
      for (const name of copied) element.style.removeProperty(name);
      copied = overlayTheme(host, element, element.parentElement === host.parentElement);
    };
    const observer = new MutationObserver(refresh);
    for (let owner = host; owner; owner = owner.parentElement) observer.observe(owner, { attributes: true,
      attributeFilter: THEME_ATTRIBUTES });
    const media = ["(prefers-color-scheme:dark)", "(prefers-contrast:more)", "(forced-colors:active)"].map(query => matchMedia(query));
    for (const query of media) query.addEventListener("change", refresh);
    const dispose = () => { observer.disconnect(); for (const query of media) query.removeEventListener("change", refresh); signal?.removeEventListener("abort", dispose); };
    signal?.addEventListener("abort", dispose, { once: true });
    dispose.refresh = refresh; refresh(); return dispose;
  }

  // Toolbar policy stays with its view; the lazy overlay part owns popup lifetime and placement.
  function watchFlyout(anchorElement, panel, isOpen) {
    const lifetime = new AbortController();
    let flyout = null, pending = null;
    const ready = () => flyout ? Promise.resolve(flyout) : pending ||= loadPart(SHARED_PARTS["ui-overlays"]).then(() => {
      if (!lifetime.signal.aborted) flyout = UI_TOOLS.toolbarFlyout(anchorElement, panel, isOpen, lifetime.signal);
      return flyout;
    }).catch(error => { pending = null; throw error; });
    const invoke = method => {
      if (lifetime.signal.aborted || !isOpen()) return;
      if (flyout) { flyout[method](); return; }
      ready().then(value => { if (!lifetime.signal.aborted && isOpen()) value?.[method](); }).catch(error => {
        if (!lifetime.signal.aborted) (anchorElement.closest(".cx-host") || anchorElement)
          .dispatchEvent(new CustomEvent("canopyx:error", { detail: { error }, bubbles: true }));
      });
    };
    return { position: () => invoke("position"), open: () => invoke("open"),
      close: () => flyout?.close(), dispose: () => lifetime.abort() };
  }

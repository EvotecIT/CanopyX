  function uiDialog(root, options, signal, drawer) {
    const labels = UI_TOOLS.labels(options.labels), trigger = options.trigger || document.getElementById(root.dataset.cxTrigger || "");
    const container = options.container || root.parentElement || document.body, alert = root.getAttribute("role") === "alertdialog";
    const kind = drawer ? "drawer" : "dialog";
    let phone = false, last = {};
    const overlay = UI_TOOLS.overlay(root, { kind, trigger, host: options.host || container,
      focus: options.focus, dismissible: options.dismissible ?? root.dataset.dismissible !== "false", initialFocus: options.initialFocus || (element =>
        alert ? element.querySelector('[data-cx-cancel],button:not([data-danger]):not([type="submit"])') : element.querySelector("input:not([type=hidden]),select,textarea")) }, signal);
    const ownerHidden = () => !container.getClientRects().length || /^(hidden|collapse)$/.test(getComputedStyle(container).visibility);
    const closeHidden = () => {
      if (!options.closeWhenHidden || !overlay.opened || !ownerHidden() || matchMedia("print").matches) return false;
      root._cxHidden = true; overlay.close("hidden", false, true); return true;
    };
    if (options.closeWhenHidden) {
      const visibility = new MutationObserver(closeHidden);
      for (let owner = container; owner; owner = owner.parentElement) visibility.observe(owner, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
      signal?.addEventListener("abort", () => visibility.disconnect(), { once: true });
    }
    const body = UI_TOOLS.dialogBody(root, kind, options, labels, signal);
    const steps = drawer && options.records ? UI_TOOLS.recordSteps(root, options, labels, signal) : null;
    // open() on an open overlay keeps it open: it shows the new content and moves the focus return to the new record.
    const open = (settings = {}) => {
      if (settings.history === undefined) settings = { ...settings, history: options.history };
      last = settings;
      // A native dialog a host closed itself is no longer showing: that opening starts over.
      if (overlay.opened && (root.localName !== "dialog" || root.open)) overlay.setReturnFocus(settings.returnFocus);
      else if (!overlay.open({ modal: !drawer || phone || options.modal === true || root.dataset.modal === "true", returnFocus: settings.returnFocus }) || closeHidden()) return false;
      if (settings.position) steps?.position(settings.position);
      body.show(settings);
      address.opened(settings.history);
      return true;
    };
    const address = UI_TOOLS.overlayHistory(root, kind, options, signal, () => open({ ...last, content: undefined }), () => overlay.opened, () => overlay.close("history"));
    root.addEventListener("cx-" + kind + ":close", event => { if (event.target === root) { body.abort(); address.closed(event.detail.reason); } }, { signal });
    UI_TOOLS.observe(container, width => {
      // A hidden container measures 0: that says nothing about the room the overlay has, so the layout stays as it was.
      // With closeWhenHidden the overlay closes instead, because the view it belongs to is no longer shown (its page or tab
      // was hidden, or it left the document). Print media hides views on purpose and does not count.
      if (!width && !container.getClientRects().length) {
        closeHidden();
        return;
      }
      phone = width < 640; root.dataset.phone = String(phone); root.classList.toggle("cx-phone", phone);
      if (drawer && overlay.opened) overlay.setModal(phone || options.modal === true || root.dataset.modal === "true");
    }, signal);
    trigger?.addEventListener("click", () => open(), { signal });
    root.addEventListener("click", event => { if (event.target.closest("[data-cx-close],[data-cx-cancel]")) overlay.close("cancel"); }, { signal });
    const scroller = root.querySelector('[data-cx-part="body"]');
    scroller?.addEventListener("scroll", () => { root.dataset.scrolled = String(scroller.scrollTop > 0); }, { signal });
    if (steps) root.addEventListener("keydown", event => {
      if (/^(?:INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); steps.step(event.key === "ArrowUp" ? -1 : 1); }
    }, { signal });
    for (const button of root.querySelectorAll(".cx-overlay-close")) button.setAttribute("aria-label", drawer ? labels.drawerClose : labels.dialogClose);
    // A reader who lands on the overlay's address sees it open.
    if (address.landed()) open();
    return { ...overlay, open, setContent: value => body.set(value), refresh: () => body.load(),
      getState: () => ({ open: overlay.opened, modal: overlay.modal, loading: body.loading }) };
  }
  UI_IMPL.dialog = (root, options, signal) => uiDialog(root, options, signal, false);
  UI_IMPL.drawer = (root, options, signal) => uiDialog(root, options, signal, true);

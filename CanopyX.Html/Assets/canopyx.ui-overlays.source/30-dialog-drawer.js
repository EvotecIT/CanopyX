  function uiDialog(root, options, signal, drawer) {
    const labels = UI_TOOLS.labels(options.labels), trigger = options.trigger || document.getElementById(root.dataset.cxTrigger || "");
    const container = options.container || root.parentElement || document.body, alert = root.getAttribute("role") === "alertdialog";
    let phone = false;
    const overlay = UI_TOOLS.overlay(root, { kind: drawer ? "drawer" : "dialog", trigger, host: options.host || container,
      focus: options.focus, dismissible: options.dismissible ?? root.dataset.dismissible !== "false", initialFocus: options.initialFocus || (element =>
        alert ? element.querySelector('[data-cx-cancel],button:not([data-danger]):not([type="submit"])') : element.querySelector("input:not([type=hidden]),select,textarea")) }, signal);
    const open = () => overlay.open({ modal: !drawer || phone || options.modal === true || root.dataset.modal === "true" });
    UI_TOOLS.observe(container, width => {
      // A hidden container measures 0: that says nothing about the room the overlay has, so the layout stays as it was.
      // With closeWhenHidden the overlay closes instead, because the view it belongs to is no longer shown (its page or tab
      // was hidden, or it left the document). Print media hides views on purpose and does not count.
      if (!width && !container.getClientRects().length) {
        if (options.closeWhenHidden && overlay.opened && !matchMedia("print").matches) { root._cxHidden = true; overlay.close("hidden", false, true); }
        return;
      }
      phone = width < 640; root.dataset.phone = String(phone); root.classList.toggle("cx-phone", phone);
      if (drawer && overlay.opened) overlay.setModal(phone || options.modal === true || root.dataset.modal === "true");
    }, signal);
    trigger?.addEventListener("click", open, { signal });
    root.addEventListener("click", event => { if (event.target.closest("[data-cx-close],[data-cx-cancel]")) overlay.close("cancel"); }, { signal });
    const body = root.querySelector('[data-hfx-part="body"]');
    body?.addEventListener("scroll", () => { root.dataset.scrolled = String(body.scrollTop > 0); }, { signal });
    if (drawer) root.addEventListener("keydown", event => {
      if (!options.records || /^(?:INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); options.records(event.key === "ArrowUp" ? -1 : 1); }
    }, { signal });
    for (const button of root.querySelectorAll(".cx-overlay-close")) button.setAttribute("aria-label", drawer ? labels.drawerClose : labels.dialogClose);
    return { ...overlay, open, refresh() {}, getState: () => ({ open: overlay.opened, modal: overlay.modal }) };
  }
  UI_IMPL.dialog = (root, options, signal) => uiDialog(root, options, signal, false);
  UI_IMPL.drawer = (root, options, signal) => uiDialog(root, options, signal, true);

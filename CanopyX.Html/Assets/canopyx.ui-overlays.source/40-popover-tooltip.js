  UI_IMPL.popover = (root, options, signal) => {
    const trigger = options.trigger || document.getElementById(root.dataset.cxTrigger || "");
    const overlay = UI_TOOLS.overlay(root, { ...options, trigger, kind: "popover", anchored: true }, signal);
    trigger?.addEventListener("click", () => overlay.opened ? overlay.close() : overlay.open(), { signal });
    trigger?.addEventListener("keydown", event => { if (event.key === "ArrowDown") { event.preventDefault(); overlay.open(); } }, { signal });
    root.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const items = UI_TOOLS.focusables(root), at = items.indexOf(document.activeElement);
      if (event.shiftKey && at === 0 || !event.shiftKey && at === items.length - 1) {
        const outside = UI_TOOLS.focusables(trigger?.closest("dialog[open]") || document).filter(item => !root.contains(item));
        const next = event.shiftKey ? trigger : outside[outside.indexOf(trigger) + 1];
        if (overlay.close("tab", false)) { event.preventDefault(); (next || trigger)?.focus(); }
      }
    }, { signal });
    return overlay;
  };
  UI_IMPL.tooltip = (root, options, signal) => {
    const trigger = options.trigger || document.getElementById(root.dataset.cxTrigger || "");
    if (!trigger) throw new Error("CanopyX: tooltip needs a labelled trigger.");
    const overlay = UI_TOOLS.overlay(root, { ...options, trigger, kind: "tooltip", anchored: true, placement: options.placement || root.dataset.placement || "top", focus: false }, signal);
    const described = trigger.getAttribute("aria-describedby"), ids = new Set((described || "").split(/\s+/).filter(Boolean));
    if (!root.id) root.id = trigger.id + "-tooltip";
    const hadDescription = ids.has(root.id);
    ids.add(root.id); trigger.setAttribute("aria-describedby", [...ids].join(" "));
    let showTimer, hideTimer;
    const hide = () => { clearTimeout(showTimer); clearTimeout(hideTimer); if (document.activeElement !== trigger) hideTimer = setTimeout(() => overlay.close("leave", false), 100); };
    const show = delay => { clearTimeout(showTimer); clearTimeout(hideTimer); showTimer = setTimeout(() => overlay.open(), delay); };
    trigger.addEventListener("pointerenter", () => show(400), { signal }); trigger.addEventListener("pointerleave", hide, { signal });
    root.addEventListener("pointerenter", () => clearTimeout(hideTimer), { signal }); root.addEventListener("pointerleave", hide, { signal });
    trigger.addEventListener("focus", () => { clearTimeout(hideTimer); overlay.open(); }, { signal }); trigger.addEventListener("blur", hide, { signal });
    const destroy = () => {
      clearTimeout(showTimer); clearTimeout(hideTimer); overlay.destroy();
      const current = new Set((trigger.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      if (!hadDescription) current.delete(root.id);
      if (current.size) trigger.setAttribute("aria-describedby", [...current].join(" ")); else trigger.removeAttribute("aria-describedby");
    };
    signal.addEventListener("abort", destroy, { once: true });
    return { ...overlay, destroy };
  };

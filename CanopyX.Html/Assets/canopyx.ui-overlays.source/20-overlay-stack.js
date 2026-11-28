  const uiOverlayStack = [];
  let uiModalLocks = 0, uiScrollBefore = "";
  function uiLockScroll(lock) {
    if (lock) { if (uiModalLocks++ === 0) { uiScrollBefore = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; } }
    else if (uiModalLocks && --uiModalLocks === 0 && document.documentElement.style.overflow === "hidden") document.documentElement.style.overflow = uiScrollBefore;
  }
  function uiTopOverlay() { return uiOverlayStack.at(-1); }
  function uiOverlayKey(event) {
    if (event.defaultPrevented) return;
    const top = uiTopOverlay(); if (!top) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); top.close("cancel"); }
    else if (event.key === "Tab" && top.modal) {
      const list = UI_TOOLS.focusables(top.element), first = list[0], last = list.at(-1);
      if (!list.length) { event.preventDefault(); top.element.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === top.element)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  // A primary press on a button that closes an open overlay waits for its click, which goes through the close and cancel path
  // of that overlay; a press that ends without one (dragged off, or cancelled) is an outside press after all.
  let uiPendingPress = null;
  function uiOverlayPointer(event) {
    const top = uiTopOverlay();
    if (!top) return;
    const target = uiCloseTarget(event)?.target;
    if (event.button === 0 && target && uiOverlayRoots.get(target).some(controller => controller.opened)) {
      const pending = uiPendingPress = { target, top };
      const settle = () => setTimeout(() => { if (uiPendingPress === pending) { uiPendingPress = null; uiOutside(event, top); } });
      document.addEventListener("pointerup", settle, { once: true, capture: true });
      document.addEventListener("pointercancel", settle, { once: true, capture: true });
      return;
    }
    uiOutside(event, top);
  }
  function uiOutside(event, top) {
    if (uiTopOverlay() !== top) return;
    const box = top.element.getBoundingClientRect(), backdrop = event.target === top.element && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
    if (!backdrop && top.element.contains(event.target) || top.trigger?.contains(event.target)) return;
    if (top.dismissible) top.close("outside", false);
  }
  function uiStackPush(entry) {
    if (!uiOverlayStack.length) {
      document.addEventListener("keydown", uiOverlayKey);
      document.addEventListener("pointerdown", uiOverlayPointer, true);
    }
    uiOverlayStack.push(entry);
  }
  function uiStackRemove(entry) {
    const at = uiOverlayStack.indexOf(entry); if (at >= 0) uiOverlayStack.splice(at, 1);
    if (!uiOverlayStack.length) {
      document.removeEventListener("keydown", uiOverlayKey);
      document.removeEventListener("pointerdown", uiOverlayPointer, true);
    }
  }

  // Close and cancel buttons: a [data-cx-close] that names a registered overlay by id closes that overlay, wherever the button
  // is; any other close or cancel button (or one whose id names no overlay) closes the nearest overlay around it, so a dialog
  // nested in a drawer closes alone. Every overlay the controller manages registers its element, also one mounted from code
  // without data-cx-* markup. Each overlay listens on its own element, so a host wrapper that stops propagation or a shadow
  // root does not hide the click, and only the innermost overlay on the event's path acts, so a click is handled once.
  // A named close button outside every overlay (a page toolbar's) is handled by one document listener in the capture phase, so
  // a toolbar that stops propagation does not hide it. The handler that acts marks the click with its overlay's depth (its
  // distance from the window on the path, the same in every shadow scope), so a host that destroys the closing overlay from its
  // close event cannot make an outer overlay act later in the same dispatch, while a click dispatched again starts afresh.
  // Registrations are weak: an overlay removed with its host is not kept alive. Nodes are read through the DOM's own accessors,
  // which work for nodes of any frame and which a form's named controls cannot shadow.
  const uiOverlayRoots = new WeakMap(), uiHandledClicks = new WeakMap(), uiListening = new WeakSet(), uiClosedRoots = new WeakMap();
  const uiGetter = (type, name) => Object.getOwnPropertyDescriptor(type.prototype, name).get;
  const uiNodeType = uiGetter(Node, "nodeType"), uiParentNode = uiGetter(Node, "parentNode"), uiSlotOf = uiGetter(Element, "assignedSlot");
  const uiAttribute = (node, name) => Element.prototype.getAttribute.call(node, name);
  const uiIsElement = node => { try { return uiNodeType.call(node) === 1; } catch { return false; } };
  // A node's parent in the flat tree: its slot (also one in a closed shadow root that holds a registered overlay), else its
  // parent, else a shadow root's host.
  const uiSlot = node => {
    if (!uiIsElement(node)) return node.assignedSlot || null;
    const slot = uiSlotOf.call(node), parent = uiParentNode.call(node), root = !slot && parent && uiClosedRoots.get(parent);
    return slot || root && [...root.querySelectorAll("slot")].find(candidate => candidate.assignedNodes().includes(node)) || null;
  };
  const uiUp = node => uiSlot(node) || uiParentNode.call(node) || (uiNodeType.call(node) === 11 && node.host) || null;
  /** The close or cancel button an event came from, the innermost overlay around it, and the overlay it closes. */
  function uiCloseTarget(event) {
    const path = event.composedPath(), button = path.find(node => uiIsElement(node) && Element.prototype.matches.call(node, ":is([data-cx-close],[data-cx-cancel]):not(:disabled)"));
    if (!button) return null;
    const around = []; for (let at = button; at; at = uiUp(at)) if (uiOverlayRoots.has(at)) around.push(at);
    const nearest = around[0], name = uiAttribute(button, "data-cx-close");
    // A name is looked up among the overlays around the button first (two may share an id in separate shadow roots), then in
    // the button's root and the document.
    // An id that names an element without an overlay in one scope does not hide an overlay of that id in the next.
    const named = name && [around.find(node => uiAttribute(node, "id") === name), Node.prototype.getRootNode.call(button).getElementById?.(name), document.getElementById(name)]
      .find(node => node && uiOverlayRoots.has(node));
    return { path, nearest, target: named || nearest };
  }
  function uiCloseClick(event, owner) {
    const found = uiCloseTarget(event);
    if (!found || found.nearest !== owner || !found.target) return;
    // Within one dispatch, listeners run from the inner overlay outwards: an outer one that the marked overlay is inside (on the
    // path, or still in its tree) leaves the click to it. The marked overlay's own listener sees a new dispatch. The document's
    // listener acts only when no overlay is around the button, so it needs no mark.
    if (owner) {
      const marked = uiHandledClicks.get(event);
      if (marked && marked !== owner && (found.path.includes(marked) || uiDeepContains(owner, marked))) return;
      uiHandledClicks.set(event, owner);
    }
    // Several controllers can share an element (a drawer and a dialog factory on one root): the open one closes.
    const controllers = uiOverlayRoots.get(found.target);
    (controllers.find(controller => controller.opened) || controllers.at(-1)).close("cancel");
  }
  let uiDocumentListening = false;
  function uiOverlayRegister(element, controller) {
    // The document's capture listener runs first in every dispatch, so it clears the handled mark of a redispatched click.
    if (!uiDocumentListening) { uiDocumentListening = true; document.addEventListener("click", event => {
      // The click that a pending press was waiting for settles it; a click elsewhere (dragged off the button) does not.
      if (uiPendingPress && uiCloseTarget(event)?.target === uiPendingPress.target) uiPendingPress = null;
      uiHandledClicks.delete(event); uiCloseClick(event, undefined);
    }, true); }
    uiOverlayRoots.set(element, [...(uiOverlayRoots.get(element) || []), controller]);
    // One click and one cancel listener per element, however many controllers share it; they act only while it is registered.
    if (!uiListening.has(element)) {
      uiListening.add(element);
      element.addEventListener("click", event => uiCloseClick(event, element));
      element.addEventListener("cancel", event => uiNativeCancel(event, element));
    }
    // A closed shadow root hides its slots; its host is recorded so a button slotted into the overlay is found.
    const root = Node.prototype.getRootNode.call(element);
    if (root.host && root.mode === "closed") uiClosedRoots.set(root.host, root);
  }
  // A native cancel (Escape on a dialog, or requestClose()) closes the overlay on top when it is this element's, or when this
  // element's overlay opened it (the chain recorded when each opened, which the stack's close cascade follows too). It is
  // resolved once for the element, however many controllers share it, so one cancel is emitted.
  function uiNativeCancel(event, element) {
    // Only the dialog's own cancel: one that bubbles from a descendant (a file input's) is not a request to close.
    if (event.target !== element || !uiOverlayRoots.has(element)) return;
    event.preventDefault();
    const top = uiTopOverlay();
    for (let owner = top; owner; owner = owner.parent) if (owner.element === element) { top.close("cancel"); return; }
  }
  function uiOverlayUnregister(element, controller) {
    const controllers = (uiOverlayRoots.get(element) || []).filter(other => other !== controller);
    if (controllers.length) uiOverlayRoots.set(element, controllers); else uiOverlayRoots.delete(element);
  }

  // A portalled descendant still belongs to its trigger's open surface.
  // Containment that crosses shadow boundaries: an overlay mounted inside a shadow root hosted in another still belongs to it.
  // It follows a slotted node's slot, so a dialog projected into a drawer's shadow root belongs to the drawer.
  const uiDeepContains = (container, node) => { for (let at = node; at; at = uiUp(at)) if (at === container) return true; return false; };
  UI_TOOLS.owns = (container, node) => {
    if (uiDeepContains(container, node)) return true;
    for (const entry of uiOverlayStack) {
      if (!uiDeepContains(entry.element, node)) continue;
      for (let owner = entry; owner; owner = owner.parent)
        if (uiDeepContains(container, owner.element) || owner.trigger && uiDeepContains(container, owner.trigger)) return true;
    }
    return false;
  };

  UI_TOOLS.overlay = (element, options = {}, signal) => {
    const kind = options.kind || "popover", originalParent = element.parentNode, nextSibling = element.nextSibling;
    const triggerOf = () => options.trigger || document.getElementById(element.dataset.cxTrigger || "");
    const decorateTrigger = () => options.decorateTrigger !== false && kind !== "tooltip" &&
      !["row", "gridcell", "rowheader", "treeitem"].includes(triggerOf()?.getAttribute("role"));
    let opened = false, modal = false, returnFocus = null, restoreTheme = null, inerted = [], reposition = null, generation = 0;
    const nativeCloses = [];
    const styleBefore = { left: element.style.left, top: element.style.top }, hadTabindex = element.getAttribute("tabindex");
    const ariaModalBefore = element.getAttribute("aria-modal");
    const entry = { element, get trigger() { return triggerOf(); }, get modal() { return modal; }, get dismissible() { return options.dismissible !== false; }, close };
    function closeNative(silent = false) {
      // Native close events are queued, so retain the opening that actually closed.
      nativeCloses.push({ generation, silent }); element.close();
    }
    function close(reason = "close", restoreFocus = options.focus !== false, force = false) {
      if (!opened) return true;
      if (!force && !UI_TOOLS.emit(element, kind, reason === "cancel" ? "cancel" : "beforeclose", { reason }, true)) return false;
      // Ownership survives portals; later independent overlays are not children.
      for (const child of uiOverlayStack.slice().reverse()) {
        for (let parent = child.parent; parent; parent = parent.parent) if (parent === entry) { child.close("parent", false, true); break; }
      }
      entry.parent = null;
      opened = false; uiStackRemove(entry);
      if (element.localName === "dialog") {
        if (element.open) closeNative();
        // A host may have called native close immediately before controller close/open.
        else if (reason !== "native") nativeCloses.push({ generation, silent: false });
      } else if (element.matches(":popover-open")) element.hidePopover();
      element.hidden = true; element.dataset.state = "closed";
      if (ariaModalBefore === null) element.removeAttribute("aria-modal"); else element.setAttribute("aria-modal", ariaModalBefore);
      if (modal) uiLockScroll(false);
      for (const [node, value] of inerted) node.inert = value;
      inerted = []; modal = false; restoreTheme?.(); restoreTheme = null;
      element.style.left = styleBefore.left; element.style.top = styleBefore.top;
      if (originalParent && element.parentNode !== originalParent) originalParent.insertBefore(element, nextSibling?.parentNode === originalParent ? nextSibling : null);
      if (entry.trigger && decorateTrigger()) entry.trigger.setAttribute("aria-expanded", "false");
      reposition?.(); reposition = null;
      if (restoreFocus) { const target = returnFocus?.isConnected ? returnFocus : triggerOf(); target?.focus({ preventScroll: true }); }
      UI_TOOLS.emit(element, kind, "close", { reason }); return true;
    }
    function open(settings = {}) {
      if (signal?.aborted) return false;
      if (opened) close("reopen", false, true);
      generation++;
      const trigger = triggerOf(), host = options.host || trigger || originalParent || element;
      // Capture the open context before moving the surface. Focus alone does not make a sibling a child.
      entry.parent = uiOverlayStack.slice().reverse().find(owner => uiDeepContains(owner.element, element) ||
        trigger && uiDeepContains(owner.element, trigger)) || null;
      returnFocus = settings.returnFocus || trigger || document.activeElement;
      modal = settings.modal ?? options.modal ?? false;
      const position = () => UI_TOOLS.position(element, trigger, options.placement || element.dataset.placement, settings.point);
      restoreTheme = UI_TOOLS.theme(host, element, () => { if (opened && options.anchored && trigger) position(); });
      const parentDialog = trigger?.closest("dialog[open]");
      const portal = options.portal || parentDialog || trigger?.closest('main,[role="main"]') || document.body;
      if (element.localName !== "dialog" && element.parentNode !== portal) {
        const dir = element.getAttribute("dir"), value = element.style.getPropertyValue("direction"), priority = element.style.getPropertyPriority("direction");
        const direction = getComputedStyle(element).direction, undoTheme = restoreTheme;
        element.setAttribute("dir", direction); element.style.setProperty("direction", direction, priority);
        restoreTheme = () => {
          const current = element.style.getPropertyValue("direction"), currentPriority = element.style.getPropertyPriority("direction");
          undoTheme();
          if (element.getAttribute("dir") === direction) {
            if (dir === null) element.removeAttribute("dir"); else element.setAttribute("dir", dir);
          }
          // Preserve author changes made while open, including inline priority.
          if (current === direction && currentPriority === priority) {
            if (value) element.style.setProperty("direction", value, priority); else element.style.removeProperty("direction");
          } else if (current) element.style.setProperty("direction", current, currentPriority);
          else element.style.removeProperty("direction");
        };
        portal.appendChild(element);
      }
      element.hidden = false; element.dataset.state = "open";
      if (element.localName === "dialog" && typeof element.showModal === "function") {
        if (modal) element.showModal(); else element.show();
      } else if (typeof element.showPopover === "function") {
        element.setAttribute("popover", "manual"); element.showPopover();
      } else if (modal) {
        for (const child of document.body.children) if (!child.contains(element)) { inerted.push([child, child.inert]); child.inert = true; }
      }
      opened = true; if (modal) uiLockScroll(true); uiStackPush(entry);
      if (modal) element.setAttribute("aria-modal", "true"); else element.removeAttribute("aria-modal");
      if (trigger && decorateTrigger()) trigger.setAttribute("aria-expanded", "true");
      if (options.anchored && trigger) {
        position(); global.addEventListener("resize", position); document.addEventListener("scroll", position, true);
        reposition = () => { global.removeEventListener("resize", position); document.removeEventListener("scroll", position, true); };
      }
      if (options.focus !== false) {
        const target = typeof options.initialFocus === "function" ? options.initialFocus(element) : options.initialFocus;
        if (!element.hasAttribute("tabindex")) element.tabIndex = -1;
        (target || UI_TOOLS.focusables(element)[0] || element).focus({ preventScroll: true });
      }
      UI_TOOLS.emit(element, kind, "open", {}); return true;
    }
    const nativeClose = event => {
      if (event.target !== element) return;
      const pending = nativeCloses.shift();
      // A stale close must not dismiss a new opening or retire its host content.
      // The open check also covers native close/open calls outside the controller.
      if (pending?.silent || (pending && pending.generation !== generation) || element.open) { event.stopImmediatePropagation(); return; }
      if (opened) close("native", options.focus !== false, true);
    };
    element.addEventListener("close", nativeClose, true);
    function setModal(value) {
      if (!opened || modal === value) return;
      const active = document.activeElement;
      if (element.localName === "dialog" && element.open) {
        // A native dialog must close before changing modality. This internal transition
        // does not retire its content or notify the host that its drawer was dismissed.
        closeNative(true);
        if (value) element.showModal(); else element.show();
      }
      uiLockScroll(value); modal = value;
      if (value) element.setAttribute("aria-modal", "true"); else element.removeAttribute("aria-modal");
      if (active && element.contains(active)) active.focus({ preventScroll: true });
    }
    const destroy = () => { uiOverlayUnregister(element, controller); close("destroy", false, true); element.removeEventListener("close", nativeClose, true); if (hadTabindex === null) element.removeAttribute("tabindex"); else element.setAttribute("tabindex", hadTabindex); };
    signal?.addEventListener("abort", destroy, { once: true });
    // An open overlay that now shows another record returns focus to that record's control.
    const setReturnFocus = target => { if (opened && target) returnFocus = target; };
    const controller = { element, open, close, destroy, setModal, setReturnFocus, get opened() { return opened; }, get modal() { return modal; } };
    if (kind !== "tooltip") uiOverlayRegister(element, controller);
    return controller;
  };

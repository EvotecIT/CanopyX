  // ---------- record panel: opening records, related records, the back stack and deep links ----------
  // openRecord(id) opens any record: a loaded row (with previous/next), a row the grid scrolls to (its source's position(query,
  // id)), an inline row outside the result, or a row its record source returns ({ row: true }); a tree opens a loaded node or
  // expands the id path it is given. A link (ref) opens its record in place of the current one, which joins the back stack
  // with its tab and the link the reader came from: Back (Alt+Left) or a breadcrumb reopens it and returns focus to that link.
  function recordApi(id) {
    for (const host of document.querySelectorAll("[data-canopyx-mounted]")) if (host.canopyx?.view?.id === id) return host.canopyx;
    return null;
  }
  // The drawer's polite live region; clearing it first makes a repeated message speak again.
  function recordAnnounce(dialog, text) {
    const live = dialog?.querySelector(".cx-record-live");
    if (!live) return;
    setText(live, ""); setTimeout(() => setText(live, text), 50);
  }
  const recordTitle = dialog => dialog.querySelector(".cx-drawer-h h4")?.textContent || "";

  function recordNavigate(ctx, ref, origin) {
    const view = ctx.view, dialog = ctx.dialog, state = dialog._cxPanel || { stack: [] };
    const entry = { view: view.view.id, id: ctx.record.id, title: recordTitle(dialog), tab: state.tab, origin: origin?.getAttribute?.("data-cx-origin") || null };
    const api = ref.view && ref.view !== view.view.id ? recordApi(ref.view) : view.host.canopyx;
    if (!api?.openRecord) { recordAnnounce(dialog, fill(ctx.labels.recordUnavailable, { id: ref.id })); return Promise.resolve(); }
    return api.openRecord(ref.id, { stack: [...state.stack, entry].slice(-20), returnFocus: dialog._returnFocus, path: ref.path })
      .then(() => recordRetire(dialog), error => { recordAnnounce(dialog, fill(ctx.labels.recordUnavailable, { id: ref.id })); view.emit("error", { error }); });
  }
  function recordBack(view, dialog, steps = 1) {
    const stack = dialog._cxPanel?.stack || [], entry = stack[stack.length - steps], api = entry && recordApi(entry.view);
    if (!api) return;
    api.openRecord(entry.id, { stack: stack.slice(0, stack.length - steps), tab: entry.tab, origin: entry.origin, back: true, returnFocus: dialog._returnFocus })
      .then(() => recordRetire(dialog), error => { recordAnnounce(dialog, fill(view.labels.recordUnavailable, { id: entry.id })); view.emit("error", { error }); });
  }

  // A record opened in a drawer of another kind (a grid's from a tree's, or one of another runtime on the page) does not replace
  // the drawer it came from: that one closes once the new one is open, without restoring focus.
  function recordRetire(dialog) {
    if (dialog.isConnected && dialog.open && document.querySelectorAll("dialog.cx-drawer[open]").length > 1) {
      dialog._replaced = true; dialog._cxOverlay.close("replace", false, true); dialog.remove();
    }
  }

  RECORD_IMPL.open = async (view, id, options = {}) => {
    requireIdentifier(id, "record ID");
    if (view.destroyed) recordFail("the view was destroyed.");
    await view.ready;
    if (options.reload === true) RECORD_IMPL.invalidate(view, id);
    const dialog = view.kind === "tree" ? await recordOpenNode(view, id, options) : await recordOpenRow(view, id, options);
    if (!dialog) return;
    const origin = options.origin && dialog.querySelector('[data-cx-origin="' + CSS.escape(options.origin) + '"]');
    if (origin) origin.focus({ preventScroll: false });
    if (options.stack) recordAnnounce(dialog, fill(options.back ? view.labels.recordBackTo : view.labels.recordShowing, { record: recordTitle(dialog) }));
  };

  async function recordOpenRow(view, id, options) {
    await view.requirePart("filter-editor");
    let index = null, row = view.board?.rows.find(row => row.id === id) || view.path?.rows.find(row => row.id === id) || view.stack?.settings.records.get(id) || null;
    const loaded = [...view.rowCache.values()].find(item => !item.status && item.key === id);
    // The grid scrolls to the record it opens, so the drawer and the row stay together.
    if (loaded) { row = loaded.h; index = loaded._ri; if (!view.grid.hidden && !view.pendingQuery) await view.focusResult(index, false).catch(() => {}); }
    else if (!row && view.acceptedQuery && !view.pendingQuery && typeof view.source.position === "function") {
      const position = await view.runGridHook(signal => view.source.position(view.acceptedQuery, id, { signal }));
      if (Number.isInteger(position) && position >= 0 && position < view.rowCount()) {
        await view.focusResult(position, false);
        const item = view.rowCache.get(position);
        if (item && !item.status && item.key === id) { row = item.h; index = position; }
      }
    }
    if (!row && typeof view.source.row === "function") row = view.source.row(id);
    if (!row && recordLoader(view)) {
      const key = recordCacheKey(view, id);
      const payload = await recordFetch(view, id, { row: true });
      if (payload?.row) { row = payload.row; (view._recordPayloads ||= new Map()).set(key, { state: "ready", payload, promise: Promise.resolve(payload) }); }
    }
    if (!row) recordFail("record " + id + " is not available.");
    const returnFocus = options.returnFocus || document.activeElement;
    if (typeof view.opts.onDetails === "function") {
      const record = recordGridHelpers().gridFreeze(JSON.parse(JSON.stringify(row)));
      await view.runGridHook(signal => view.opts.onDetails({ row: record, query: view.acceptedQuery, signal, returnFocus }));
      return null;
    }
    return view.openGridDrawer(row, index, returnFocus, options);
  }

  async function recordOpenNode(view, id, options) {
    await view.requirePart("tree-tools");
    let w = view.keyMap.get(id);
    if (!w && Array.isArray(options.path) && options.path.length) { await view.expandPath(options.path, { focus: false }); w = view.keyMap.get(id); }
    if (!w) recordFail("record " + id + " is not available.");
    return view.showDetails(id, { ...options, node: w.h });
  }

  // ---------- record deep links ----------
  // With record.deepLink, the open record is written to the address as #<key>=<view>:<id> (key "record" by default; a tree
  // writes the id path joined by "/"), next to other "&" parameters and replacing the history entry; closing the drawer
  // removes it. Opening the page with such an address, or changing to one, opens the grid at that record with its drawer.
  // It works offline in single-file pages: the address is all it reads.
  const recordLinkKey = view => view.view.record?.deepLink?.key || "record";
  const recordLinkParams = () => (global.location.hash || "").replace(/^#/, "").split("&").filter(Boolean);
  const recordLinkPath = ids => ids.map(encodeURIComponent).join("/");
  function recordLinkRead(view) {
    const prefix = recordLinkKey(view) + "=";
    for (const param of recordLinkParams()) {
      const value = param.startsWith(prefix) ? param.slice(prefix.length) : "", at = value.indexOf(":");
      if (at < 1) continue;
      try {
        if (decodeURIComponent(value.slice(0, at)) !== view.view.id) continue;
        const rest = value.slice(at + 1), ids = (view.kind === "tree" ? rest.split("/") : [rest]).map(decodeURIComponent);
        if (ids.every(id => id)) return ids;
      } catch (error) {
        // A malformed escape names no record.
      }
    }
    return null;
  }
  function recordLinkFor(view, record) {
    const ids = [];
    if (view.kind === "tree") for (let w = view.keyMap.get(record.id); w && w !== view.root && w.key != null; w = w.parent) ids.unshift(w.key);
    return recordLinkKey(view) + "=" + encodeURIComponent(view.view.id) + ":" + recordLinkPath(ids.length ? ids : [record.id]);
  }
  // This view's parameter in the address; another view with the same key keeps its own.
  const recordLinkPrefix = view => recordLinkKey(view) + "=" + encodeURIComponent(view.view.id) + ":";
  function recordAddress(view, record) {
    const prefix = recordLinkPrefix(view), params = recordLinkParams().filter(param => !param.startsWith(prefix));
    params.push(recordLinkFor(view, record));
    return global.location.href.replace(/#.*$/, "") + "#" + params.join("&");
  }
  function recordLinkWrite(view, record, dialog) {
    if (!view.view.record?.deepLink) return;
    const link = record && recordLinkFor(view, record);
    view._recordLinkOwner = record ? { dialog, link } : null;
    const prefix = recordLinkPrefix(view), params = recordLinkParams().filter(param => !param.startsWith(prefix));
    if (record) params.push(link);
    const hash = params.length ? "#" + params.join("&") : "";
    if ((global.location.hash || "") === hash) return;
    try { global.history.replaceState(global.history.state, "", hash || global.location.pathname + global.location.search); }
    catch (error) {
      // A sandboxed page keeps its address.
    }
    // What the address now names is open already: reading it again does nothing.
    view._recordLinkOpen = record ? recordLinkPath(recordLinkRead(view) || []) : null;
  }
  RECORD_IMPL.start = view => {
    if (view._recordStarted || !view.view.record?.deepLink) return;
    view._recordStarted = true;
    const read = () => {
      const ids = recordLinkRead(view), key = ids ? recordLinkPath(ids) : null, owner = view._recordLinkOwner?.dialog;
      if (!ids) { view._recordLinkOpen = null; view._recordLinkOwner = null; return; }
      if (key === view._recordLinkOpen && (!owner || owner.open || owner._replaced)) return;
      // Reading a new address retires the previous drawer's cleanup before opening can await a source.
      view._recordLinkOwner = null;
      view._recordLinkOpen = key;
      RECORD_IMPL.open(view, ids[ids.length - 1], { path: ids }).catch(error => view.emit("error", { error }));
    };
    global.addEventListener("hashchange", read, { signal: view.lifetime.signal });
    view.lifetime.signal.addEventListener("abort", () => { view._recordLinkOwner = null; view._recordLinkOpen = null; }, { once: true });
    Promise.resolve(view.ready).then(read, () => {});
  };

  // The head of a record panel drawer: the back stack's trail, the actions menu, the pinned summary and a live region.
  RECORD_IMPL.decorate = (view, dialog, { head, identity, options }) => {
    if (!view.view.record) return;
    // An invalid record panel is reported once the body paints; its head stays plain.
    try { recordSpec(view); } catch (error) { return; }
    dialog.id ||= view.id + "-record"; dialog.classList.add("cx-record-drawer");
    const state = dialog._cxPanel = { stack: Array.isArray(options.stack) ? options.stack : [], tab: options.tab || null, collapsed: new Map() }, labels = view.labels;
    const live = h("div", "cx-record-live cx-sr-only"); live.setAttribute("aria-live", "polite"); dialog.appendChild(live);
    if (state.stack.length) {
      const trail = h("nav", "cx-record-trail"), crumbs = h("ol", "cx-record-crumbs"), last = state.stack[state.stack.length - 1];
      trail.setAttribute("aria-label", labels.recordTrail);
      const back = recordButton(labels.recordBack, () => recordBack(view, dialog), "cx-record-back", "back");
      back.setAttribute("aria-label", fill(labels.recordBackTo, { record: last.title || last.id }));
      state.stack.slice(-3).forEach((entry, at, list) => { const item = h("li"); item.appendChild(recordButton(entry.title || entry.id, () => recordBack(view, dialog, list.length - at), "cx-record-crumb")); crumbs.appendChild(item); });
      trail.append(back, crumbs); identity.prepend(trail);
    }
    const summary = h("div", "cx-record-summary"); summary.hidden = true; head.after(summary);
    let projectedSubtitle;
    if (typeof view.opts.recordHeading === "function") dialog.addEventListener("cx-drawer-paint", () => {
      // A tree has no native subtitle to repaint when the next projection omits it.
      if (projectedSubtitle) { setText(projectedSubtitle, ""); projectedSubtitle.hidden = true; }
      try {
        const heading = view.opts.recordHeading(Object.freeze(JSON.parse(JSON.stringify(dialog._cxRecord))));
        if (heading && typeof heading.title === "string" && heading.title.length <= 512) setText(identity.querySelector("h4"), heading.title);
        if (heading && typeof heading.subtitle === "string" && heading.subtitle.length <= 2000) {
          let subtitle = identity.querySelector("p");
          if (!subtitle) { subtitle = projectedSubtitle = h("p"); identity.appendChild(subtitle); }
          subtitle.classList.add("cx-record-subtitle"); setText(subtitle, heading.subtitle); subtitle.hidden = !heading.subtitle;
        }
      } catch (error) { view.emit("error", { error }); }
    });
    recordActionsMenu(view, dialog, identity);
    dialog.addEventListener("keydown", event => {
      if (event.altKey && event.key === "ArrowLeft" && state.stack.length) { event.preventDefault(); recordBack(view, dialog); }
    });
    dialog.addEventListener("close", () => {
      if (view.destroyed) return;
      const owner = view._recordLinkOwner;
      if (owner?.dialog !== dialog) return;
      // Replacement retains this view's address, but no longer retains its retired drawer.
      if (dialog._replaced) { view._recordLinkOwner = null; return; }
      const ids = recordLinkRead(view);
      // A delayed native close removes only the address that this drawer still owns, never a newer intent.
      if (ids && owner.link === recordLinkPrefix(view) + recordLinkPath(ids)) recordLinkWrite(view, null);
      view._recordLinkOwner = null; view._recordLinkOpen = null;
    }, { once: true });
  };

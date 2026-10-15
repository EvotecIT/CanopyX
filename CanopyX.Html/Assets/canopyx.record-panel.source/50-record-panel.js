  // ---------- record panel: the drawer body ----------
  // The body has a sticky bar (tabs as an ARIA tablist; a jump list for long records; the empty-field switch) and the active
  // tab's sections. A section is a heading button (aria-expanded) over its fields and nested sections; collapsing it is
  // remembered while the drawer is open. Scalar fields form a property list; blocks (collections, timelines, changes) span
  // the section under the field's title. A section with a renderer is drawn by a plugin's drawerSections or the host's
  // recordSections. Empty fields hide by default when the view declares a record panel; the reader's switch is remembered
  // for the page. A part keeps a field visible by answering recordKeepField(id, record) with true (an editable field).
  let RECORD_SHOW_EMPTY = false;
  const recordId = (dialog, kind, id) => dialog.id + "-" + kind + "-" + String(id).replace(/[^\w-]/g, "_");
  const recordOnDispose = (signal, cleanup) => {
    const dispose = () => { try { cleanup(); } catch (error) { console.error(error); } };
    if (signal.aborted) dispose(); else signal.addEventListener("abort", dispose, { once: true });
  };

  function recordContext(view, record, dialog, context, payload) {
    const ctx = { view, record, payload, dialog, labels: view.labels, fmt: view.fmt, signal: context.signal, index: context.index, origins: 0, pending: [],
      phone: view.host.clientWidth <= 640, print: !!context.print, width: context.print ? 520 : view.host.clientWidth <= 640 ? 300 : 380,
      row: { id: record.id, cells: recordMerge(record.cells, payload?.cells, record.fields, payload?.fields) },
      node: view.kind === "tree" ? { ...record, cells: recordMerge(record.cells, payload?.cells) } : null };
    ctx.navigate = (ref, origin) => recordNavigate(ctx, ref, origin);
    ctx.repaint = () => { if (!context.signal.aborted && dialog._cxRecord === record && dialog.isConnected) recordRepaint(view, dialog, record, context.index); };
    return ctx;
  }
  // Cells of several sources by id, without inherited members: "__proto__" or "toString" stay plain ids.
  function recordMerge(...sources) {
    const cells = Object.create(null);
    for (const source of sources) if (source) for (const key of Object.keys(source)) if (key !== "__proto__") cells[key] = source[key];
    return cells;
  }
  // A repaint keeps the scroll position and the control the reader is on: a tab, a section heading, a field's control or the
  // empty-field switch, found again in the new body; anything else falls back to the title.
  function recordRepaint(view, dialog, record, index) {
    const body = dialog.querySelector(".cx-drawer-body"), scroll = body?.scrollTop || 0, active = document.activeElement, inside = body?.contains(active);
    const section = inside && active.closest("[data-cx-section]")?.getAttribute("data-cx-section"), field = inside && active.closest("[data-cx-field]")?.getAttribute("data-cx-field");
    const kind = inside && [...active.classList].find(name => name.startsWith("cx-record-")), id = inside && active.id;
    dialog._cxPaint(record, index);
    if (body) body.scrollTop = scroll;
    if (!inside || body.contains(document.activeElement)) return;
    const scope = field ? body.querySelector('[data-cx-field="' + CSS.escape(field) + '"]') : section ? body.querySelector('[data-cx-section="' + CSS.escape(section) + '"]') : body;
    const title = dialog.querySelector(".cx-drawer-h h4"), target = id && body.querySelector("#" + CSS.escape(id)) || kind && scope?.querySelector("." + kind) || title;
    if (target === title) view.focusRing(title); else target?.focus({ preventScroll: true });
  }

  // A field is shown when it has a value, when the reader shows empty fields, or when a part keeps it.
  const recordVisible = (ctx, field, cell, showEmpty) => showEmpty || !recordEmpty(cell, field, ctx.fmt) || ctx.view.recordKeepField?.(field.id, ctx.record) === true;
  function recordHasContent(ctx, section, showEmpty) {
    return !!section.renderer || section.fields.some(field => recordVisible(ctx, field, recordCell(ctx.view, ctx.record, ctx.payload, field), showEmpty)) ||
      section.sections.some(child => recordHasContent(ctx, child, showEmpty));
  }
  function recordEmptyCount(ctx, sections) {
    return sections.reduce((count, section) => count + section.fields.filter(field => recordEmpty(recordCell(ctx.view, ctx.record, ctx.payload, field), field, ctx.fmt)).length +
      recordEmptyCount(ctx, section.sections), 0);
  }

  function recordFieldsInto(ctx, fields, content, showEmpty) {
    let list = null;
    for (const field of fields) {
      const cell = recordCell(ctx.view, ctx.record, ctx.payload, field);
      if (!recordVisible(ctx, field, cell, showEmpty)) continue;
      const kind = recordKind(cell);
      if (kind === "records" || kind === "events" || kind === "changes") {
        const block = h("div", "cx-record-block"), heading = h("div", "cx-record-block-h"), value = h("div", "cx-record-block-b");
        setText(heading, field.title); block.setAttribute("data-cx-field", field.id); value.setAttribute("data-cx-field", field.id);
        block.append(heading, value); content.appendChild(block); list = null;
        recordValue(ctx, field, cell, value);
        continue;
      }
      if (!list) { list = h("dl", "cx-dl cx-record-fields"); content.appendChild(list); }
      const term = h("dt"), value = h("dd"); setText(term, field.title);
      term.setAttribute("data-cx-field", field.id); value.setAttribute("data-cx-field", field.id);
      list.append(term, value); recordValue(ctx, field, cell, value);
    }
  }

  function recordSection(ctx, section, state, showEmpty) {
    if (!recordHasContent(ctx, section, showEmpty)) return null;
    const element = h("section", "cx-record-section cx-record-depth-" + section.depth), heading = h("h3", "cx-record-section-h"), content = h("div", "cx-record-section-b");
    element.id = recordId(ctx.dialog, "s", section.id); element.setAttribute("data-cx-section", section.id); content.id = element.id + "-b";
    // The title is heading level 2; sections are level 3 and nested ones one level deeper.
    heading.setAttribute("aria-level", String(3 + section.depth));
    const collapsed = !ctx.print && (state.collapsed.has(section.id) ? state.collapsed.get(section.id) : section.collapsed);
    if (ctx.print) setText(heading, section.label);
    else {
      const toggle = recordButton(section.label, () => {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        state.collapsed.set(section.id, !open); toggle.setAttribute("aria-expanded", String(open)); content.hidden = !open;
        if (open) recordMount(ctx, content);
      }, "cx-record-toggle", "chevron");
      toggle.setAttribute("aria-expanded", String(!collapsed)); toggle.setAttribute("aria-controls", content.id);
      heading.appendChild(toggle);
    }
    element.append(heading, content); content.hidden = collapsed;
    if (section.renderer) recordCustom(ctx, section, content);
    recordFieldsInto(ctx, section.fields, content, showEmpty);
    for (const child of section.sections) { const nested = recordSection(ctx, child, state, showEmpty); if (nested) content.appendChild(nested); }
    return element;
  }

  // Charts and other host content: drawerSections[name](record, element, context) of a plugin, or the host's recordSections.
  function recordCustom(ctx, section, content) {
    const view = ctx.view, renderer = view.plugins?.map(item => item.drawerSections?.[section.renderer]).find(item => typeof item === "function") || view.opts.recordSections?.[section.renderer];
    if (typeof renderer !== "function") return;
    const holder = h("div", "cx-record-custom"); content.appendChild(holder);
    const values = Object.fromEntries(recordFields(view).map(field => [field.id, recordCell(view, ctx.record, ctx.payload, field)]));
    const context = Object.freeze({ section: section.id, view: view.view.id, api: view.host.canopyx, labels: ctx.labels, signal: ctx.signal, payload: ctx.payload, values,
      print: ctx.print, width: ctx.width, onDispose: cleanup => recordOnDispose(ctx.signal, cleanup) });
    let pending;
    try { pending = Promise.resolve(renderer(JSON.parse(JSON.stringify(ctx.record)), holder, context)); }
    catch (error) { pending = Promise.reject(error); }
    ctx.pending.push(pending);
    pending.catch(error => { if (!ctx.signal.aborted) view.emit("error", { error }); });
  }
  // Nested grids measure their width once visible: a collapsed section or a hidden tab refreshes them when it opens.
  function recordMount(ctx, content) { for (const host of content.querySelectorAll(".cx-record-nested")) host.canopyx?.refresh(); }

  function recordTabs(ctx, layout, state, tabs, select) {
    const list = h("div", "cx-record-tabs");
    list.setAttribute("role", "tablist"); list.setAttribute("aria-label", ctx.labels.recordTabs);
    const buttons = tabs.map(tab => {
      const button = h("button", "cx-record-tab"); button.type = "button"; setText(button, tab.label);
      button.id = recordId(ctx.dialog, "t", tab.id); button.setAttribute("role", "tab");
      const selected = tab.id === state.tab;
      // Only the selected tab's panel exists, so only that tab names what it controls.
      if (selected) button.setAttribute("aria-controls", recordId(ctx.dialog, "p", tab.id));
      button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
      button.addEventListener("click", () => select(tab.id, true));
      return button;
    });
    list.addEventListener("keydown", event => {
      const at = buttons.indexOf(document.activeElement); if (at < 0) return;
      const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: buttons.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault(); const target = buttons[(next + buttons.length) % buttons.length];
      select(tabs[buttons.indexOf(target)].id, false); ctx.dialog.querySelector("#" + CSS.escape(target.id))?.focus();
    });
    list.append(...buttons);
    return list;
  }

  RECORD_IMPL.paint = (view, record, body, dialog, context) => {
    const state = dialog._cxPanel ||= { stack: [], tab: null, collapsed: new Map() };
    dialog.id ||= view.id + "-record";
    if (state.recordId !== record.id) { state.collapsed = new Map(); state.recordId = record.id; }
    state.index = context.index;
    let layout;
    try { layout = recordLayout(view, recordFields(view)); }
    // An invalid record panel is reported, and the record shows in the plain drawer.
    catch (error) { view.emit("error", { error }); return view.paintDrawerBody.call(Object.create(view, { recordNeeded: { value: () => false } }), record, body, dialog, context); }
    const entry = recordEnsure(view, record.id), payload = entry?.state === "ready" ? entry.payload : null, ctx = recordContext(view, record, dialog, context, payload);
    // History presenters of record fields come with the history part: the panel paints again once it is installed.
    if (view.loadHistory && !view._recordHistory && (view.view.record?.fields || []).some(field => ["statusStrip", "sparklineBars", "sparklineLine"].includes(field.presenter?.kind)))
      view._recordHistory = Promise.resolve(view.loadHistory()).then(() => {
        // Whatever record the drawer shows by then paints again with the part installed.
        if (dialog.isConnected && dialog._cxRecord) recordRepaint(view, dialog, dialog._cxRecord, dialog._cxPanel?.index);
      }, () => {});
    const showEmpty = RECORD_SHOW_EMPTY || !layout.hideEmpty;
    const tabs = layout.tabs.filter(tab => tab.sections.some(section => recordHasContent(ctx, section, showEmpty)));
    if (!tabs.length) tabs.push(layout.tabs[0]);
    if (!tabs.some(tab => tab.id === state.tab)) state.tab = tabs[0].id;
    recordSummary(ctx, layout, dialog);
    body.replaceChildren();
    const tools = h("div", "cx-record-tools"), panel = h("div", "cx-record-panel"), sub = h("div", "cx-record-subtools");
    let tabLifetime, tabContext;
    const paintTab = () => {
      tabLifetime?.abort(); tabLifetime = new AbortController();
      tabContext = recordContext(view, record, dialog, { ...context, signal: AbortSignal.any([context.signal, tabLifetime.signal]) }, payload);
      const tab = tabs.find(item => item.id === state.tab), sections = tab.sections.map(section => recordSection(tabContext, section, state, showEmpty)).filter(Boolean);
      panel.replaceChildren(...sections); sub.replaceChildren();
      if (tabs.length > 1) { panel.setAttribute("role", "tabpanel"); panel.id = recordId(dialog, "p", tab.id); panel.setAttribute("aria-labelledby", recordId(dialog, "t", tab.id)); panel.tabIndex = 0; }
      if (layout.jump !== false && sections.length >= (layout.jump ? 2 : 4)) {
        const jump = h("nav", "cx-record-jump"); jump.setAttribute("aria-label", ctx.labels.recordSections);
        for (const element of sections) {
          const target = element.querySelector(".cx-record-toggle");
          jump.appendChild(recordButton(target.textContent, () => { element.scrollIntoView({ block: "start" }); target.focus({ preventScroll: true }); }, "cx-record-jump-link"));
        }
        sub.appendChild(jump);
      }
      const hidden = layout.hideEmpty ? recordEmptyCount(ctx, layout.tabs.flatMap(item => item.sections)) : 0;
      if (hidden || RECORD_SHOW_EMPTY && layout.hideEmpty) {
        const toggle = recordButton(RECORD_SHOW_EMPTY ? ctx.labels.recordHideEmpty : fill(ctx.labels.recordShowEmpty, { count: recordCount(ctx, hidden) }), () => {
          RECORD_SHOW_EMPTY = !RECORD_SHOW_EMPTY; recordRepaint(view, dialog, record, context.index); dialog.querySelector(".cx-record-empty")?.focus();
        }, "cx-record-empty");
        toggle.setAttribute("aria-pressed", String(RECORD_SHOW_EMPTY)); sub.appendChild(toggle);
      }
      sub.hidden = !sub.firstChild;
    };
    const select = (id, focus) => {
      state.tab = id;
      for (const button of tools.querySelectorAll("[role=tab]")) {
        const on = button.id === recordId(dialog, "t", id); button.setAttribute("aria-selected", String(on)); button.tabIndex = on ? 0 : -1;
        if (on) button.setAttribute("aria-controls", recordId(dialog, "p", id)); else button.removeAttribute("aria-controls");
      }
      paintTab(); recordMount(tabContext, panel);
      // A tab paints its fields anew: parts that follow the drawer (editing, formatting, highlighting) see it as a paint.
      dialog.dispatchEvent(new CustomEvent("cx-drawer-paint", { detail: { id: record.id, index: context.index ?? null } }));
      if (focus) tools.querySelector("[aria-selected=true]")?.focus();
    };
    if (tabs.length > 1) tools.appendChild(recordTabs(ctx, layout, state, tabs, select));
    tools.appendChild(sub);
    paintTab();
    body.append(tools, panel);
    tools.hidden = tabs.length < 2 && sub.hidden;
    if (entry?.state === "loading") {
      const note = h("p", "cx-record-note"); setText(note, ctx.labels.loading); panel.prepend(note);
      entry.promise.then(() => ctx.repaint(), () => ctx.repaint());
    } else if (entry?.state === "error") {
      const note = h("p", "cx-record-note cx-record-error"); setText(note, fill(ctx.labels.recordLoadFailed, { error: entry.error.message }));
      note.setAttribute("role", "alert");
      note.appendChild(recordButton(ctx.labels.recordRetry, () => { view._recordPayloads.delete(recordCacheKey(view, record.id)); ctx.repaint(); }, "cx-record-retry"));
      panel.prepend(note);
    }
    recordLinkWrite(view, record);
  };

  // The pinned summary under the title: the status and up to six facts the view's header names, when they have values.
  function recordSummary(ctx, layout, dialog) {
    const box = dialog.querySelector(".cx-record-summary");
    if (!box) return;
    box.replaceChildren();
    const header = layout.header, value = id => { const field = layout.byId.get(id); return field && [field, recordCell(ctx.view, ctx.record, ctx.payload, field)]; };
    if (header?.status) {
      const [field, cell] = value(header.status) || [];
      if (field && !recordEmpty(cell, field, ctx.fmt)) { const status = h("div", "cx-record-status"); status.setAttribute("data-cx-fact", field.id); recordValue(ctx, field, cell, status); box.appendChild(status); }
    }
    const facts = h("dl", "cx-record-facts");
    for (const id of header?.facts || []) {
      const [field, cell] = value(id) || [];
      if (!field || recordEmpty(cell, field, ctx.fmt)) continue;
      const item = h("div", "cx-record-fact"), term = h("dt"), detail = h("dd"); item.setAttribute("data-cx-fact", field.id);
      setText(term, field.title); recordValue(ctx, field, cell, detail); item.append(term, detail); facts.appendChild(item);
    }
    if (facts.firstChild) box.appendChild(facts);
    box.hidden = !box.firstChild;
  }

  // ---------- flow: pick steps, a grid or tree whose selection is the answer (docs/flow.md#pick-steps) ----------
  // The step embeds an ordinary CanopyX view: its search, facets, filters, saved views and record drawer all work. The
  // selection is the answer: the selected ids with a display snapshot (the label column's text), so the review page and the
  // proposal can list them without the view. A tray lists what is chosen with Remove buttons and survives searches and
  // paging. The view is built once per flow and kept across steps; pick steps need an entry point with grids and trees (the
  // data-grid or reporting entry), which the C# writer chooses for flows that have one.
  const FLOW_PICK_VISIBLE = 60;

  function flowPickText(cell, fallback) {
    if (cell !== null && typeof cell === "object") return typeof cell.text === "string" ? cell.text : cell.value == null ? fallback : String(cell.value);
    return cell == null ? fallback : String(cell);
  }

  function flowPickInput(context, field, view) {
    const pick = field.step.pick, labels = view.labels, box = h("div", "cx-flow-pick" + (pick.tray ? " cx-flow-pick-tray" : ""));
    let items = (Array.isArray(context.value) ? context.value : []).map(item => ({ id: item.id, label: item.label }));
    let picker = view.pickers.get(field.id);
    if (!picker) picker = flowPickView(view, field, pick);
    const changed = () => box.dispatchEvent(new Event("change", { bubbles: true }));
    const tray = pick.tray ? h("section", "cx-flow-tray") : null, trayList = h("ul", "cx-flow-tray-list"), trayHead = h("h4", "cx-flow-tray-title"), clear = h("button", "cx-flow-link");
    const count = h("p", "cx-flow-count"); count.setAttribute("aria-live", "polite");
    const paint = () => {
      setText(count, fill(plural(labels.flowPickCount, items.length, view.lang), { count: numberFormat(view.lang, 0, 0).format(items.length) }));
      if (!tray) return;
      trayList.replaceChildren(...items.slice(0, FLOW_PICK_VISIBLE).map(item => {
        const row = h("li", "cx-flow-tray-item"), text = h("span", "cx-flow-tray-label"), remove = h("button", "cx-flow-icon-btn");
        setText(text, item.label || item.id); text.title = item.label || item.id;
        remove.type = "button"; setText(remove, "×"); remove.hidden = context.readOnly;
        remove.setAttribute("aria-label", fill(labels.flowRemoveItem, { item: item.label || item.id }));
        remove.addEventListener("click", () => {
          const at = items.findIndex(entry => entry.id === item.id);
          items = items.filter(entry => entry.id !== item.id);
          picker.select(items.map(entry => entry.id));
          paint(); changed();
          (trayList.children[Math.min(at, trayList.children.length - 1)]?.querySelector("button") || clear).focus();
        });
        row.append(text, remove);
        return row;
      }));
      if (items.length > FLOW_PICK_VISIBLE) { const more = h("li", "cx-flow-tray-more"); setText(more, fill(labels.flowPickMore, { count: items.length - FLOW_PICK_VISIBLE })); trayList.appendChild(more); }
      clear.hidden = !items.length || context.readOnly;
      const none = !items.length;
      trayList.hidden = none; tray.querySelector(".cx-flow-tray-empty").hidden = !none;
    };
    if (tray) {
      setText(trayHead, labels.flowPickChosen); clear.type = "button"; setText(clear, labels.flowSelectNone);
      clear.addEventListener("click", () => { items = []; picker.select([]); paint(); changed(); });
      const head = h("div", "cx-flow-tray-head"), empty = h("p", "cx-flow-tray-empty");
      setText(empty, labels.flowPickNone);
      head.append(trayHead, clear);
      tray.setAttribute("aria-label", labels.flowPickChosen);
      tray.append(head, count, trayList, empty);
    }
    // The view's selection becomes the answer: ids it keeps keep their snapshot, new ids take the label column's text.
    picker.onChange = (ids, lookup) => {
      const known = new Map(items.map(item => [item.id, item]));
      const next = ids.slice(0, 1000).map(id => known.get(id) || { id, label: lookup(id) });
      picker.wanted = next.map(item => item.id);
      if (flowSameValue(picker.wanted, items.map(item => item.id))) return;
      items = next; paint(); changed();
    };
    picker.select(items.map(item => item.id));
    box.append(picker.holder);
    if (tray) box.appendChild(tray); else box.appendChild(count);
    paint();
    return { element: box, control: picker.holder, group: true, focus: () => picker.api?.focus?.(),
      getValue: () => items.map(item => ({ id: item.id, label: item.label })),
      destroy: () => { picker.onChange = null; } };
  }

  /** Creates the step's grid or tree once; it stays across steps and is destroyed with the flow. */
  function flowPickView(view, field, pick) {
    const factory = pick.kind === "grid" ? FLOW_VIEWS.grid : FLOW_VIEWS.tree;
    if (typeof factory !== "function") flowFail("the pick step " + field.step.id + " needs the data-grid or reporting entry point, which hold grids and trees");
    const holder = h("div", "cx-flow-pick-view"), max = field.items.max;
    holder.style.height = pick.height + "px";
    const doc = Object.assign(flowCopy(pick.view), { selection: max === 1 ? "single" : "multiple" });
    // With the reporting entry a grid picks with row check boxes, which work the same on phones and in narrow dialogs.
    if (pick.kind === "grid" && FLOW_VIEWS.reporting) doc.reporting = Object.assign({}, doc.reporting, { selectionControls: true });
    const picker = { holder, api: null, wanted: [], onChange: null };
    const options = Object.assign({}, view.hooks.pickers?.[field.step.id], { view: doc });
    if (pick.kind === "tree") delete options.onSelect;
    picker.api = factory(holder, options);
    view.pickers.set(field.id, picker);
    const label = pick.label;
    // The labels of newly picked records come from one read of the loaded rows (grids) or the event's nodes (trees).
    const labelsOf = (ids, nodes) => {
      if (pick.kind === "grid") { const rows = new Map((picker.api.getLoadedRows?.(ids) || []).map(row => [row.id, row])); return id => flowPickText(rows.get(id)?.cells?.[label], id); }
      const byId = new Map(nodes.map(node => [node.id, node]));
      return id => { const node = byId.get(id); return node ? flowPickText(node.cells?.[label], node.label || id) : id; };
    };
    // The view's own select event: the flow reads the ids (and, for trees, the nodes) and keeps the event inside the step.
    holder.addEventListener("canopyx:select", event => {
      event.stopPropagation();
      if (picker.applying) return;
      // "Select all matching" names a query, not records: a pick step keeps records it can list, so it returns to them.
      if (event.detail?.selection?.kind === "query") { view.announce(view.labels.flowPickOneByOne); picker.select(picker.wanted); return; }
      const nodes = event.detail?.nodes || [], ids = pick.kind === "grid" ? [...(event.detail?.ids || [])] : nodes.map(node => node.id);
      const known = new Set(picker.wanted);
      picker.onChange?.(ids, labelsOf(ids.filter(id => !known.has(id)), nodes));
    });
    picker.select = ids => {
      picker.wanted = ids;
      picker.api.ready.then(() => {
        if (picker.wanted !== ids) return;
        picker.applying = true;
        try { picker.api.setSelection(ids); } catch (error) { view.report(error, "picker"); } finally { picker.applying = false; }
      }, error => view.report(error, "picker"));
    };
    return picker;
  }

  // ---------- facet panel: value lists ----------
  // A value list shows its column's values with their counts, most frequent first (or by value), the first few with "Show N
  // more", and a search box above twelve values (a hosted grid searches at its source). Chosen values stay listed, with a zero
  // count when other facets exclude them, so they can be unchosen. Each checkbox is named by its value and count; Up, Down,
  // Home and End move between the checkboxes of a list, so a long list is one Tab stop.
  const FACET_SEARCH_FROM = 12;

  function facetListBody(panel, facet, body) {
    const grid = panel.grid, search = h("input", "cx-input cx-facet-search"), list = h("ul", "cx-facet-values"), more = gridButton("", () => { state.expanded = !state.expanded; draw(); });
    const note = h("p", "cx-facet-note"), state = { expanded: false, search: "", counts: null, timer: 0 };
    search.type = "search"; search.placeholder = grid.labels.gridFacetSearch; search.setAttribute("aria-label", fill(grid.labels.gridFacetSearch, {}) + ": " + facet.label);
    search.hidden = true; more.classList.add("cx-facet-more"); more.hidden = true; note.hidden = true;
    list.setAttribute("aria-label", facet.label);
    body.append(search, list, more, note);
    search.addEventListener("input", () => {
      state.search = search.value; clearTimeout(state.timer);
      state.timer = setTimeout(() => facet.hosted ? panel.refresh([facet]) : draw(), facet.hosted ? 250 : 0);
    });
    list.addEventListener("keydown", event => {
      const boxes = [...list.querySelectorAll("input")], at = boxes.indexOf(document.activeElement);
      const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: boxes.length - 1 }[event.key];
      if (at < 0 || next === undefined || !boxes[next]) return;
      event.preventDefault(); boxes.forEach(box => { box.tabIndex = -1; }); boxes[next].tabIndex = 0; boxes[next].focus();
    });
    const choose = (item, checked) => {
      const chosen = new Map((state.chosen || []).map(value => [facetKey(value, facet.def), value]));
      if (checked) chosen.set(facetKey(item.value, facet.def), item.value); else chosen.delete(facetKey(item.value, facet.def));
      state.chosen = [...chosen.values()];
      panel.apply(facet, state.chosen);
    };
    function draw() {
      const counts = state.counts, selection = panel.selection(facet);
      if (!counts) return;
      state.chosen = selection.values || [];
      const chosen = new Set(state.chosen.map(value => facetKey(value, facet.def))), focusKey = list.contains(document.activeElement) ? document.activeElement.getAttribute("data-cx-key") : null;
      const needle = facet.hosted ? "" : foldText(state.search), locked = !!selection.locked;
      let items = counts.items.filter(item => !needle || item.value !== null && foldText(String(item.value)).includes(needle));
      // A chosen value the other facets exclude stays listed (count 0) so it can be unchosen; not while a hosted search hides it.
      if (!(facet.hosted && state.search)) for (const value of state.chosen) if (!items.some(item => facetKey(item.value, facet.def) === facetKey(value, facet.def))) items.push({ value, count: 0 });
      items.sort(facet.sort === "count" ? (a, b) => b.count - a.count || facetValueOrder(a.value, b.value, facet) : (a, b) => facetValueOrder(a.value, b.value, facet));
      // Show more lists at most 200 values; the search finds the others.
      const shown = state.expanded ? items.filter((item, index) => index < FACET_VALUES || chosen.has(facetKey(item.value, facet.def))) : items.filter((item, index) => index < facet.limit || chosen.has(facetKey(item.value, facet.def)));
      const numbers = numberFormat(grid.lang);
      list.replaceChildren(...shown.map((item, index) => {
        const row = h("li"), label = h("label", "cx-facet-val"), box = h("input"), text = h("span", "cx-facet-text"), count = h("span", "cx-facet-n"), key = facetKey(item.value, facet.def);
        box.type = "checkbox"; box.checked = chosen.has(key); box.disabled = locked; box.setAttribute("data-cx-key", key); box.tabIndex = (focusKey ? key === focusKey : index === 0) ? 0 : -1;
        const empty = item.value === null || item.value === "", display = empty ? grid.labels.gridFacetEmptyValue : facetValueText(grid, facet, item.value, text);
        if (empty) { setText(text, display); text.classList.add("cx-facet-empty"); }
        box.setAttribute("aria-label", fill(grid.labels.gridFacetValueCount, { value: display, count: numbers.format(item.count) }));
        setText(count, numbers.format(item.count)); count.setAttribute("aria-hidden", "true");
        if (!item.count) label.classList.add("cx-facet-zero");
        box.addEventListener("change", () => choose(item, box.checked));
        label.append(box, text, count); row.appendChild(label); return row;
      }));
      if (focusKey) list.querySelector('[data-cx-key="' + CSS.escape(focusKey) + '"]')?.focus({ preventScroll: true });
      const hidden = items.length - shown.length, capped = state.expanded && hidden > 0;
      more.hidden = !hidden && !state.expanded || items.length <= facet.limit;
      setText(more, state.expanded ? grid.labels.gridFacetShowFewer : fill(grid.labels.gridFacetShowMore, { count: numbers.format(Math.min(hidden, Math.max(1, FACET_VALUES - shown.length))) }));
      // The search box stays while it has text or focus, so clearing it never takes the reader's place away.
      search.hidden = !state.search && document.activeElement !== search && counts.totalValues <= FACET_SEARCH_FROM; search.disabled = locked;
      note.hidden = !counts.truncated && !capped;
      if (!note.hidden) setText(note, fill(grid.labels.gridFacetCounts, { count: numbers.format(counts.matched), shown: numbers.format(counts.truncated ? counts.items.length : shown.length), total: numbers.format(counts.totalValues) }));
    }
    return { draw, search: () => state.search, update(counts) { state.counts = counts; draw(); } };
  }

  /**
   * Orders facet values by the column's declared order when it has one, else as value lists do: booleans first, then text
   * by its folding (numbers by value); the empty bucket last.
   */
  function facetValueOrder(a, b, facet) {
    const column = facet.def;
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    if (facet.order) {
      const at = facet.order.get(foldText(String(a))) ?? Infinity, bt = facet.order.get(foldText(String(b))) ?? Infinity;
      if (at !== bt) return at < bt ? -1 : 1;
    }
    if (column.kind !== "text") return gridOrder(gridScalar(a, column), gridScalar(b, column));
    if (typeof a !== typeof b) return typeof a === "boolean" ? -1 : 1;
    return gridOrder(typeof a === "string" ? foldText(a) : a, typeof b === "string" ? foldText(b) : b);
  }

  /** Draws a value as its column's cells show it (a presenter's pill, for example) and returns the plain text. */
  function facetValueText(grid, facet, value, element) {
    const column = facet.def, options = column.presenter, text = cellText(value, column, grid.fmt) || String(value);
    if (options && !["statusStrip", "sparklineBars", "sparklineLine", "change", "identifier", "longText", "list", "tags", "structured"].includes(options.kind)) {
      try { gridCellRenderer(grid, column, options)({ id: "facet", cells: { [column.id]: value } }, element); return text; } catch (_) { element.replaceChildren(); }
    }
    setText(element, text);
    return text;
  }

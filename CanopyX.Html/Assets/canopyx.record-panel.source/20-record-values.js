  // ---------- record panel: values ----------
  // A scalar keeps what its cell shows in the grid: the column's host or plugin renderer or its presenter, else its text,
  // tone, tooltip and badges. A list draws chips, an object a nested property list, and a link (ref) a button that opens
  // the linked record. Collections, timelines and changes are blocks that span their section (30- and 40-record files).
  const RECORD_ICONS = {
    back: '<path d="m14 7-5 5 5 5"/>', print: '<path d="M7 9V4h10v5M7 17H5v-6h14v6h-2M8 14h8v6H8z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    open: '<path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/>', chevron: '<path d="m9 6 6 6-6 6"/>'
  };
  function recordIcon(name) {
    return svgIcon(RECORD_ICONS[name]);
  }
  function recordButton(text, run, className, icon) {
    const button = h("button", "cx-record-btn" + (className ? " " + className : "")); button.type = "button";
    if (icon) button.appendChild(recordIcon(icon));
    if (text) { const label = h("span", "cx-record-btn-label"); setText(label, text); button.appendChild(label); }
    button.addEventListener("click", event => { event.stopPropagation(); run(event); });
    return button;
  }
  const recordCount = (ctx, count) => formatValue(count, "number", ctx.fmt);
  const recordRefValid = ref => !!ref && typeof ref === "object" && typeof ref.id === "string" && !!ref.id && (ref.view === undefined || typeof ref.view === "string" && !!ref.view);

  function recordPlain(ctx, field, cell, element) {
    const text = cellText(cell, field.column || field, ctx.fmt), object = isCellObject(cell), blank = object && cellValue(cell) == null && cell.text === "", span = h("span");
    const column = field.column || field, rule = columnNumericTone(column, cellValue(cell));
    applyTone(span, "cx-drawer-text" + (text || blank ? "" : " p-missing"), toneOf(columnValueTone(column, cell) || (object ? cell.tone : null)));
    setText(span, text || blank ? text : "—"); if (object && cell.title) span.title = cell.title;
    element.appendChild(span);
    if (rule) { span.title = rule.label; const label = h("span", "p-sub"); setText(label, rule.label); element.appendChild(label); }
    if (object) for (const badge of cell.badges || []) element.appendChild(badgeElement(badge));
  }

  // A link to another record of this view or of another view on the page: a button, remembered as the focus origin of Back.
  function recordLink(ctx, cell, field, element, className) {
    const text = cellText(cell, field, ctx.fmt) || cell.ref.id;
    if (ctx.print || !recordRefValid(cell.ref)) { recordPlain(ctx, field, cell, element); return null; }
    const link = recordButton(text, () => ctx.navigate(cell.ref, link), "cx-record-link" + (className ? " " + className : ""));
    applyTone(link, link.className, toneOf(columnValueTone(field.column || field, cell) || cell.tone || null));
    link.setAttribute("data-cx-origin", field.id + ":" + ctx.origins++);
    if (cell.title) link.title = cell.title;
    element.appendChild(link);
    return link;
  }

  function recordScalar(ctx, field, cell, element) {
    const view = ctx.view, grid = recordGridHelpers();
    if (isCellObject(cell) && cell.ref) { recordLink(ctx, cell, field, element); return; }
    if (field.column && view.paintDrawerValue) {
      if (view.kind === "tree") view.paintDrawerValue(field.column, ctx.node, element, view.columns.indexOf(field.column), ctx);
      else view.paintDrawerValue(field.column, ctx.row, element, { signal: ctx.signal, width: ctx.width });
      return;
    }
    if ((field.presenter || field.wrap) && view.paintDrawerValue && view.kind === "grid") { view.paintDrawerValue(field, ctx.row, element, {signal:ctx.signal,width:ctx.width}); return; }
    recordPlain(ctx, field, cell, element);
  }

  function recordChip(ctx, field, item) {
    const object = isCellObject(item), text = cellText(item, field, ctx.fmt);
    if (object && item.ref && recordRefValid(item.ref) && !ctx.print) { const holder = h("span"); return recordLink(ctx, item, field, holder, "cx-record-chip"); }
    const chip = h("span"); applyTone(chip, "cx-record-chip", toneOf(columnValueTone(field.column || field, item) || (object ? item.tone : null)));
    setText(chip, text || "—"); if (object && item.title) chip.title = item.title;
    return chip;
  }
  function recordItems(ctx, field, items, element) {
    const list = h("span", "cx-record-chips"), limit = ctx.print ? items.length : 24;
    for (const item of items.slice(0, limit)) list.appendChild(recordChip(ctx, field, item));
    if (items.length > limit) {
      const more = recordButton(fill(ctx.labels.recordShowAll, { count: recordCount(ctx, items.length) }), () => {
        more.remove(); for (const item of items.slice(limit)) list.appendChild(recordChip(ctx, field, item));
        list.querySelector(".cx-record-chip:nth-child(" + (limit + 1) + ")")?.focus?.();
      }, "cx-record-more");
      list.appendChild(more);
    }
    element.appendChild(list);
  }

  function recordObject(ctx, field, entries, element, depth) {
    element.classList.add("cx-record-object-value");
    const list = h("dl", "cx-dl cx-record-object");
    for (const entry of entries) {
      if (!entry || !recordText(entry.name, 4096)) recordFail("an object field has a name and a value.");
      const term = h("dt"), value = h("dd"); setText(term, entry.name);
      recordValue(ctx, { id: field.id, title: entry.name, kind: entry.kind || "text", nested: true }, entry.value, value, depth + 1);
      list.append(term, value);
    }
    element.appendChild(list);
  }

  /** Paints a value; returns true for a block (a collection, timeline or changes) that spans its section. */
  function recordValue(ctx, field, cell, element, depth = 0) {
    const kind = recordKind(cell);
    try {
      if (kind && !Array.isArray(cell[kind]) && kind !== "records") recordFail("a structured " + kind + " value is an array.");
      if (depth > RECORD_MAX_STRUCTURE_DEPTH) recordFail("structured values nest at most " + RECORD_MAX_STRUCTURE_DEPTH + " levels.");
      else if (kind === "items") recordItems(ctx, field, cell.items, element);
      else if (kind === "fields") recordObject(ctx, field, cell.fields, element, depth);
      else if (kind === "records") recordCollection(ctx, field, cell.records, element);
      else if (kind === "events") recordTimeline(ctx, field, cell.events, element);
      else if (kind === "changes") recordChanges(ctx, field, cell.changes, element);
      else if (depth) isCellObject(cell) && cell.ref ? recordLink(ctx, cell, field, element) : recordPlain(ctx, field, cell, element);
      else recordScalar(ctx, field, cell, element);
    } catch (error) {
      element.replaceChildren(); recordPlain(ctx, field, isCellObject(cell) ? cell.text ?? null : cell, element); ctx.view.emit("error", { error });
    }
    return kind === "records" || kind === "events" || kind === "changes";
  }

  // ---------- grid cell summaries: the structured presenter ----------
  // A list shows its first chips and "+N", an object its first value and "+N", a collection, timeline or changes a count
  // ("{count} items" or the column's countText); display chooses count, chips or first. A cell's own text wins without one.
  const recordRowTitle = (list, row, fmt) => row && (list.columns?.[0] && cellText(row.cells?.[list.columns[0].id], list.columns[0], fmt) || row.label || row.id) || "";
  RECORD_IMPL.summary = (grid, column, options, row, element, text) => {
    const cell = row.cells[column.id], kind = recordKind(cell), labels = grid.labels, fmt = grid.fmt;
    const add = (value, className) => { const item = h("span", className || "cx-presenter-text"); setText(item, value); element.appendChild(item); return item; };
    const list = kind === "records" ? cell.records?.rows || cell.records?.roots || [] : kind ? cell[kind] : null;
    if (!kind || !Array.isArray(list)) { add(text || "—", text ? "" : "p-missing"); return; }
    const count = kind === "records" && Number.isInteger(cell.records.total) ? cell.records.total : list.length;
    if (!count) { add(text || "—", text ? "" : "p-missing"); return; }
    if (typeof cell.text === "string" && !options.display) { add(cell.text); return; }
    const display = options.display || (kind === "items" ? "chips" : kind === "fields" ? "first" : "count");
    const more = rest => { if (rest > 0) add(fill(labels.recordMore, { count: formatValue(rest, "number", fmt) }), "cx-record-more-count"); };
    if (display === "count") { add(fill(options.countText || labels.recordItems, { count: formatValue(count, "number", fmt) })); return; }
    if (display === "chips" && kind === "items") {
      const limit = options.limit || 3, box = h("span", "cx-tag-list"); element.classList.add("cx-list-cell");
      for (const item of list.slice(0, limit)) { const tag = h("span"); applyTone(tag, "p-tag", toneOf(isCellObject(item) ? item.tone : null)); setText(tag, cellText(item, column, fmt)); box.appendChild(tag); }
      element.appendChild(box); more(count - Math.min(limit, list.length)); return;
    }
    const first = list[0];
    add((kind === "items" ? cellText(first, column, fmt) : kind === "fields" ? cellText(first?.value, { kind: "text" }, fmt) :
      kind === "records" ? recordRowTitle(cell.records, first, fmt) : kind === "events" ? first?.summary : first?.name) || "—");
    more(count - 1);
  };

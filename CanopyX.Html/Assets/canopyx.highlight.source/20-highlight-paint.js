  // ---------- search highlighting: marks in painted rows and in the record drawer ----------
  // Only text nodes change: a text node with hits keeps its leading text and is followed by <mark> elements and the text
  // between them. Controls, icons, badges, existing marks and anything marked data-cx-no-highlight are left alone, so links,
  // pills, chips and host controls keep their markup; cells a host renderer draws are not marked at all. A row is unmarked
  // (each text node gets its text back) before it is painted again, so the painters, which update the text nodes they keep,
  // never see a mark. Only the rows a view paints are marked, whatever its size.
  const HL_SKIP = "button,svg,input,select,textarea,script,style,mark,.cx-badge,.cx-hidden-fields,[aria-hidden=true],[contenteditable],[data-cx-no-highlight]";
  // A column a host renderer or plugin draws (the built-in presenters are not host renderers).
  function hlHostDrawn(column) { return !!column.render && column.hostRenderer !== false; }
  function hlUnmark(element) {
    const marks = element._cxMarks;
    if (!marks) return;
    element._cxMarks = null;
    for (const entry of marks) {
      if (entry.cell) { entry.cell.classList.remove("cx-hit-cell"); continue; }
      for (const node of entry.added) node.remove();
      entry.node.data = entry.text;
    }
  }
  function hlMark(kind, tone, current) {
    const mark = h("mark", "cx-hit cx-hit-" + kind + (current ? " cx-hit-current" : "") + (tone ? " cx-hit-toned" : ""));
    if (tone) mark.style.setProperty("--cx-hit-tone", "var(--cx-tone-" + tone + ")");
    return mark;
  }
  /**
   * Marks the hits in one cell (or drawer value) and returns their count; current is the position of the hit to show as the
   * current match (a whole-cell hit is one hit, whatever the text nodes it spans). The marks are recorded on owner.
   */
  function hlMarkCell(owner, cell, applicable, options, record, current) {
    const nodes = [], walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const skip = node.data.trim() ? node.parentElement.closest(HL_SKIP) : cell;
      if (!skip || !cell.contains(skip) && skip !== cell) nodes.push(node);
    }
    if (!nodes.length) return 0;
    const whole = applicable.wholes.find(item => hlWhole(item, record)), entries = owner._cxMarks || (owner._cxMarks = []);
    let count = 0;
    const wrap = (node, ranges) => {
      const text = node.data, added = [];
      let cursor = ranges[0];
      const after = node.nextSibling, parent = node.parentNode;
      for (let i = 0; i < ranges.length; i += 3) {
        let end = ranges[i + 1];
        while (end < text.length && HL_MARKS.test(text.charAt(end))) end++;
        if (ranges[i] > cursor) added.push(document.createTextNode(text.slice(cursor, ranges[i])));
        const term = ranges[i + 2], mark = hlMark(term.kind, term.tone, current === (whole ? 0 : count));
        mark.appendChild(document.createTextNode(text.slice(ranges[i], end))); added.push(mark);
        cursor = end; if (!whole) count++;
      }
      if (cursor < text.length) added.push(document.createTextNode(text.slice(cursor)));
      node.data = text.slice(0, ranges[0]);
      for (const item of added) parent.insertBefore(item, after);
      entries.push({ node, text, added });
    };
    if (whole) {
      const term = { kind: "filter", tone: whole.tone };
      for (const node of nodes) wrap(node, [0, node.data.length, term]);
      return 1;
    }
    for (const node of nodes) {
      const ranges = hlRanges(hlFold(node.data, options), applicable.terms, []);
      if (ranges.length) wrap(node, ranges);
    }
    return count;
  }

  // Marks a painted row: a flat grid's shown columns, a tree's tree column. When the current match is not drawn (a presenter
  // that shows part of its value, such as the first tags of a list), its cell carries the current-match ring instead.
  function hlPaintRow(view, element, row) {
    const state = view.hl;
    if (!state || !state.active || !element._cells) return;
    const grid = view.kind === "grid";
    if (grid ? row.status || row.group : element._kind !== "node") return;
    const record = row.h, cols = grid ? view.cols : view.cols.slice(0, 1), current = state.current && state.current.key === record.id ? state.current : null;
    cols.forEach((column, position) => {
      const applicable = !hlHostDrawn(column) && state.columns.get(column.id), slot = element._cells[position];
      if (!applicable || !slot) return;
      const target = current && current.column === column.id ? current.n : -1, count = hlMarkCell(element, slot.cell, applicable, view.highlightOptions, record, target);
      if (target >= 0 && count <= target) { slot.cell.classList.add("cx-hit-cell"); (element._cxMarks ||= []).push({ cell: slot.cell }); }
    });
  }

  // The record drawer repaints its body for each record (and names the record on the dialog); its values are marked after
  // every repaint.
  function hlPaintDrawer(view, dialog) {
    const body = dialog.querySelector(".cx-drawer-body");
    if (!body || dialog._cxHighlight) return;
    dialog._cxHighlight = true;
    const paint = () => {
      observer.disconnect();
      const state = view.hl, record = dialog._cxRecord;
      if (state && state.active && record) {
        const queue = new Map();
        for (const column of view.columns) { const list = queue.get(column.title) || []; list.push(column); queue.set(column.title, list); }
        for (const term of body.querySelectorAll("dl > dt")) {
          const column = (queue.get(term.textContent) || []).shift(), applicable = column && !hlHostDrawn(column) && state.columns.get(column.id), value = term.nextElementSibling;
          if (applicable && value) hlMarkCell(value, value, applicable, view.highlightOptions, record, -1);
        }
      }
      if (dialog.isConnected) observer.observe(body, { childList: true });
    };
    const observer = new MutationObserver(paint);
    paint();
    dialog.addEventListener("close", () => observer.disconnect(), { once: true });
  }

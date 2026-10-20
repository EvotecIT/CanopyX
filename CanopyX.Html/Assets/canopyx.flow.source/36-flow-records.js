  // ---------- flow: records fields, rows of typed cells edited as a small table (docs/flow.md#records) ----------
  // Each cell uses the forms part's editor for its column type, as grid editing does, so a records field needs no grid
  // runtime and works on a flow-only page. Rows are added and removed with buttons; the value is a list of { column: value }.
  // Every cell's control is named "<column>, row <n>", so a reader always knows where they are.
  function flowRecordsInput(context, field, view) {
    const labels = view.labels, group = h("div", "cx-flow-records"), table = h("table", "cx-flow-records-table"), head = h("thead"), body = h("tbody");
    const add = h("button", "cx-flow-btn cx-flow-list-add"), rows = [], max = field.items.max ?? 1000;
    group.setAttribute("role", "group");
    const headRow = h("tr");
    for (const column of field.columns) {
      const th = h("th"); th.scope = "col"; setText(th, column.title);
      if (column.width) th.style.width = column.width + "px";
      if (column.required) th.classList.add("cx-flow-records-required");
      headRow.appendChild(th);
    }
    const actions = h("th", "cx-flow-records-actions"), actionsText = h("span", "cx-sr-only");
    actions.scope = "col"; setText(actionsText, labels.flowRecordActions); actions.appendChild(actionsText);
    headRow.appendChild(actions); head.appendChild(headRow);
    table.append(head, body);
    const changed = () => group.dispatchEvent(new Event("change", { bubbles: true }));
    const cellText = (column, value) => value == null ? "" : column.type === "number" ? numberFormat(context.locale, 0, 20).format(value) :
      column.type === "select" ? column.options.find(option => option.value === value)?.label ?? String(value) : String(value);

    const renumber = () => rows.forEach((row, index) => {
      row.cells.forEach(({ column, instance }) => (instance.control || instance.element).setAttribute("aria-label", fill(labels.flowRecordCell, { column: column.title, row: index + 1 })));
      row.remove.setAttribute("aria-label", fill(labels.flowRecordRemove, { row: index + 1 }));
    });
    const paintTools = () => { add.disabled = context.readOnly || rows.length >= max; };

    const addRow = (values, focus) => {
      const tr = h("tr", "cx-flow-records-row"), row = { tr, cells: [], abort: new AbortController() };
      for (const column of field.columns) {
        const td = h("td"), value = values?.[column.id] ?? null;
        const cellContext = Object.freeze({ id: context.id + "-r" + rows.length + "-" + column.id, value, text: cellText(column, value), readOnly: context.readOnly,
          row: Object.freeze({ id: field.id, cells: Object.freeze({}) }), column: Object.freeze({ id: column.id, title: column.title, kind: column.type === "number" ? "number" : "text" }),
          editor: Object.freeze({ type: column.type }), options: column.options.length ? column.options : null, rules: column.spec.rules, labels, locale: context.locale,
          timeZone: "utc", mode: "flow", initial: undefined, signal: row.abort.signal, lookupMinLength: 1, commit: changed, cancel: () => {}, lookup: () => [], remember: changed });
        const instance = EDIT_EDITORS[column.type].create(cellContext), control = instance.control || instance.element;
        control.classList.add("cx-flow-input");
        if (context.readOnly) { control.disabled = control.tagName === "SELECT" || control.type === "checkbox"; control.readOnly = true; }
        td.appendChild(instance.element);
        tr.appendChild(td);
        row.cells.push({ column, instance });
      }
      const cell = h("td", "cx-flow-records-actions"), remove = h("button", "cx-flow-icon-btn");
      remove.type = "button"; setText(remove, "×"); remove.hidden = context.readOnly;
      remove.addEventListener("click", () => {
        const at = rows.indexOf(row);
        rows.splice(at, 1); row.abort.abort(); row.cells.forEach(({ instance }) => instance.destroy?.()); tr.remove();
        renumber(); paintTools(); changed();
        // Focus moves to the row that took its place, or to Add when the table is empty.
        const next = rows[Math.min(at, rows.length - 1)];
        (next ? next.cells[0].instance.control || next.cells[0].instance.element : add).focus();
      });
      cell.appendChild(remove); tr.appendChild(cell); row.remove = remove;
      rows.push(row); body.appendChild(tr);
      renumber(); paintTools();
      if (focus) (row.cells[0].instance.control || row.cells[0].instance.element).focus();
      return row;
    };

    for (const values of Array.isArray(context.value) ? context.value : []) addRow(values, false);
    add.type = "button"; setText(add, "+ " + labels.flowRecordAdd); add.setAttribute("aria-label", fill(labels.flowAddItem, { field: field.label })); add.hidden = context.readOnly;
    add.addEventListener("click", () => { addRow(null, true); changed(); });
    const empty = h("p", "cx-flow-records-empty"); setText(empty, labels.flowRecordsEmpty);
    const paintEmpty = () => { empty.hidden = rows.length > 0; table.hidden = !rows.length; };
    group.addEventListener("change", paintEmpty);
    paintEmpty();
    const scroller = h("div", "cx-flow-records-scroll"); scroller.appendChild(table);
    group.append(scroller, empty, add);
    paintTools();
    return { element: group, control: group, group: true,
      focus: () => (rows[0] ? rows[0].cells[0].instance.control || rows[0].cells[0].instance.element : add).focus(),
      // A cell that is not a value yet (text in a number cell, half a date) names its row and column.
      error: () => {
        for (const [index, row] of rows.entries()) for (const { column, instance } of row.cells) {
          const problem = instance.error?.();
          if (problem) return fill(labels.flowRecordProblem, { row: index + 1, message: problem });
        }
        return null;
      },
      getValue: () => rows.map(row => Object.fromEntries(row.cells.map(({ column, instance }) => {
        const value = instance.getValue();
        return [column.id, value === "" || value === undefined ? null : value];
      }))),
      destroy: () => rows.forEach(row => { row.abort.abort(); row.cells.forEach(({ instance }) => instance.destroy?.()); }) };
  }

  /** The first problem of a records answer: the row count, then each row's cells by their column's checks. */
  function flowRecordsProblem(view, field, rows) {
    const labels = view.labels, title = field.label, items = field.items;
    if (!rows.length) return field.required ? field.spec.rules.message || fill(labels.gridEditRequired, { column: title }) : null;
    if (items.min !== undefined && rows.length < items.min) return fill(labels.flowItemsMin, { field: title, min: items.min });
    if (items.max !== undefined && rows.length > items.max) return fill(labels.flowItemsMax, { field: title, max: items.max });
    for (const [index, row] of rows.entries()) for (const column of field.columns) {
      const value = row[column.id] ?? null, shown = bound => typeof bound === "number" ? numberFormat(view.lang, 0, 20).format(bound) : String(bound);
      const problem = column.type === "toggle" ? null : formCheck(column.spec, value, column.type === "number" ? "number" : "text", column.title, labels, shown);
      if (problem) return fill(labels.flowRecordProblem, { row: index + 1, message: problem });
    }
    return null;
  }

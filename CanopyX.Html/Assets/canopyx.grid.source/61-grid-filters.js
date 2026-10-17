  // ---------- typed predicates: one query owner, with single-line typed controls ----------

  function gridFilterValue(grid, column, type, raw) {
    if (column.kind === "number") {
      if (!raw.trim() || !Number.isFinite(Number(raw))) throw new Error(grid.labels.gridInvalidFilter);
      return Number(raw);
    }
    if (column.kind === "datetime") {
      let text = raw;
      if (!/(?:Z|[+-]\d\d:\d\d)$/.test(raw)) {
        const moment = gridDateInputMoment(raw, grid.local);
        if (!moment) throw new Error(grid.labels.gridInvalidFilter);
        text = grid.local ? moment.toISOString() : raw + "Z";
      }
      gridScalar(text, column); return text;
    }
    if (type === "boolean") {
      if (!["true", "false"].includes(raw)) throw new Error(grid.labels.gridInvalidFilter);
      return raw === "true";
    }
    if (type === "mixed") throw new Error(grid.labels.gridInvalidFilter);
    return raw;
  }

  // Membership is one field that opens checkable facet values; Enter in its search adds a typed value for columns without facets.
  function gridMultiSelect(grid, columnOf, typeOf) {
    const box = h("details", "cx-ms"), summary = h("summary", "cx-input sel"), text = h("span"), list = h("div", "cx-ms-list"), search = h("input", "cx-input"),
      values = h("div", "cx-val-list"), selected = new Map(), facets = new Map(), key = value => typeof value + ":" + foldText(value), name = value => cellText(value, columnOf(), grid.fmt);
    let loaded;
    search.type = "search"; search.placeholder = grid.labels.gridFacetSearch; search.setAttribute("aria-label", search.placeholder);
    summary.appendChild(text); list.append(search, values); box.append(summary, list);
    const sync = () => { setText(text, [...selected.values()].map(name).join(", ") || grid.labels.gridFacetChoose); text.classList.toggle("ph", !selected.size); };
    const render = () => {
      const all = new Map(facets); values.replaceChildren();
      for (const [id, value] of selected) if (!all.has(id)) all.set(id, { value });
      for (const [id, item] of all) {
        const label = h("label", "cx-val"), check = h("input"), count = h("span", "cx-val-n"), title = name(item.value);
        check.type = "checkbox"; check.checked = selected.has(id); if (item.count) setText(count, numberFormat(grid.lang).format(item.count));
        label.append(check, title, count); label.hidden = !foldText(title).includes(foldText(search.value)); values.appendChild(label);
        check.addEventListener("change", () => { if (check.checked) selected.set(id, item.value); else selected.delete(id); sync(); });
      }
    };
    box.addEventListener("toggle", async () => {
      if (box.open && !loaded) {
        const column = columnOf(); loaded = true;
        try { for (const item of (await grid.columnFacetItems(column, "")).items) if (item.value != null && column === columnOf()) facets.set(key(item.value), item); } catch (_) {}
      }
      render(); if (box.open) list.scrollIntoView({ block: "nearest" });
    });
    search.addEventListener("input", render);
    search.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      try { box._add(gridFilterValue(grid, columnOf(), typeOf(), search.value)); search.value = ""; render(); box.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) {}
    });
    return Object.assign(box, { _values: selected, _sync: sync, _add(value) { selected.set(key(value), value); sync(); },
      _reset() { selected.clear(); facets.clear(); loaded = box.open = false; sync(); } });
  }
  Object.assign(DataGrid.prototype, {
    addGridFilter(parent, predicate) {
      if (parent.children.length >= 64) return;
      const row = h("fieldset", "cx-grid-filter"), column = h("select"), operator = h("select"), type = h("select"),
        multiple = gridMultiSelect(this, () => this.columns.find(item => item.id === column.value), () => type.value), multipleField = h("div", "cx-grid-field cx-condition-value");
      multipleField.setAttribute("role", "group"); multipleField.setAttribute("aria-label", this.labels.gridConditionValue);
      let remove, input = h("input", "cx-grid-filter-value"), current;
      const legend = h("legend", "cx-sr-only"); setText(legend, this.labels.gridFilters); row.appendChild(legend);
      for (const item of this.columns) if (item.filterable !== false) column.appendChild(gridOption(item.id, item.title));
      if (!column.options.length) return;
      if (predicate) column.value = predicate.column;
      for (const [value, name] of [["string", "gridText"], ["boolean", "gridBoolean"]]) {
        type.appendChild(gridOption(value, this.labels[name]));
      }
      if (predicate && predicate.values.length && predicate.values.some(value => typeof value === "boolean")) {
        if (predicate.values.every(value => typeof value === "boolean")) type.value = "boolean";
        else {
          type.appendChild(gridOption("mixed", this.labels.gridText + " / " + this.labels.gridBoolean)); type.value = "mixed";
        }
      }
      const columnField = gridInputLabel(this.labels.gridColumn, column), conditionField = gridInputLabel(this.labels.gridOperator, operator);
      const typeField = gridInputLabel(this.labels.gridValueType, type), valueField = gridInputLabel(this.labels.gridConditionValue, input);
      columnField.classList.add("cx-condition-column"); conditionField.classList.add("cx-condition-operator"); typeField.classList.add("cx-condition-type"); valueField.classList.add("cx-condition-value");
      multipleField.appendChild(multiple); multipleField.hidden = true; row.append(columnField, conditionField, typeField, valueField, multipleField);
      const change = () => {
        const definition = this.columns.find(item => item.id === column.value), previous = operator.value;
        const declaredBoolean=definition.presenter?.kind==="boolean";
        if(declaredBoolean)type.value="boolean";
        if (current !== column.value) { if (current !== undefined) multiple._reset(); current = column.value; }
        const operators = definition.kind === "text" ? ["eq", "ne", "contains", "startsWith", "in", "isNull", "isNotNull"] :
          ["eq", "ne", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull"];
        operator.textContent = "";
        operators.forEach(name => operator.appendChild(gridOption(name, this.labels[GRID_FILTER_LABELS[name]] || GRID_FILTER_LABELS[name])));
        if (definition.kind === "datetime") for (const [name, label] of GRID_DATE_PRESETS) operator.appendChild(gridOption(name, this.labels[label]));
        if ([...operator.options].some(option => option.value === previous)) operator.value = previous;
        const raw = input.value, boolean=definition.kind==="text"&&type.value==="boolean", next = h(boolean?"select":"input", "cx-grid-filter-value");
        if(boolean)next.append(gridOption("true",this.labels.gridTrue),gridOption("false",this.labels.gridFalse));
        else if (definition.kind !== "text") { next.type = definition.kind === "number" ? "number" : "datetime-local"; next.step = "any"; }
        next.value = boolean&&!['true','false'].includes(raw)?"true":raw; input.replaceWith(next); input = next;
        input.addEventListener("input", () => { row._filter.edited = true; });
        if (row._filter) row._filter.input = input;
        if (remove) { if(remove.classList.contains("icon")) remove.setAttribute("aria-label",this.labels.gridDeleteCondition); else setText(remove,fill(this.labels.gridRemoveFilter,{column:definition.title})); }
        typeField.hidden = definition.kind !== "text" || declaredBoolean || row._design && type.value === "string"; multiple._sync(); update();
      };
      const update = () => {
        const none = ["isNull", "isNotNull"].includes(operator.value) || GRID_DATE_PRESETS.some(item => item[0] === operator.value), many = operator.value === "in";
        valueField.hidden = none || many; multipleField.hidden = none || !many;
        input.disabled = none || many; type.disabled = none || typeField.hidden;
      };
      column.addEventListener("change", change); type.addEventListener("change",change); operator.addEventListener("change", update); change();
      if (predicate) {
        operator.value = predicate.operator;
        if (operator.value === "in") predicate.values.forEach(multiple._add);
        else input.value = input.type === "datetime-local" && predicate.values.length ? gridDateInput(predicate.values[0],this.local) : predicate.values.join("\n");
        update();
      }
      remove = gridButton(fill(this.labels.gridRemoveFilter, { column: this.columns.find(item => item.id === column.value).title }), () => row.remove());
      row.appendChild(remove); row._filter = { column, operator, input, multiple, type,
        original: predicate && { column: predicate.column, operator: predicate.operator, values: predicate.values.slice() }, edited: false };
      for (const field of [column, operator, type, multiple]) {
        field.addEventListener("change", () => { row._filter.edited = true; });
        field.addEventListener("input", () => { row._filter.edited = true; });
      }
      parent.appendChild(row);
    },

    readGridFilter(row) {
      const fields = row._filter, column = this.columns.find(item => item.id === fields.column.value), operator = fields.operator.value;
      if (fields.original && !fields.edited) return fields.original;
      if (GRID_DATE_PRESETS.some(item => item[0] === operator)) {
        const [start, end] = gridDatePreset(this.local, operator);
        return [{ column: column.id, operator: "ge", values: [start] }, { column: column.id, operator: "lt", values: [end] }];
      }
      const values = ["isNull", "isNotNull"].includes(operator) ? [] : operator === "in" ? [...fields.multiple._values.values()] :
        [gridFilterValue(this, column, fields.type.value, fields.input.value)];
      if (operator === "in" && !values.length) throw new Error(this.labels.gridInvalidFilter);
      return { column: column.id, operator, values };
    }
  });

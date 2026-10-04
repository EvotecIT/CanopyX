  // ---------- typed predicates: one query owner, with native form controls ----------
  const GRID_FILTER_LABELS = { eq: "=", ne: "≠", contains: "gridContains", startsWith: "gridStartsWith", in: "gridIn",
    gt: ">", ge: "≥", lt: "<", le: "≤", isNull: "gridIsNull", isNotNull: "gridIsNotNull" };

  Object.assign(DataGrid.prototype, {
    buildGridFilters() {
      this.controlPanel(this.labels.gridFilters, "cx-grid-filters", panel => this.renderGridFilters(panel));
    },
    renderGridFilters(panel) {
      panel.textContent = "";
      const form = h("form", "cx-grid-filter-form"), rows = h("div"), error = h("p", "cx-grid-control-error");
      error.setAttribute("role", "status");
      const add = predicate => this.addGridFilter(rows, predicate);
      (this.queryForChange().filters || []).forEach(add);
      form.appendChild(rows); form.appendChild(gridButton(this.labels.gridAddFilter, () => add(null)));
      const apply = h("button", "cx-button"); apply.type = "submit"; setText(apply, this.labels.gridApply); form.appendChild(apply);
      form.appendChild(gridButton(this.labels.gridClearFilters, () => {
        rows.textContent = ""; this.setQuery(Object.assign({}, this.queryForChange(), { filters: [], offset: 0, revision: undefined })).catch(failure => setText(error, failure.message));
      }));
      form.appendChild(error); panel.appendChild(form);
      form.addEventListener("submit", event => {
        event.preventDefault();
        try {
          const filters = [...rows.children].map(row => this.readGridFilter(row));
          this.setQuery(Object.assign({}, this.queryForChange(), { filters: filters, offset: 0, revision: undefined }))
            .then(() => setText(error, ""), failure => setText(error, failure.message));
        } catch (failure) { setText(error, failure.message); }
      });
    },

    addGridFilter(parent, predicate) {
      if (parent.children.length >= 64) return;
      const row = h("fieldset", "cx-grid-filter"), column = h("select"), operator = h("select"), input = h("input", "cx-grid-filter-value"),
        multiple = h("textarea", "cx-grid-filter-value"), type = h("select");
      let remove;
      const legend = h("legend", "cx-sr-only"); setText(legend, this.labels.gridFilters); row.appendChild(legend);
      multiple.rows = 2; input.step = "any";
      for (const item of this.columns) { const option = h("option"); option.value = item.id; setText(option, item.title); column.appendChild(option); }
      if (predicate) column.value = predicate.column;
      for (const [value, name] of [["string", "gridText"], ["boolean", "gridBoolean"]]) {
        const option = h("option"); option.value = value; setText(option, this.labels[name]); type.appendChild(option);
      }
      if (predicate && predicate.values.length && typeof predicate.values[0] === "boolean") type.value = "boolean";
      const columnField = gridInputLabel(this.labels.gridColumn, column), conditionField = gridInputLabel(this.labels.gridOperator, operator);
      const typeField = gridInputLabel(this.labels.gridValueType, type), valueField = gridInputLabel(this.labels.gridValue, input),
        multipleField = gridInputLabel(this.labels.gridValue, multiple);
      multipleField.hidden = true; row.append(columnField, conditionField, typeField, valueField, multipleField);
      const change = () => {
        const definition = this.columns.find(item => item.id === column.value), previous = operator.value;
        const operators = definition.kind === "text" ? ["eq", "ne", "contains", "startsWith", "in", "isNull", "isNotNull"] :
          ["eq", "ne", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull"];
        operator.textContent = "";
        operators.forEach(name => { const option = h("option"); option.value = name; setText(option, this.labels[GRID_FILTER_LABELS[name]] || GRID_FILTER_LABELS[name]); operator.appendChild(option); });
        if (operators.includes(previous)) operator.value = previous;
        input.type = definition.kind === "number" ? "number" : definition.kind === "datetime" ? "datetime-local" : "text";
        if (remove) setText(remove, fill(this.labels.gridRemoveFilter, { column: definition.title }));
        typeField.hidden = definition.kind !== "text"; update();
      };
      const update = () => {
        const raw = multipleField.hidden ? input.value : multiple.value, none = ["isNull", "isNotNull"].includes(operator.value), many = operator.value === "in";
        valueField.hidden = none || many; multipleField.hidden = none || !many;
        if (many) multiple.value = raw; else input.value = raw;
      };
      column.addEventListener("change", change); operator.addEventListener("change", update); change();
      if (predicate) {
        operator.value = predicate.operator;
        input.value = input.type === "datetime-local" && predicate.values.length ? new Date(predicate.values[0]).toISOString().slice(0, -1) : predicate.values.join("\n");
        if (operator.value === "in") { multiple.value = predicate.values.join("\n"); valueField.hidden = true; multipleField.hidden = false; } else update();
      }
      remove = gridButton(fill(this.labels.gridRemoveFilter, { column: this.columns.find(item => item.id === column.value).title }), () => row.remove());
      row.appendChild(remove); row._filter = { column: column, operator: operator, input: input, multiple: multiple, type: type }; parent.appendChild(row);
    },

    readGridFilter(row) {
      const fields = row._filter, column = this.columns.find(item => item.id === fields.column.value), operator = fields.operator.value;
      const value = operator === "in" ? fields.multiple.value : fields.input.value;
      const values = ["isNull", "isNotNull"].includes(operator) ? [] : (operator === "in" ? value.split(/\r?\n/) : [value]).map(raw => {
        if (column.kind === "number") {
          if (!raw.trim() || !Number.isFinite(Number(raw))) throw new Error(this.labels.gridInvalidFilter);
          return Number(raw);
        }
        if (column.kind === "datetime") {
          const text = /(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw + "Z";
          gridScalar(text, column); return text;
        }
        if (fields.type.value === "boolean") {
          if (!["true", "false"].includes(raw)) throw new Error(this.labels.gridInvalidFilter);
          return raw === "true";
        }
        return raw;
      });
      return { column: column.id, operator: operator, values: values };
    }
  });

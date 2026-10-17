  // ---------- reporting range and category conditions; installed with the optional filter editor ----------
  // Reporting-only and retired control labels; hosts that translate them get the reporting runtime from CanopyLabels.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridPinColumn: "{column}: pinned region", gridPinNone: "Scroll", gridFilterGroupTitle: "Additional grouped conditions",
    gridAddFilterGroup: "Add condition group", gridFacetValues: "Values and counts from applied filters",
    gridFacetIncludeCurrent: "Include this column's applied filters", gridFacetLoad: "Load values",
    gridFacetReload: "Values changed or the request was cancelled. Load values again.",
    gridBetween: "between (inclusive)", gridRangeEnd: "Upper value (UTC for dates)",
    gridInvalidRange: "Enter an upper value greater than or equal to the lower value.",
    gridSuggestedCategory: "Suggested category", gridChooseCategory: "Choose a category", gridBooleanValue: "Boolean value",
    gridHealthy: "Healthy", gridValue: "Value (UTC for dates)", gridAddFilter: "Add filter",
    gridMoveEarlier: "Move {column} earlier", gridMoveLater: "Move {column} later", gridFitColumn: "Fit {column}"
  }));
  function reportingRangeRows(filters) {
    const rows = [];
    for (let index = 0; index < filters.length; index++) {
      const lower = filters[index], upper = filters[index + 1];
      if (lower.operator === "ge" && upper && upper.operator === "le" && lower.column === upper.column) {
        rows.push({ column: lower.column, operator: "between", values: [lower.values[0], upper.values[0]] }); index++;
      } else rows.push(lower);
    }
    return rows;
  }

  function reportingRangeValue(raw, column, labels, local) {
    if (column.kind === "number") {
      if (!raw.trim()) throw new Error(labels.gridInvalidFilter);
      const value = Number(raw); gridScalar(value, column); return value;
    }
    let value = raw;
    if (!/(?:Z|[+-]\d\d:\d\d)$/.test(raw)) {
      const moment = gridDateInputMoment(raw, local);
      if (!moment) throw new Error(labels.gridInvalidFilter);
      value = local ? moment.toISOString() : raw + "Z";
    }
    gridScalar(value, column); return value;
  }

  // The editor calls this after installing, so these overrides wrap its condition rows; gridDateInput is an editor helper.
  GRID_REPORTING.installFilters = ({ gridDateInput }) => {
  const REPORT_FILTER_BASE = { addGridFilter: DataGrid.prototype.addGridFilter, readGridFilter: DataGrid.prototype.readGridFilter };
  Object.assign(DataGrid.prototype, {
    addGridFilter(parent, predicate) {
      if (!this.view.reporting) return REPORT_FILTER_BASE.addGridFilter.call(this, parent, predicate);
      const count = parent.children.length, range = predicate && predicate.operator === "between";
      REPORT_FILTER_BASE.addGridFilter.call(this, parent, range ? { column: predicate.column, operator: "ge", values: [predicate.values[0]] } : predicate);
      if (parent.children.length === count) return;
      const row = parent.lastElementChild, fields = row._filter, upper = h("input", "cx-grid-filter-value"), choices = h("select"), boolean = h("select");
      const upperField = gridInputLabel(this.labels.gridConditionUpperValue, upper), categoryField = gridInputLabel(this.labels.gridSuggestedCategory, choices),
        booleanField = gridInputLabel(this.labels.gridBooleanValue, boolean);
      boolean.append(gridOption("true", this.labels.gridTrue), gridOption("false", this.labels.gridFalse));
      row.insertBefore(upperField, row.lastElementChild); row.insertBefore(categoryField, row.lastElementChild); row.insertBefore(booleanField, row.lastElementChild);
      fields.upper = upper; fields.boolean = boolean;
      const refresh = () => {
        const column = this.columns.find(item => item.id === fields.column.value), rangeKind = column.kind === "number" || column.kind === "datetime";
        if (rangeKind && ![...fields.operator.options].some(option => option.value === "between"))
          fields.operator.appendChild(gridOption("between", this.labels.gridBetween));
        upper.type = column.kind === "datetime" ? "datetime-local" : "number"; upper.step = "any";
        upperField.hidden = fields.operator.value !== "between"; upper.disabled = upperField.hidden;
        const categories = this.view.reporting.ordering && this.view.reporting.ordering[column.id];
        categoryField.hidden = column.kind !== "text" || !categories || !categories.categories || !categories.categories.length ||
          fields.type.value !== "string" || !["eq", "ne"].includes(fields.operator.value);
        choices.textContent = ""; choices.appendChild(gridOption("", this.labels.gridChooseCategory));
        for (const value of categories && categories.categories || []) choices.appendChild(gridOption(value, value));
        booleanField.hidden = column.kind !== "text" || fields.type.value !== "boolean" || !["eq", "ne"].includes(fields.operator.value);
        if (!booleanField.hidden) {
          boolean.value = ["true", "false"].includes(fields.input.value) ? fields.input.value : "true";
          fields.input.value = boolean.value;
        }
        fields.input.closest("label").hidden = !booleanField.hidden || ["isNull", "isNotNull", "in"].includes(fields.operator.value);
      };
      fields.column.addEventListener("change", refresh); fields.operator.addEventListener("change", refresh); fields.type.addEventListener("change", refresh);
      upper.addEventListener("input", () => { fields.edited = true; });
      choices.addEventListener("change", () => { fields.input.value = choices.value; fields.edited = true; });
      boolean.addEventListener("change", () => { fields.input.value = boolean.value; fields.edited = true; });
      refresh();
      if (range) {
        fields.operator.value = "between";
        upper.value = upper.type === "datetime-local" ? gridDateInput(predicate.values[1],this.local) : String(predicate.values[1]); refresh();
        fields.rangeOriginal = { column: predicate.column, values: predicate.values.slice(), inputs: [fields.input.value, upper.value] };
      }
    },

    readGridFilter(row) {
      const fields = row._filter;
      if (!this.view.reporting || fields.operator.value !== "between") return REPORT_FILTER_BASE.readGridFilter.call(this, row);
      const column = this.columns.find(item => item.id === fields.column.value);
      const original = fields.rangeOriginal, inputs = [fields.input.value, fields.upper.value];
      const values = inputs.map((raw, index) => original && original.column === column.id && raw === original.inputs[index] ?
        original.values[index] : reportingRangeValue(raw, column, this.labels, this.local));
      if (gridScalar(values[0], column) > gridScalar(values[1], column)) throw new Error(this.labels.gridInvalidRange);
      return [{ column: column.id, operator: "ge", values: [values[0]] }, { column: column.id, operator: "le", values: [values[1]] }];
    }
  });
  };

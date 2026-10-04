  // ---------- reporting filter controls over the existing typed query owner ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridBetween: "between (inclusive)", gridRangeEnd: "Upper value (UTC for dates)",
    gridInvalidRange: "Enter an upper value greater than or equal to the lower value.",
    gridSuggestedCategory: "Suggested category", gridChooseCategory: "Choose a category", gridBooleanValue: "Boolean value",
    gridTrue: "True", gridFalse: "False", gridHeaderFilter: "Filter {column}"
  }));
  const REPORT_FILTER_BASE = {};
  for (const method of ["buildGridFilters", "renderGridFilters", "addGridFilter", "readGridFilter", "buildHeader"])
    REPORT_FILTER_BASE[method] = DataGrid.prototype[method];

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

  function reportingRangeValue(raw, column, labels) {
    if (column.kind === "number") {
      if (!raw.trim()) throw new Error(labels.gridInvalidFilter);
      const value = Number(raw); gridScalar(value, column); return value;
    }
    const value = /(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw + "Z";
    gridScalar(value, column); return value;
  }

  Object.assign(DataGrid.prototype, {
    buildGridFilters() {
      if (!this.view.reporting) return REPORT_FILTER_BASE.buildGridFilters.call(this);
      this.reportingFilters = this.controlPanel(this.labels.gridFilters, "cx-grid-filters", panel => this.renderGridFilters(panel));
      this.reportingFilters.panel.id = this.id + "-filters";
      this.reportingFilters.details.addEventListener("keydown", event => {
        if (event.key === "Escape" && this.reportingFilterReturn) {
          this.focusReportingFilterHeader(); this.reportingFilterReturn = null;
        }
      });
      this.reportingFilters.details.addEventListener("toggle", () => this.syncReportingFilterHeaders());
    },

    renderGridFilters(panel) {
      if (!this.view.reporting) return REPORT_FILTER_BASE.renderGridFilters.call(this, panel);
      panel.textContent = "";
      const form = h("form", "cx-grid-filter-form"), rows = h("div"), error = h("p", "cx-grid-control-error");
      error.setAttribute("role", "status");
      reportingRangeRows(this.queryForChange().filters || []).forEach(filter => this.addGridFilter(rows, filter));
      form.appendChild(rows); form.appendChild(gridButton(this.labels.gridAddFilter, () => this.addGridFilter(rows, null)));
      const apply = h("button", "cx-button"); apply.type = "submit"; setText(apply, this.labels.gridApply); form.appendChild(apply);
      form.appendChild(gridButton(this.labels.gridClearFilters, () => {
        rows.textContent = "";
        this.setQuery(gridQueryStart(this.queryForChange(true), { filters: [], filterGroup: undefined })).catch(failure => setText(error, failure.message));
      }));
      form.appendChild(error); panel.appendChild(form);
      form.addEventListener("submit", event => {
        event.preventDefault();
        try {
          const filters = [...rows.children].flatMap(row => this.readGridFilter(row));
          this.setQuery(gridQueryStart(this.queryForChange(true), { filters }))
            .then(() => setText(error, ""), failure => setText(error, failure.message));
        } catch (failure) { setText(error, failure.message); }
      });
      const requested = this.reportingFilterColumn;
      if (requested) {
        let row = [...rows.children].find(item => item._filter.column.value === requested);
        if (!row && rows.children.length < 64) {
          this.addGridFilter(rows, null); row = rows.lastElementChild;
          row._filter.column.value = requested; row._filter.column.dispatchEvent(new Event("change"));
        }
        if (row) row._filter.input.focus({ preventScroll: true }); else apply.focus({ preventScroll: true });
        this.reportingFilterColumn = null;
      }
    },

    addGridFilter(parent, predicate) {
      if (!this.view.reporting) return REPORT_FILTER_BASE.addGridFilter.call(this, parent, predicate);
      const count = parent.children.length, range = predicate && predicate.operator === "between";
      REPORT_FILTER_BASE.addGridFilter.call(this, parent, range ? { column: predicate.column, operator: "ge", values: [predicate.values[0]] } : predicate);
      if (parent.children.length === count) return;
      const row = parent.lastElementChild, fields = row._filter, upper = h("input", "cx-grid-filter-value"), choices = h("select"), boolean = h("select");
      const upperField = gridInputLabel(this.labels.gridRangeEnd, upper), categoryField = gridInputLabel(this.labels.gridSuggestedCategory, choices),
        booleanField = gridInputLabel(this.labels.gridBooleanValue, boolean);
      boolean.append(gridOption("true", this.labels.gridTrue), gridOption("false", this.labels.gridFalse));
      row.insertBefore(upperField, row.lastElementChild); row.insertBefore(categoryField, row.lastElementChild); row.insertBefore(booleanField, row.lastElementChild);
      fields.upper = upper;
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
        fields.operator.value = "between"; fields.rangeOriginal = predicate.values.slice();
        upper.value = upper.type === "datetime-local" ? new Date(predicate.values[1]).toISOString().slice(0, -1) : String(predicate.values[1]); refresh();
      }
    },

    readGridFilter(row) {
      const fields = row._filter;
      if (!this.view.reporting || fields.operator.value !== "between") return REPORT_FILTER_BASE.readGridFilter.call(this, row);
      const column = this.columns.find(item => item.id === fields.column.value);
      const values = fields.rangeOriginal && !fields.edited ? fields.rangeOriginal : [
        reportingRangeValue(fields.input.value, column, this.labels), reportingRangeValue(fields.upper.value, column, this.labels)
      ];
      if (gridScalar(values[0], column) > gridScalar(values[1], column)) throw new Error(this.labels.gridInvalidRange);
      return [{ column: column.id, operator: "ge", values: [values[0]] }, { column: column.id, operator: "le", values: [values[1]] }];
    }
  });

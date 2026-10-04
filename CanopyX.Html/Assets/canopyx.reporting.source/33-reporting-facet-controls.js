  // ---------- raw facet choices edit a filter draft; counts belong to the accepted query ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridFacetValues: "Values and counts from applied filters", gridFacetSearch: "Search values",
    gridFacetIncludeCurrent: "Include this column's applied filters", gridFacetLoad: "Load values",
    gridFacetChoose: "Choose a value", gridFacetCounts: "{count} matching rows; {shown} of {total} values.",
    gridFacetReload: "Values changed or the request was cancelled. Load values again."
  }));
  const FACET_CONTROLS = {};
  for (const name of ["buildGridFilters", "renderGridFilters", "addGridFilter", "syncQuerySummary", "destroy"]) FACET_CONTROLS[name] = DataGrid.prototype[name];

  Object.assign(DataGrid.prototype, {
    stopReportingFacets() { for (const stop of this.reportingFacetStops || []) stop(); },
    syncQuerySummary() {
      FACET_CONTROLS.syncQuerySummary.call(this);
      const shape = JSON.stringify([this.acceptedQuery?.revision, this.acceptedQuery?.search, this.acceptedQuery?.filters, this.acceptedQuery?.filterGroup]);
      if (shape !== this.reportingFacetAccepted) this.stopReportingFacets();
      this.reportingFacetAccepted = shape;
    },
    buildGridFilters() {
      this.reportingFacetStops = new Set(); this.reportingFacetSequence = 0; FACET_CONTROLS.buildGridFilters.call(this);
      this.reportingFilters?.details.addEventListener("toggle", () => {
        if (!this.reportingFilters.details.open) this.stopReportingFacets();
      });
    },
    renderGridFilters(panel) { this.stopReportingFacets(); FACET_CONTROLS.renderGridFilters.call(this, panel); },
    destroy() { this.stopReportingFacets(); FACET_CONTROLS.destroy.call(this); },
    addGridFilter(parent, predicate) {
      const count = parent.children.length; FACET_CONTROLS.addGridFilter.call(this, parent, predicate);
      if (parent.children.length === count || !this.view.reporting?.facetColumns?.length) return;
      this.buildReportingFacetControl(parent.lastElementChild);
    },
    buildReportingFacetControl(row) {
      const fields = row._filter, details = h("details", "cx-grid-facet"), summary = h("summary"),
        body = h("div", "cx-grid-facet-body"), search = h("input"), include = h("input"), choice = h("select"), status = h("p");
      setText(summary, this.labels.gridFacetValues); search.type = "search"; search.maxLength = 16384;
      include.type = "checkbox"; include.checked = true; status.setAttribute("role", "status");
      status.id = this.id + "-facet-" + ++this.reportingFacetSequence; choice.setAttribute("aria-describedby", status.id);
      const load = gridButton(this.labels.gridFacetLoad, () => loadValues());
      body.append(gridInputLabel(this.labels.gridFacetSearch, search), gridInputLabel(this.labels.gridFacetIncludeCurrent, include),
        load, gridInputLabel(this.labels.gridFacetChoose, choice));
      details.append(summary, status, body); row.insertBefore(details, row.lastElementChild);
      let timer, controller, epoch = 0, items = [], composing = false;
      const clear = () => { items = []; choice.textContent = ""; choice.appendChild(gridOption("", this.labels.gridFacetChoose)); choice.disabled = true; };
      const stop = () => {
        clearTimeout(timer); timer = null; epoch++; controller?.abort(); controller = null;
        this.reportingFacetStops.delete(stop); load.disabled = false;
        clear(); if (details.open) setText(status, this.labels.gridFacetReload);
      };
      row._facetDispose = stop;
      const active = () => !this.destroyed && row.isConnected && details.open && !details.hidden && this.reportingFilters.details.open;
      const loadValues = async () => {
        stop(); if (!active()) return;
        clear(); const generation = epoch, request = new AbortController(); controller = request;
        this.reportingFacetStops.add(stop); load.disabled = true; setText(status, this.labels.loading);
        try {
          const page = await this.getFacets(fields.column.value, { search: search.value, includeCurrentFilter: include.checked, signal: request.signal });
          if (generation !== epoch || !active()) return;
          items = page.items;
          const column = this.columns.find(item => item.id === fields.column.value), numbers = numberFormat(this.lang);
          page.items.forEach((item, index) => {
            const text = item.value === null ? this.labels.gridIsNull : column.kind === "text" ?
              (typeof item.value === "boolean" ? this.labels.gridBoolean + ": " + (item.value ? this.labels.gridTrue : this.labels.gridFalse) :
                this.labels.gridText + ": " + item.value) : column.kind === "number" ? numbers.format(item.value) : item.value;
            choice.appendChild(gridOption(String(index), text + " (" + numbers.format(item.count) + ")"));
          });
          choice.disabled = !items.length;
          setText(status, fill(this.labels.gridFacetCounts, { count: numbers.format(page.matched), shown: numbers.format(items.length), total: numbers.format(page.totalValues) }));
        } catch (failure) {
          if (generation === epoch && active()) setText(status, failure.name === "AbortError" ? this.labels.gridFacetReload : failure.message);
        } finally {
          if (generation === epoch) { load.disabled = false; controller = null; }
        }
      };
      const schedule = () => {
        stop(); clear(); if (!active() || composing) return;
        setText(status, this.labels.loading); this.reportingFacetStops.add(stop);
        timer = setTimeout(loadValues, 200);
      };
      search.addEventListener("input", schedule);
      search.addEventListener("compositionstart", () => { composing = true; stop(); });
      search.addEventListener("compositionend", () => { composing = false; schedule(); });
      search.addEventListener("keydown", event => {
        if (event.key === "Enter") { event.preventDefault(); if (!event.isComposing && !composing) loadValues(); }
      });
      include.addEventListener("change", loadValues);
      details.addEventListener("toggle", () => {
        if (details.open) loadValues(); else { stop(); clear(); setText(status, ""); }
      });
      const refresh = () => {
        stop(); clear(); setText(status, ""); details.open = false;
        details.hidden = !this.view.reporting.facetColumns.includes(fields.column.value);
      };
      fields.column.addEventListener("change", refresh);
      row.lastElementChild.addEventListener("click", stop, { capture: true });
      choice.addEventListener("change", () => {
        if (!choice.value || !items[Number(choice.value)]) return;
        const value = items[Number(choice.value)].value, column = this.columns.find(item => item.id === fields.column.value);
        fields.type.value = typeof value === "boolean" ? "boolean" : "string";
        fields.operator.value = value === null ? "isNull" : "eq";
        fields.operator.dispatchEvent(new Event("change")); fields.type.dispatchEvent(new Event("change"));
        fields.input.value = value === null ? "" : column.kind === "datetime" ? new Date(value).toISOString().slice(0, -1) : String(value);
        if (fields.boolean) fields.boolean.value = String(value);
        fields.original = { column: column.id, operator: fields.operator.value, values: value === null ? [] : [value] }; fields.edited = false;
      });
      refresh();
    }
  });

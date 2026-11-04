  DataGrid.prototype.showChart = async function (input) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !["source", "type", "category", "values", "group"].includes(key)) ||
        input.source !== undefined && !["filtered", "selected", "range", "groups", "pivot"].includes(input.source) ||
        input.type !== undefined && !chartTypes.includes(input.type) ||
        input.values !== undefined && (!Array.isArray(input.values) || !input.values.length || new Set(input.values).size !== input.values.length))
      throw new Error("CanopyX: invalid chart options.");
    if (this.destroyed || this.pendingQuery || !this.acceptedQuery) throw new Error("CanopyX: chart an accepted view.");
    const options = { ...input, source: input.source || (this.pivotState?.active ? "pivot" : this.groupLevels?.length ? "groups" : "filtered") };
    const body = h("div", "cx-chart-analysis"), controls = h("div", "cx-chart-controls"), type = h("select", "cx-input"), source = h("select", "cx-input"), values = h("select", "cx-input"),
      status = h("p", "cx-chart-status"), canvas = h("div", "cx-chart-canvas");
    const add = (select, value, title) => { const option = h("option"); option.value = value; setText(option, title); select.append(option); };
    chartTypes.forEach(kind => add(type, kind, this.labels["gridChart" + kind.replace(/(^|-)([a-z])/g, (_, dash, letter) => letter.toUpperCase())]));
    for (const name of ["filtered", "selected", "range", "groups", "pivot"]) {
      if (name === "groups" && !this.groupLevels?.length || name === "pivot" && !this.pivotState?.active || name === "range" &&
          !(this.opts.rangeSelection ?? this.view.rangeSelection) && !this.getCellRanges().length && options.source !== "range") continue;
      add(source, name, this.labels["gridChartSource" + name[0].toUpperCase() + name.slice(1)]);
    }
    const field = (caption, select) => { const label = h("label"), text = h("span"); setText(text, caption); select.setAttribute("aria-label", caption); label.append(text, select); controls.append(label); };
    field(this.labels.gridChartSource, source); field(this.labels.gridChartType, type); field(this.labels.gridPivotValues, values);
    values.multiple = true; values.size = 3; source.value = options.source;
    if (source.value !== options.source) throw new Error("CanopyX: this chart source is unavailable.");
    const linkedSource = "chart:" + this.id, clear = gridButton(this.labels.gridChartClearFilter,
      () => this.clearExternalFilters(linkedSource).catch(error => this.emit("error", { error })));
    controls.append(clear); status.setAttribute("role", "status"); body.append(controls, status, canvas);
    this.showReportingText({ ...this.view.columns[0], title: this.labels.gridChart }, "", document.activeElement, undefined, false, body, this.lifetime.signal);
    const dialog = this.reportingText, lifetime = new AbortController();
    dialog.dataset.size = "lg"; dialog.classList.add("cx-chart-dialog");
    let pending, controller, captured, revision = 0;
    const draw = () => {
      if (!captured.series.length) {
        const heldFocus = canvas.contains(document.activeElement);
        controller?.destroy(); controller = null;
        setText(status, this.labels.gridPivotValues + " · " + this.labels.gridNoData);
        if (heldFocus) values.focus();
        return;
      }
      const descriptor = { type: type.value, label: this.view.label + " · " + source.selectedOptions[0].textContent,
        categories: captured.categories, series: captured.series };
      if (controller) controller.update(descriptor);
      else controller = window.ChartForgeXRenderer.create(canvas, descriptor, { signal: lifetime.signal,
        onSelect: mark => {
          const filters = captured.filters.get(mark.categoryId);
          if (filters?.length) this.setExternalFilter(linkedSource, filters).catch(error => this.emit("error", { error }));
        } });
    };
    const refresh = async () => {
      pending?.abort(); pending = new AbortController(); const signal = pending.signal, current = ++revision;
      setText(status, this.labels.gridChartLoading); canvas.setAttribute("aria-busy", "true");
      try {
        const next = await GRID_CHARTS.capture(this, options, signal);
        if (lifetime.signal.aborted || current !== revision) return;
        captured = next; if (!type.value) type.value = options.type || next.suggested;
        if (options.source === "pivot" && options.values && !options.pivotValues) options.pivotValues = next.pivotValues;
        values.replaceChildren(); for (const item of next.availableValues) {
          add(values, item.id, item.name); values.lastChild.selected = next.series.some(series => series.id === item.id);
        }
        draw(); if (next.series.length) setText(status, next.categories.length ? "" : this.labels.gridNoData);
      } catch (error) {
        if (signal.aborted || lifetime.signal.aborted || current !== revision) return;
        controller?.destroy(); controller = null; setText(status, error.message); this.emit("error", { error });
      } finally { if (current === revision) canvas.removeAttribute("aria-busy"); }
    };
    type.value = options.type || "";
    source.addEventListener("change", () => { options.source = source.value; delete options.group; delete options.values; delete options.pivotValues; delete options.category; void refresh(); }, { signal: lifetime.signal });
    values.addEventListener("change", () => {
      const selected = [...values.selectedOptions].map(option => option.value);
      if (options.source === "pivot") { options.pivotValues = selected; delete options.values; }
      else options.values = selected;
      void refresh();
    }, { signal: lifetime.signal });
    type.addEventListener("change", () => { if (captured) { try { draw(); if (captured.series.length) setText(status, captured.categories.length ? "" : this.labels.gridNoData); }
      catch (error) { controller?.destroy(); controller = null; setText(status, error.message); } } }, { signal: lifetime.signal });
    this.host.addEventListener("canopyx:query", () => { void refresh(); }, { signal: lifetime.signal });
    this.host.addEventListener("canopyx:select", () => { if (options.source === "selected") void refresh(); }, { signal: lifetime.signal });
    this.host.addEventListener("canopyx:cellRangeChange", () => { if (options.source === "range") void refresh(); }, { signal: lifetime.signal });
    dialog.addEventListener("close", () => { pending?.abort(); lifetime.abort(); }, { once: true });
    await refresh();
  };

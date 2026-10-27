  DataGrid.prototype.openPivotColumnMenu = async function (anchor) {
    await this.requirePart("filter-editor"); await this.requirePart("ui-menu"); if (this.destroyed || this.pendingQuery || !pivotIntent(this)?.active) return;
    const state = pivotIntent(this), result = this.pivotResult, columns = [...pivotVisible(result.columns, state.collapsedColumns, true), result.columns[0]];
    return this.openGridPopover(anchor, "cx-pivot-column-menu", this.labels.gridPivotColumn, null, (panel, signal) => {
      UI_TOOLS.menuItems(panel, columns.map(column => ({ id: column.key, label: pivotLabel(this, state, "columns", column) })));
      return UI_IMPL.menu(panel, { host: this.host, trigger: anchor, anchored: false, bindTrigger: false, decorateTrigger: false, label: this.labels.gridPivotColumn,
        onSelect: item => {
          const scroll = this.pivotPanel.querySelector(".cx-pivot-scroll"), table = scroll.querySelector("table");
          const cell = [...table.querySelectorAll("[data-pivot-column]")].find(cell => cell.dataset.pivotColumn === item.id);
          if (!cell) return;
          scroll.scrollLeft += cell.getBoundingClientRect().left - scroll.getBoundingClientRect().left - table.tHead.rows[0].cells[0].getBoundingClientRect().width;
        }
      }, signal);
    });
  };
  DataGrid.prototype.pivotZones = function () {
    const state = pivotIntent(this), zones = h("div", "cx-pivot-zones");
    zones.setAttribute("role", "group"); zones.setAttribute("aria-label", this.labels.gridPivotConfigure);
    for (const [axis, label] of [["rows", this.labels.gridPivotRows], ["columns", this.labels.gridPivotColumns], ["values", this.labels.gridPivotValues]]) {
      const zone = h("div", "cx-pivot-zone"), title = h("span"); setText(title, label); zone.append(title);
      const entries = axis === "values" ? state.values.map(id => reportingAggregateName(this, this.view.reporting.aggregates.find(value => value.id === id))) : state[axis].map(level =>
        pivotColumn(this, level.column).title + (level.bucket ? " · " + this.labels["gridBucket" + level.bucket.kind[0].toUpperCase() + level.bucket.kind.slice(1)] : ""));
      for (const entry of entries) { const chip = h("span", "cx-gchip"), name = h("span", "cx-gchip-name"); setText(name, entry); chip.title = entry; chip.append(name); zone.append(chip); }
      const edit = gridButton("+", () => this.configurePivot(edit)); edit.dataset.size = "sm"; edit.title = this.labels.gridPivotFieldOptions + ": " + label; edit.setAttribute("aria-label", edit.title); edit.dataset.pivotFocus = "zone:" + axis; zone.append(edit); zones.append(zone);
    }
    zones.append(gridButton(this.labels.gridPivotFlat, () => this.setPivot(false).catch(error => this.emit("error", { error }))));
    return zones;
  };
  DataGrid.prototype.pivotValueMenu = async function (aggregate, button) {
    await this.requirePart("filter-editor"); if (this.destroyed || this.pendingQuery) return;
    const controls = h("form", "cx-show-as-fields"), label = h("label", "cx-show-as-field"), text = h("span"), select = h("select", "cx-input");
    setText(text, this.labels.gridShowAs); select.setAttribute("aria-label", this.labels.gridShowAs);
    for (const mode of GRID_SHOW_AS_MODES) { const option = h("option"); option.value = mode; setText(option, this.labels["gridShowAs" + mode[0].toUpperCase() + mode.slice(1)]); select.append(option); }
    select.value = showAsMode(this, aggregate);
    const apply = gridButton(this.labels.gridApply, () => {}); apply.type = "submit"; apply.dataset.variant = "primary";
    controls.addEventListener("submit", event => { event.preventDefault(); this.setAggregateShowAs(aggregate.id, select.value).then(() => this.reportingText?._cxOverlay.close()).catch(error => this.emit("error", { error })); });
    label.append(text, select); controls.append(label, apply); this.showReportingText({ ...pivotColumn(this, aggregate.column), title: reportingAggregateName(this, aggregate) }, "", button, undefined, false, controls);
  };
  DataGrid.prototype.configurePivot = async function (button) {
    await this.requirePart("filter-editor"); if (this.destroyed || this.pendingQuery) return;
    const state = pivotIntent(this), initial = state || { rows: [], columns: [], values: [this.view.reporting.aggregates[0].id], maxColumns: 200 };
    const form = h("form", "cx-pivot-editor"), axes = {}, values = [];
    const option = (select, value, text) => { const entry = h("option"); entry.value = value; setText(entry, text); select.append(entry); };
    for (const [axis, maximum, title] of [["rows", 4, this.labels.gridPivotRows], ["columns", 2, this.labels.gridPivotColumns]]) {
      const group = h("fieldset"), legend = h("legend"); setText(legend, title); group.append(legend); axes[axis] = [];
      for (let index = 0; index < maximum; index++) {
        const line = h("label", "cx-pivot-axis"), column = h("select", "cx-input"), bucket = h("select", "cx-input"), width = h("input", "cx-input"), origin = h("input", "cx-input"), direction = h("select", "cx-input");
        column.setAttribute("aria-label", title + " " + (index + 1)); bucket.setAttribute("aria-label", title + " " + (index + 1) + ": " + this.labels.gridBucket);
        option(column, "", "—"); for (const item of this.view.columns.filter(column => column.sortable && column.filterable !== false)) option(column, item.id, item.title);
        const current = initial[axis][index]; column.value = current?.column || "";
        direction.setAttribute("aria-label", title + " " + (index + 1) + ": " + this.labels.gridGroupSortBy);
        option(direction, "asc", this.labels.gridSortAscending); option(direction, "desc", this.labels.gridSortDescending); direction.value = current?.direction || "asc";
        width.type = "text"; width.maxLength = 4096; origin.type = "number"; origin.step = "any";
        width.value = current?.bucket?.edges?.join(", ") || String(current?.bucket?.width ?? 10); origin.value = String(current?.bucket?.origin ?? 0);
        const update = () => {
          const old = bucket.value, selected = pivotColumn(this, column.value); bucket.replaceChildren(); option(bucket, "", this.labels.gridBucketNone);
          const kinds = selected?.kind === "datetime" ? ["day", "week", "month", "quarter", "year", "hour", "weekday"] : selected?.kind === "number" ? ["width", "edges"] : [];
          for (const kind of kinds) option(bucket, kind, this.labels["gridBucket" + kind[0].toUpperCase() + kind.slice(1)]);
          bucket.value = kinds.includes(old) ? old : ""; bucket.hidden = !kinds.length; direction.hidden = !selected; range();
        };
        const range = () => {
          width.hidden = !["width", "edges"].includes(bucket.value); origin.hidden = bucket.value !== "width";
          width.setAttribute("aria-label", bucket.value === "edges" ? this.labels.gridBucketEdges : this.labels.gridBucketWidth); origin.setAttribute("aria-label", this.labels.gridBucketOrigin);
        };
        column.addEventListener("change", update); bucket.addEventListener("change", range); update(); bucket.value = current?.bucket?.kind || ""; range();
        line.append(column, bucket, width, origin, direction); group.append(line);
        axes[axis].push(() => {
          if (!column.value) return null;
          const kind = bucket.value, spec = !kind ? undefined : kind === "width" ? { kind, width: width.value.trim() ? Number(width.value) : NaN, origin: origin.value.trim() ? Number(origin.value) : NaN } : kind === "edges" ?
            { kind, edges: width.value.split(",").map(value => value.trim() ? Number(value) : NaN) } : { kind, timeZone: current?.bucket?.timeZone || "UTC", firstWeekday: current?.bucket?.firstWeekday ?? 1 };
          return { column: column.value, direction: direction.value, ...(spec ? { bucket: spec } : {}) };
        });
      }
      form.append(group);
    }
    const group = h("fieldset"), legend = h("legend"); setText(legend, this.labels.gridPivotValues); group.append(legend);
    for (const aggregate of this.view.reporting.aggregates) {
      const label = h("label"), check = h("input"), text = h("span"); check.type = "checkbox"; check.className = "cx-check"; check.checked = initial.values.includes(aggregate.id); setText(text, reportingAggregateName(this, aggregate));
      label.append(check, text); group.append(label); values.push(() => check.checked ? aggregate.id : null);
    }
    const topLabel = h("label", "cx-pivot-setting"), topText = h("span"), top = h("input", "cx-input"); top.type = "number"; top.placeholder = "1–200"; top.min = "1"; top.max = "200"; top.value = initial.topNColumns === undefined ? "" : String(initial.topNColumns);
    setText(topText, this.labels.gridPivotTopN); topLabel.append(topText, top); top.setAttribute("aria-label", this.labels.gridPivotTopN);
    const sortLabel = h("label", "cx-pivot-setting"), sortText = h("span"), sort = h("select", "cx-input"), descending = h("select", "cx-input");
    setText(sortText, this.labels.gridPivotSort); option(sort, "", this.labels.gridGroupSortValue);
    for (const aggregate of this.view.reporting.aggregates) option(sort, aggregate.id, reportingAggregateName(this, aggregate));
    sort.value = initial.sortByTotal?.aggregate || ""; sort.setAttribute("aria-label", this.labels.gridPivotSort);
    option(descending, "desc", this.labels.gridSortDescending); option(descending, "asc", this.labels.gridSortAscending); descending.value = initial.sortByTotal?.direction || "desc";
    sortLabel.append(sortText, sort, descending);
    const error = h("p", "cx-pivot-note"); error.setAttribute("role", "alert"); error.hidden = true;
    const apply = gridButton(this.labels.gridApply, () => {}); apply.type = "submit"; apply.dataset.variant = "primary";
    const flat = gridButton(this.labels.gridPivotFlat, () => {
      this.reportingText?._cxOverlay.close(); this.setPivot(false).catch(error => this.emit("error", { error }));
    }); flat.classList.add("cx-pivot-editor-flat"); flat.hidden = !state?.active;
    form.append(group, topLabel, sortLabel, flat, error, apply);
    for (const select of form.querySelectorAll("select")) {
      const title = () => { select.title = select.selectedOptions[0]?.textContent || ""; }; title(); select.addEventListener("change", title);
    }
    form.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const definition = pivotDefinition(this.view, { rows: axes.rows.map(read => read()).filter(Boolean), columns: axes.columns.map(read => read()).filter(Boolean), values: values.map(read => read()).filter(Boolean), maxColumns: initial.maxColumns,
          ...(top.value.trim() ? { topNColumns: Number(top.value) } : {}), ...(sort.value ? { sortByTotal: { aggregate: sort.value, direction: descending.value } } : {}) });
        this.reportingText?._cxOverlay.close(); this.setPivot(definition).catch(error => this.emit("error", { error }));
      } catch (_) { error.hidden = false; setText(error, this.labels.gridPivotInvalid); }
    });
    this.showReportingText({ ...this.view.columns[0], title: this.labels.gridPivotConfigure }, "", button, undefined, false, form);
  };

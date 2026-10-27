  DataGrid.prototype.openAggregateMenu = function (column, aggregates, values, button, text) {
    const controls = h("form", "cx-show-as-fields"), choices = [];
    for (const aggregate of aggregates) {
      const label = h("label", "cx-show-as-field"), name = h("span"), select = h("select", "cx-input");
      setText(name, reportingAggregateName(this, aggregate)); select.setAttribute("aria-label", aggregate.label + ": " + this.labels.gridShowAs);
      for (const mode of GRID_SHOW_AS_MODES.filter(mode => !["percentRow", "percentColumn"].includes(mode))) {
        const option = h("option"); option.value = mode; setText(option, this.labels["gridShowAs" + mode[0].toUpperCase() + mode.slice(1)]); select.append(option);
      }
      select.value = this.aggregateShowAs?.[aggregate.id] ?? aggregate.showAs ?? "value";
      choices.push([aggregate.id, select]);
      label.append(name, select); controls.append(label);
    }
    const apply = gridButton(this.labels.gridApply, () => {}); apply.type = "submit"; apply.dataset.variant = "primary"; controls.append(apply);
    controls.addEventListener("submit", async event => { event.preventDefault(); for (const [id, select] of choices) await this.setAggregateShowAs(id, select.value); this.reportingText?._cxOverlay.close(); });
    this.showReportingText(column, "", button, undefined, false, controls);
  };

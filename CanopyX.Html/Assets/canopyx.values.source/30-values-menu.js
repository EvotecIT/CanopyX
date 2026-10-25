  DataGrid.prototype.openAggregateMenu = function (column, aggregates, values, button, text) {
    const controls = h("div", "cx-show-as-fields");
    for (const aggregate of aggregates) {
      const label = h("label", "cx-show-as-field"), name = h("span"), select = h("select", "cx-input");
      setText(name, aggregate.label); select.setAttribute("aria-label", aggregate.label + ": " + this.labels.gridShowAs);
      for (const mode of GRID_SHOW_AS_MODES.filter(mode => !["percentRow", "percentColumn"].includes(mode))) {
        const option = h("option"); option.value = mode; setText(option, this.labels["gridShowAs" + mode[0].toUpperCase() + mode.slice(1)]); select.append(option);
      }
      select.value = this.aggregateShowAs?.[aggregate.id] ?? aggregate.showAs ?? "value";
      select.addEventListener("change", () => this.setAggregateShowAs(aggregate.id, select.value).then(() => this.reportingText?.close()).catch(error => this.emit("error", { error })));
      label.append(name, select); controls.append(label);
    }
    this.showReportingText(column, text ?? reportingAggregateParts(this, column, aggregates, values).title, button, undefined, false, controls);
  };

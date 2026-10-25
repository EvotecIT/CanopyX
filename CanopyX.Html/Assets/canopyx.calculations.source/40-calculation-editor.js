  DataGrid.prototype.openCalculatedColumn = async function (anchor) {
    if (!this.view.calculatedColumnsEditable || this.view.source.kind !== "inline") throw new Error("CanopyX: calculated-column editing is not enabled.");
    await loadGridFilterEditor(); if (this.destroyed || this.pendingQuery) return;
    const form = h("form", "cx-calculation-editor"), help = h("p"), error = h("p", "cx-calculation-error"), id = h("input", "cx-input"), title = h("input", "cx-input"), kind = h("select", "cx-input"), expression = h("textarea", "cx-input");
    let ordinal = 1; while (this.view.columns.some(column => column.id === "calculated" + ordinal)) ordinal++;
    id.value = "calculated" + ordinal; id.maxLength = 128; title.maxLength = 256; expression.maxLength = 2048; expression.rows = 4; expression.spellcheck = false;
    const field = (label, control) => { const row = h("label"), text = h("span"); setText(text, label); row.append(text, control); form.append(row); control.required = true; return row; };
    field(this.labels.gridCalculationTitle, title); field(this.labels.gridCalculationId, id);
    for (const [value, label] of [["number", this.labels.gridCalculationNumber], ["text", this.labels.gridText], ["datetime", this.labels.gridCalculationDate]]) {
      const option = h("option"); option.value = value; setText(option, label || value); kind.append(option);
    }
    field(this.labels.gridValueType, kind); field(this.labels.gridCalculationExpression, expression);
    setText(help, this.labels.gridCalculationHelp); error.setAttribute("role", "alert"); error.hidden = true;
    const apply = gridButton(this.labels.gridApply, () => {}); apply.type = "submit"; form.append(help, error, apply);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const definitions = [...calculationDefinitions(this.view), { id: id.value.trim(), title: title.value.trim(), kind: kind.value, expression: expression.value }];
      try {
        calculationColumns(this, definitions); this.reportingText?.close();
        this.setCalculatedColumns(definitions).catch(fault => this.emit("error", { error: fault }));
      } catch (_) { error.hidden = false; setText(error, this.labels.gridCalculationInvalid); }
    });
    this.showReportingText({ ...this.view.columns[0], title: this.labels.gridCalculationAdd }, "", anchor, undefined, false, form);
  };

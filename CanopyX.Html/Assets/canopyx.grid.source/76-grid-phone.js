  // Phone records retain a contained primary value and a quiet line of up to two priority context fields.
  // The drawer chip counts only what that line does not show.
  DataGrid.prototype.hiddenViewColumns = function () {
    return this.columns.filter(column => !column.hidden && (column.responsiveHidden || column.fitHidden));
  };
  DataGrid.prototype.phoneLineColumns = function () {
    if (this.host.clientWidth > 640 || (this.layoutMode || "fit") !== "fit") return [];
    const hidden = this.hiddenViewColumns().sort((a, b) => gridRank(a) - gridRank(b));
    const compact = this.columns.filter(column => !column.hidden && !column.responsiveHidden && !column.fitHidden).length <= 2;
    return hidden.filter(column => gridLevel(column) === 0 || compact).slice(0, 2);
  };
  DataGrid.prototype.paintHiddenFields = function (slot, row, column) {
    if (this.phone && column.identity) slot.cell.title = cellText(row.cells[column.id], column, this.fmt) || "";
    const first = column === this.cols[0], fields = first && this.phone ? this.phoneLineColumns(row) : [];
    let button = slot.hiddenFields;
    const hidden = first && (this.phone || this.desktopHiddenFields) ? this.hiddenViewColumns().filter(column => !fields.includes(column)) : [], count = hidden.length;
    if (!count) { button?.remove(); slot.hiddenFields = null; }
    else {
      if (!button) {
        button = gridButton("", () => Promise.resolve().then(() => this.openDetails(button.dataset.cxRecord)).catch(error => this.emit("error", { error })));
        button.classList.add("cx-hidden-fields"); button.tabIndex = -1;
      }
      const label = fill(plural(this.labels.hiddenColumns, count, this.lang), { count: numberFormat(this.lang).format(count) }), titles = hidden.map(item => item.title).join(", ");
      button.dataset.cxRecord = row.id; button.setAttribute("aria-label", label + ": " + titles); button.title = titles; setText(button, label);
      slot.hiddenFields = button;
    }
    if (!first || !this.phone) {
      slot.childSlots?.forEach(disposeHostSlot); slot.childSlots = null;
      slot.phoneLine?.remove(); slot.phoneLine = null;
      if (slot.phonePrimary) { slot.phonePrimary.replaceWith(...slot.phonePrimary.childNodes); slot.phonePrimary = null; }
      if (first && count) slot.cell.appendChild(button);
      return;
    }
    let primary = slot.phonePrimary;
    if (!primary || primary.parentNode !== slot.cell) primary = h("span", "cx-phone-primary");
    // Presenters may replace their children while repainting a recycled row. Keep existing slot references intact.
    for (const node of [...slot.cell.childNodes]) if (node !== primary && node !== slot.phoneLine && node !== button) primary.appendChild(node);
    if (primary.parentNode !== slot.cell) slot.cell.prepend(primary);
    slot.phonePrimary = primary;
    if (!fields.length && !count) {
      slot.childSlots?.forEach(disposeHostSlot); slot.childSlots = null;
      slot.phoneLine?.remove(); slot.phoneLine = null; return;
    }
    let line = slot.phoneLine;
    if (!line || line.parentNode !== slot.cell) { line = h("span", "cx-phone-fields"); slot.cell.appendChild(line); }
    slot.phoneLine = line;
    const shape = JSON.stringify(fields.map(item => item.id));
    if (line.dataset.cxFields !== shape) {
      slot.childSlots?.forEach(disposeHostSlot);
      line.replaceChildren(); line.dataset.cxFields = shape; slot.childSlots = [];
      for (const field of fields) {
        const item = h("span", "cx-phone-field"), label = h("span", "cx-phone-field-title"), value = h("span", "cx-phone-value");
        setText(label, field.title + ":"); item.append(label, value); line.appendChild(item);
        const content = value.appendChild(h("span", "cx-content")), textSpan = content.appendChild(h("span", "cx-text"));
        slot.childSlots.push({ cell: value, content, base: "cx-phone-value", cls: null, title: null, badges: [], mode: "default", textSpan, text: textSpan.appendChild(document.createTextNode("")) });
      }
    }
    // A wrapped context field keeps its disclosure beside the value.
    const disclosure = fields.length ? line.lastElementChild : line;
    if (count && button.parentNode !== disclosure) disclosure.appendChild(button);
    fields.forEach((field, index) => {
      this.paintSlot(slot.childSlots[index], row, field, this.columns.indexOf(field), { level: 0, expanded: false });
      const value = slot.childSlots[index].cell;
      value.title = cellText(row.cells[field.id], field, this.fmt) || "";
      value.tabIndex = value.querySelector(".p-pill,.p-state") ? 0 : -1;
    });
  };

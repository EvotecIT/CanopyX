// Comparison context follows the row, while ordinary grids keep their existing phone and drawer policies.
const COMPARE_RECORD_BASE = { phoneLineColumns: DataGrid.prototype.phoneLineColumns,
  filterCaption: DataGrid.prototype.filterCaption };
Object.assign(DataGrid.prototype, {
  filterCaption(filter) {
    return this.view.compare && compareOnlyFilter(this, filter) ? this.labels.compareOnlyChanges : COMPARE_RECORD_BASE.filterCaption?.call(this, filter);
  },
  phoneLineColumns(row) {
    if (!this.view.compare || !row) return COMPARE_RECORD_BASE.phoneLineColumns.call(this, row);
    if (this.host.clientWidth > 640 || (this.layoutMode || "fit") !== "fit") return [];
    // Phone fit mode measures row heights. Every changed field can therefore remain visible, even beyond two fields.
    return cellValue(row.cells[this.view.compare.statusColumn]) === "changed" ?
      this.hiddenViewColumns().filter(column => row.cells[column.id]?.changes?.length) : [];
  }
});
// The shared drawer installs on first use. Follow its public part hook instead of replacing a method it owns.
DataGrid.drawerHook(5, function (dialog) {
  if (!this.view.compare) return;
  dialog.classList.add("cx-compare-drawer"); dialog.dataset.modal = "true";
  dialog._cxOverlay.setModal(true);
  let paints;
  dialog.addEventListener("close", () => paints?.abort(), { once: true });
  dialog.addEventListener("cx-drawer-paint", () => {
    paints?.abort(); paints = new AbortController();
    const row = dialog._cxRecord, body = dialog.querySelector(".cx-drawer-body");
    body.querySelector(".cx-compare-record-changes")?.remove();
    const changed = this.columns.filter(column => column.drawer !== false && row.cells[column.id]?.changes?.length);
    const status = cellValue(row.cells[this.view.compare.statusColumn]);
    if (status === "removed") for (const column of changed) {
      for (const block of body.querySelectorAll('.cx-record-block[data-cx-field="' + CSS.escape(column.id) + '"]')) {
        const list = h("dl", "cx-dl"), term = h("dt"), value = h("dd"), old = h("del");
        setText(term, column.title); term.dataset.cxField = value.dataset.cxField = column.id;
        const earlier = { ...row, cells: { ...row.cells, [column.id]: row.cells[column.id].changes[0].before } };
        this.paintDrawerValue(column, earlier, old, { signal: paints.signal });
        value.append(old); list.append(term, value); block.replaceWith(list);
      }
    }
    if (!changed.length || status !== "changed") return;
    const section = h("section", "cx-compare-record-changes"), heading = h("h3"), list = h("dl", "cx-dl");
    setText(heading, this.labels.compareChanges); section.append(heading, list); section.setAttribute("aria-label", this.labels.compareChanges);
    for (const column of changed) {
      const term = h("dt"), value = h("dd"); setText(term, column.title);
      term.dataset.cxField = value.dataset.cxField = column.id;
      this.paintDrawerValue(column, row, value, { signal: paints.signal }); list.append(term, value);
      for (const field of body.querySelectorAll('[data-cx-field="' + CSS.escape(column.id) + '"]')) {
        const block = field.closest(".cx-record-block"); if (block) block.remove(); else field.remove();
      }
    }
    body.prepend(section);
  });
});

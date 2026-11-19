  // ---------- group footer rows: a fixed grouping's footerTemplate after each group ----------
  // The first cell shows the template's plain text ({column}, {value}, {count}), the other cells the group's aggregates under
  // their columns, and aggregates of columns out of view follow the text. Markup in the template is never interpreted.
  Object.assign(DataGrid.prototype, {
    fillGroupFooter(element, row) {
      const group = row.group, grouping = this.view.reporting.grouping, levels = this.groupLevels;
      disposeRowHostCells(element); this.releaseDetailRow(element); this.observeDetail(element, false);
      element.textContent = ""; element._w = row; element._kind = "group-footer"; element._layout = this.layout;
      element._attrs = {}; element._cls = null; element.className = "cx-row cx-grid-group cx-grid-group-footer";
      element.setAttribute("role", "row"); element.removeAttribute("data-cx-id"); element.removeAttribute("data-cx-status");
      element.removeAttribute("aria-selected"); element.removeAttribute("aria-busy"); element.removeAttribute("aria-expanded");
      element.dataset.cxGroupFooter = group.key; element.removeAttribute("data-cx-group"); element.dataset.cxLevel = String(row.level);
      if (this.groupTree) element.setAttribute("aria-level", String(row.level + 1)); else element.removeAttribute("aria-level");
      element.style.height = this.rowH + "px"; element.style.width = this.rowWidth + "px"; element.style.setProperty("--cx-group-level", String(row.level - 1));
      const groupColumn = this.columns.find(item => item.id === levels[row.level - 1].column), bucket = levels[row.level - 1].bucket;
      const value = group.value === null ? this.labels.gridGroupMissing : bucket ? GRID_BUCKETS.label(bucket, group.value, this.lang) : cellText(group.value, groupColumn, this.fmt);
      const label = fill(grouping.footerTemplate, { column: groupColumn.title, value, count: numberFormat(this.lang).format(group.count) }), cells = [];
      this.cols.forEach((column, index) => {
        const cell = this.cell(element, index, column.width, column.kind); cells.push({ cell, content: cell });
        if (index === 0) {
          const text = h("span", "cx-grid-group-footer-text"); setText(text, label); cell.appendChild(text); cell.title = label;
          this.paintHiddenAggregates(text, group.aggregates, cell, column.id, label);
          return;
        }
        const aggregates = (this.view.reporting.aggregates || []).filter(item => item.column === column.id);
        if (aggregates.length) this.paintAggregates(cell, column, aggregates, group.aggregates);
      });
      element._cells = cells;
      quietControls(element);
    }
  });

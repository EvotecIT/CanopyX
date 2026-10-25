  // ---------- group headings, the totals row and selecting a group ----------
  // A heading shows its expander, value and full-group record count in the first cell, the group's aggregates under their
  // columns and host display cells (the worst state, for example) under theirs. With more than one level the grid is a
  // treegrid: rows carry aria-level and headings aria-expanded. One level keeps the flat-grid contract, with the expander's
  // aria-expanded. The totals row under the grid shows the complete query's aggregates.
  const GROUP_ROW_BASE = DataGrid.prototype.fillRow;
  Object.assign(DataGrid.prototype, {
    syncGroupAria() {
      const tree = (this.groupLevels?.length || 0) > 1;
      if (tree === !!this.groupTree) return;
      this.groupTree = tree; this.grid.setAttribute("role", tree ? "treegrid" : "grid"); this.version++;
    },
    fillRow(element, row) {
      if (!row.group) {
        element.removeAttribute("data-cx-group"); element.removeAttribute("data-cx-level");
        GROUP_ROW_BASE.call(this, element, row);
        if (this.groupTree) element.setAttribute("aria-level", String(this.groupLevels.length + (row.status === "detail" ? 2 : 1)));
        else element.removeAttribute("aria-level");
        return;
      }
      const group = row.group, level = row.level, collapsed = this.collapsedGroups.has(group.key), levels = this.groupLevels;
      // Repaint content on refresh, retaining the controls of this heading so mouse-down and mouse-up reach the same node.
      const previous = element._kind === "group" && element._w === row && element._layout === this.layout ? element._cells : null;
      disposeRowHostCells(element); this.releaseDetailRow(element); this.observeDetail(element, false);
      const groupColumn = this.columns.find(item => item.id === levels[level - 1].column);
      if (!previous) element.textContent = "";
      element._w = row; element._kind = "group"; element._layout = this.layout;
      element._attrs = {}; element._cls = null; element.className = "cx-row cx-grid-group";
      element.setAttribute("role", "row"); element.removeAttribute("data-cx-id"); element.removeAttribute("data-cx-status");
      element.removeAttribute("aria-selected"); element.removeAttribute("aria-busy"); element.dataset.cxGroup = group.key; element.dataset.cxLevel = String(level);
      if (this.groupTree) { element.setAttribute("aria-level", String(level)); element.setAttribute("aria-expanded", String(!collapsed)); }
      else { element.removeAttribute("aria-level"); element.removeAttribute("aria-expanded"); }
      element.style.height = this.rowH + "px"; element.style.width = this.rowWidth + "px"; element.style.setProperty("--cx-group-level", String(level - 1));
      const priorButton = previous?.[0].cell.querySelector(".cx-grid-group-toggle"), button = priorButton || h("button", "cx-grid-group-toggle");
      if (!priorButton) { button.type = "button"; button.tabIndex = -1; }
      if (button.disabled !== !!this.pendingQuery) button.disabled = !!this.pendingQuery;
      button.setAttribute("aria-expanded", String(!collapsed));
      button.setAttribute("aria-label", collapsed ? this.labels.gridGroupExpand : this.labels.gridGroupCollapse);
      if (button.textContent !== (collapsed ? "▸" : "▾")) setText(button, collapsed ? "▸" : "▾");
      if (!priorButton) button.addEventListener("click", () => {
        if (this.pendingQuery) return;
        try { this.setFocus(row, false); this.setGroupCollapsed(group.key, !this.collapsedGroups.has(group.key)); this.setFocus(this.focused, true); }
        catch (error) { this.emit("error", { error }); }
      });
      const bucket = levels[level - 1].bucket;
      const value = group.value === null ? this.labels.gridGroupMissing : bucket ? GRID_BUCKETS.label(bucket, group.value, this.lang) : cellText(group.value, groupColumn, this.fmt), count = numberFormat(this.lang).format(group.count);
      const label = fill(this.view.reporting?.grouping?.headerTemplate || this.labels.gridGroupHeading, { column: groupColumn.title, value, count }), cells = [];
      this.cols.forEach((column, index) => {
        const cell = previous?.[index].cell || this.cell(element, index, column.width, column.kind); cells.push({ cell, content: cell });
        if (index === 0) {
          const priorHeading = cell.querySelector(".cx-grid-group-label"), heading = priorHeading || h("span", "cx-grid-group-label");
          const text = heading.querySelector(".cx-grid-group-text") || h("span", "cx-grid-group-text"), badge = heading.querySelector(".cx-grid-group-count") || h("span", "cx-grid-group-count");
          text.replaceChildren();
          if (levels.length > 1 && !this.view.reporting?.grouping?.headerTemplate) { const name = h("span", "cx-grid-group-column"); setText(name, groupColumn.title); text.append(name, document.createTextNode(" ")); }
          text.appendChild(document.createTextNode(this.view.reporting?.grouping?.headerTemplate ? label : value)); setText(badge, count);
          badge.hidden = !!this.view.reporting?.grouping?.headerTemplate;
          if (!priorHeading) heading.append(text, badge);
          if (!priorButton) cell.append(button);
          this.paintGroupSelection(cell, group); if (!priorHeading) cell.append(heading); cell.title = label;
          this.paintHiddenAggregates(heading, group.aggregates, cell, column.id, label);
          return;
        }
        const aggregates = (this.view.reporting.aggregates || []).filter(item => item.column === column.id);
        if (aggregates.length) this.paintAggregates(cell, column, aggregates, group.aggregates);
        else {
          cell.replaceChildren();
          if (Object.hasOwn(group.cells || {}, column.id)) {
            const options = column.presenter || this.view.reporting.presenters?.[column.id];
            if (options) gridCellRenderer(this, column, options)({ id: group.key, cells: group.cells }, cell);
            else setText(cell, cellText(group.cells[column.id], column, this.fmt));
          }
        }
      });
      // The heading runs on over the empty cells after the first, up to the first cell that shows something.
      let room = this.cols[0].renderWidth ?? this.cols[0].width;
      for (let index = 1; index < cells.length && !cells[index].cell.textContent; index++) room += this.cols[index].renderWidth ?? this.cols[index].width;
      const heading = cells[0].cell.querySelector(".cx-grid-group-label");
      heading.style.maxWidth = Math.max(40, room - 44 - (level - 1) * 16 - (this.view.reporting.selectionControls && this.multi ? 22 : 0)) + "px";
      element._cells = cells;
      quietControls(element);
      this.paintGridHighlights(element, row);
    },
    // With selection controls a heading selects or clears its group's records, up to the 10,000 a range may hold.
    paintGroupSelection(cell, group) {
      if (!this.view.reporting.selectionControls || !this.multi) return;
      const previous = cell.querySelector(".cx-grid-group-select"), check = previous || h("input", "cx-grid-row-select cx-grid-group-select");
      if (!previous) { check.type = "checkbox"; check.tabIndex = -1; }
      const state = this.groupSelection(group);
      check.checked = state === true; check.indeterminate = state === "mixed"; check.disabled = !!this.pendingQuery;
      check.setAttribute("aria-label", fill(this.labels.gridSelectGroup, { group: group.value === null ? this.labels.gridGroupMissing : String(group.value) }));
      if (!previous) check.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        this.runReportingSelection(() => this.selectRange(group.offset, group.offset + group.count - 1, { selected: this.groupSelection(group) !== true, additive: true }));
      });
      if (!previous) cell.appendChild(check);
    },
    // true when every record of the group is selected, "mixed" when some are, false otherwise; records that are not loaded count
    // as unselected in an explicit selection, so a partly loaded group reads mixed rather than selected.
    groupSelection(group) {
      let selected = 0, loaded = 0;
      for (const [ordinal, record] of this.rowCache) {
        if (ordinal < group.offset || ordinal >= group.offset + group.count) continue;
        loaded++; if (this.reportingRowSelected(record)) selected++;
      }
      if (this.querySelection) return selected === loaded ? true : selected ? "mixed" : false;
      return selected && selected === group.count ? true : selected ? "mixed" : false;
    },
    // Aggregates of columns out of view (hidden, or left out on a phone) follow the first cell, so none is lost.
    paintHiddenAggregates(target, values, cell = target, headingColumn = null, title = this.labels.gridSummary || this.view.label) {
      const shown = new Set(this.cols.filter(column => column.id !== headingColumn).map(column => column.id)), parts = [], details = [];
      for (const column of this.columns) {
        const aggregates = shown.has(column.id) ? [] : (this.view.reporting.aggregates || []).filter(item => item.column === column.id);
        if (aggregates.length) {
          const formatted = reportingAggregateParts(this, column, aggregates, values);
          if (formatted.text) { parts.push(column.title + " " + formatted.text); details.push(column.title + "\n" + formatted.title); }
        }
      }
      const previous = target.querySelector(":scope > .cx-hidden-aggregates");
      if (!parts.length) { previous?.remove(); return; }
      const extra = previous || h("button", "cx-grid-group-aggregates cx-hidden-aggregates"); if (!previous) extra.type = "button";
      extra.setAttribute("aria-haspopup", "dialog"); if (extra.textContent !== parts.join(" · ")) setText(extra, parts.join(" · "));
      extra._cxAggregateText = { title, text: details.join("\n") }; extra.title = details.join("\n");
      extra.setAttribute("aria-label", details.join(", "));
      if (!previous) { target.appendChild(extra); extra.addEventListener("click", event => {
        event.stopPropagation(); this.showReportingText({ title: extra._cxAggregateText.title }, extra._cxAggregateText.text, extra);
      });
      }
      cell.title = (cell.title ? cell.title + " · " : "") + parts.join(" · ");
    },
    syncSummaryControls() {
      if (this.statusBar && this.statusGroupSummary !== this.summary) {
        this.statusGroupSummary = this.summary; this.statusGroups ??= h("span"); this.statusCount.after(this.statusGroups);
        this.statusGroups.hidden = !this.summary?.groups.length;
        if (this.summary) setText(this.statusGroups, fill(this.labels.gridGroupCount, { count: numberFormat(this.lang).format(this.summary.groups.length) }));
      }
      if (!this.summaryControls) return;
      this.summaryControls.hidden = !this.summary;
      if (!this.summary) return;
      if (this.summaryControls.parentElement !== this.grid) this.grid.appendChild(this.summaryControls);
      const count = this.rowProjection ? this.rowProjection.rowCount() : this.rowCount(); this.grid.setAttribute("aria-rowcount", String(count + 2 + (this.headDepth || 0)));
      const key = [this.summary, count, this.layout, this.rowWidth, this.lang, ...this.cols.map(column => column.renderWidth + ":" + column.effectivePin)];
      if (this.summaryRenderKey?.every((value, index) => value === key[index])) return;
      this.summaryRenderKey = key; this.summaryControls.replaceChildren();
      const row = h("div", "cx-summary-row"); row.setAttribute("role", "row"); row.setAttribute("aria-rowindex", String(count + 2 + (this.headDepth || 0))); row.style.width = this.rowWidth + "px";
      this.cols.forEach((column, index) => {
        const cell = this.newCell(index, column.width, column.kind); cell.setAttribute("role", "gridcell"); cell.style.width = column.renderWidth + "px";
        const aggregates = this.view.reporting.aggregates.filter(item => item.column === column.id);
        if (aggregates.length) this.paintAggregates(cell, column, aggregates, this.summary.aggregates);
        else if (index === 0) { setText(cell, this.labels.gridSummary); cell.classList.add("cx-summary-caption"); }
        if (index === 0) this.paintHiddenAggregates(cell, this.summary.aggregates);
        row.appendChild(cell);
      });
      this.summaryControls.appendChild(row);
    }
  });

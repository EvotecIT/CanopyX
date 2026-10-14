  // ---------- flat-grid headings, summaries and keyboard traversal over projected rows ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridGroupHeading: "{column}: {value} ({count} records)", gridGroupMissing: "Missing value",
    gridGroupExpand: "Expand group", gridGroupCollapse: "Collapse group", gridSummary: "Query totals",
    gridGroupOrder: "Group order is fixed by this report"
  }));
  const GROUP_BASE = {}, GROUP_API = GRID_REPORTING.api;
  for (const name of ["buildGridControls", "buildHeader", "fillRow", "setFocus", "onKey", "setQuery", "applyWidths"]) GROUP_BASE[name] = DataGrid.prototype[name];
  GRID_REPORTING.api = (api, grid) => {
    GROUP_API?.(api, grid);
    if (reportingSummaryEnabled(grid.view)) api.getSummary = () => grid.summary || null;
    if (grid.view.reporting?.grouping) {
      api.setGroupCollapsed = grid.setGroupCollapsed.bind(grid);
      api.getCollapsedGroups = () => [...(grid.collapsedGroups || [])];
    }
  };
  Object.assign(DataGrid.prototype, {
    buildHeader() {
      GROUP_BASE.buildHeader.call(this);
      const column = this.view.reporting?.grouping?.column;
      const header = this.headCells.find(cell => cell.getAttribute("data-cx-column") === column), button = header?.querySelector(".cx-sort");
      if (button) { button.disabled = true; button.title = this.labels.gridGroupOrder; }
    },
    buildGridControls() {
      GROUP_BASE.buildGridControls.call(this);
      const grouping = this.view.reporting?.grouping;
      if (grouping) {
        this.groupBar = h("div", "cx-groupbar"); const chip = h("span", "cx-gchip");
        setText(chip, this.columns.find(column => column.id === grouping.column).title);
        this.groupBar.append(document.createTextNode(this.labels.gridGroupedBy + " "), chip);
        if (typeof this.opts.onUngroup === "function") {
          const remove = gridDecorateButton(gridButton("", () => this.runGridHook(signal => this.opts.onUngroup({ query: this.getQuery(), signal }), this.dataLifetime.signal)
            .catch(error => this.emit("error", { error }))), "close", true);
          remove.setAttribute("aria-label", this.labels.gridRemoveGrouping); chip.appendChild(remove);
        }
      }
      if (!this.view.reporting?.aggregates?.length) return;
      this.summaryControls = h("div", "cx-grid-summary"); this.summaryControls.setAttribute("role", "rowgroup");
      this.summaryControls.setAttribute("aria-label", this.labels.gridSummary); this.toolbar.appendChild(this.summaryControls);
    },
    syncSummaryControls() {
      if(this.statusBar&&this.summary&&this.statusGroupSummary!==this.summary){
        this.statusGroupSummary=this.summary;this.statusGroups??=h("span");this.statusCount.after(this.statusGroups);
        this.statusGroups.hidden=!this.summary.groups.length;setText(this.statusGroups,fill(this.labels.gridGroupCount,{count:numberFormat(this.lang).format(this.summary.groups.length)}));
      }
      if (!this.summaryControls || !this.summary) return;
      if(this.summaryControls.parentElement!==this.grid)this.grid.appendChild(this.summaryControls);
      const count=this.rowProjection?this.rowProjection.rowCount():this.rowCount();this.grid.setAttribute("aria-rowcount",String(count+2));
      const key=[this.summary,count,this.layout,this.rowWidth,...this.cols.map(column=>column.renderWidth+":"+column.effectivePin)];
      if(this.summaryRenderKey?.every((value,index)=>value===key[index]))return;this.summaryRenderKey=key;
      this.summaryControls.replaceChildren();const row=h("div","cx-summary-row");row.setAttribute("role","row");row.setAttribute("aria-rowindex",String(count+2));row.style.width=this.rowWidth+"px";
      const cells=this.cols.map((column,index)=>{const cell=this.newCell(index,column.width,column.kind);cell.setAttribute("role","gridcell");cell.style.width=column.renderWidth+"px";
        const aggregates=this.view.reporting.aggregates.filter(item=>item.column===column.id);
        if(aggregates.length)this.paintAggregates(cell,aggregates,this.summary.aggregates);else if(index===0)setText(cell,this.labels.gridSummary);row.appendChild(cell);return cell;});
      this.spanAggregates(cells);this.summaryControls.appendChild(row);
    },
    /** Labelled aggregate values in the aggregate format, else the column format; counts are whole numbers. */
    paintAggregates(cell, aggregates, values) {
      const names = [], list = cell.appendChild(h("span", "cx-aggregate-list"));
      cell.classList.add("cx-aggregate-cell");
      aggregates.forEach((aggregate, index) => {
        const column = this.columns.find(item => item.id === aggregate.column), value = values[aggregate.id];
        const text = value === null ? "—" : numberText(value, this.lang, aggregate.format || (aggregate.operation === "count" ? null : column.format));
        const item = h("span", "cx-aggregate"), label = h("span", "cx-aggregate-label"), amount = h("span", "cx-aggregate-value");
        setText(label, aggregate.label); setText(amount, text); item.append(label, " ", amount);
        list.append(...(index ? [" ", item] : [item])); names.push(aggregate.label + ": " + (value === null ? this.labels.gridNoData : text));
      });
      cell.title = names.join("\n"); cell.setAttribute("aria-label", names.join(", "));
    },
    /** Number aggregates may extend over empty cells before them with the same pinning, as spreadsheet text does. */
    spanAggregates(cells) {
      cells.forEach((cell, index) => {
        if (!cell?.classList.contains("cx-aggregate-cell") || this.cols[index]?.kind !== "number") return;
        let spare = 0;
        for (let left = index - 1; left > 0 && cells[left] && !cells[left].firstChild && this.cols[left].effectivePin === this.cols[index].effectivePin; left--)
          spare += this.cols[left].renderWidth;
        cell.style.setProperty("--cx-aggregate-spare", spare + "px");
      });
    },
    applyWidths(...widths) {
      const result = GROUP_BASE.applyWidths.apply(this, widths);
      for (const row of this.canvas?.querySelectorAll(".cx-grid-group") || []) this.spanAggregates((row._cells || []).map(slot => slot.cell));
      return result;
    },
    fillRow(element, row) {
      if (!row.group) { element.removeAttribute("data-cx-group"); return GROUP_BASE.fillRow.call(this, element, row); }
      this.observeDetail(element, false);
      element.textContent = ""; element._w = row; element._kind = "group"; element._layout = this.layout;
      element._attrs = {}; element._cls = null; element.className = "cx-row cx-grid-group";
      element.setAttribute("role", "row"); element.removeAttribute("data-cx-id"); element.removeAttribute("data-cx-status");
      element.removeAttribute("aria-selected"); element.removeAttribute("aria-busy"); element.dataset.cxGroup = row.group.key;
      element.style.height = this.rowH + "px"; element.style.width = this.rowWidth + "px";
      const button=h("button","cx-grid-group-toggle");button.type="button";button.tabIndex=-1;const collapsed=this.collapsedGroups.has(row.group.key);
      button.disabled=!!this.pendingQuery;button.setAttribute("aria-expanded",String(!collapsed));button.setAttribute("aria-label",collapsed?this.labels.gridGroupExpand:this.labels.gridGroupCollapse);setText(button,collapsed?"▸":"▾");
      button.addEventListener("click",()=>{if(!this.pendingQuery){this.setFocus(row,false);this.setGroupCollapsed(row.group.key,!this.collapsedGroups.has(row.group.key));this.setFocus(this.focused,true);}});
      const groupColumn=this.columns.find(item=>item.id===this.view.reporting.grouping.column),label=fill(this.labels.gridGroupHeading,{column:groupColumn.title,value:row.group.value===null?this.labels.gridGroupMissing:formatValue(row.group.value,groupColumn.kind,this.fmt,groupColumn.format),count:numberFormat(this.lang).format(row.group.count)}),cells=[];
      this.cols.forEach((column,index)=>{const cell=this.cell(element,index,column.width,column.kind);cells.push({cell,content:cell});
        if(index===0){const text=h("span","cx-grid-group-text"),count=h("span","cx-grid-group-count");setText(text,row.group.value===null?this.labels.gridGroupMissing:formatValue(row.group.value,groupColumn.kind,this.fmt,groupColumn.format));setText(count,numberFormat(this.lang).format(row.group.count));cell.append(button,text,count);cell.title=label;}
        else {const aggregates=(this.view.reporting.aggregates||[]).filter(item=>item.column===column.id);
          if(!aggregates.length&&Object.hasOwn(row.group.cells||{},column.id)){
            const options=column.presenter||this.view.reporting.presenters?.[column.id];
            if(options)gridCellRenderer(this,column,options)({id:row.group.key,cells:row.group.cells},cell);
            else setText(cell,cellText(row.group.cells[column.id],column,this.fmt));
          }else if(aggregates.length)this.paintAggregates(cell,aggregates,row.group.aggregates);}
      });
      element._cells = cells; this.spanAggregates(cells.map(slot => slot.cell));
      this.paintGridHighlights(element, row);
    },
    setQuery(input, paging) {
      const pending = GROUP_BASE.setQuery.call(this, input, paging);
      const sync = () => { if (!this.destroyed) for (const button of this.canvas.querySelectorAll(".cx-grid-group-toggle")) button.disabled = !!this.pendingQuery; };
      sync(); pending.then(sync, sync); return pending;
    },
    setFocus(row, focus) {
      if (!this.rowProjection) return GROUP_BASE.setFocus.call(this, row, focus);
      if (row && !row.group && !this.pendingQuery) {
        const group = this.summary?.groups.find(group => row._ri >= group.offset && row._ri < group.offset + group.count);
        if (group && this.collapsedGroups?.has(group.key)) this.setGroupCollapsed(group.key, false);
      }
      const index = this.rowProjection.indexOf(row); if (index < 0 || this.destroyed) return;
      this.pendingNavigation = null; this.focused = row;
      this.revealGridRow(row, index, this.rowProjection);
      if (this.render()) { this.revealGridRow(row, index, this.rowProjection); this.render(); }
      if (focus) this.rendered.get(this.focused)?.focus({ preventScroll: true });
    },
    onKey(event) {
      const row = event.target.closest(".cx-row")?._w;
      if (!row || !this.rowProjection || event.defaultPrevented || event.isComposing || event.altKey || event.target.matches(OWN_ARROWS))
        return GROUP_BASE.onKey.call(this, event);
      const navigation = this.pendingNavigation;
      if (navigation?.focus && navigation.epoch === this.queryEpoch && this.focused === row)
        return GROUP_BASE.onKey.call(this, event);
      if (this.pendingQuery && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
        event.preventDefault(); return;
      }
      if (row.group && ["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
        if (event.target.closest("button") && ["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        if (this.pendingQuery) return;
        this.setGroupCollapsed(row.group.key, event.key === "ArrowLeft" ? true : event.key === "ArrowRight" ? false : !this.collapsedGroups.has(row.group.key));
        this.setFocus(this.focused, true); return;
      }
      if (row.group && ["Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.ctrlKey || event.metaKey) this.focusResult(event.key === "Home" ? 0 : this.rowCount() - 1, true)
          .catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
        else this.setFocus(row, true);
        return;
      }
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) return GROUP_BASE.onKey.call(this, event);
      const step = event.key.startsWith("Page") ? Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)) : 1;
      const direction = /Up$/.test(event.key) ? -1 : 1, proposed = this.autoRows && event.key.startsWith("Page") ?
        this.gridPageStep(row, direction, this.rowProjection) : this.rowProjection.indexOf(row) + direction * step;
      const cells = this.rowCells(this.rendered.get(row)), column = cells.findIndex(cell => cell.contains(event.target));
      event.preventDefault(); event.stopPropagation();
      if (this.paged && (proposed < 0 || proposed >= this.rowProjection.rowCount())) {
        const bounds = this.rowBounds();
        if (row.group && (direction < 0 && bounds.first === 0 || direction > 0 && bounds.last === this.rowCount() - 1)) {
          this.setFocus(this.rowProjection.rowItem(Math.max(0, Math.min(this.rowProjection.rowCount() - 1, proposed))), true); return;
        }
        const ordinal = row.group ? (direction < 0 ? bounds.first - step : bounds.last + step) : row._ri + direction * step;
        this.focusResult(Math.max(0, Math.min(this.rowCount() - 1, ordinal)), true, column, null)
          .catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
        return;
      }
      const index = Math.max(0, Math.min(this.rowProjection.rowCount() - 1, proposed)), target = this.rowProjection.rowItem(index);
      if (target?.group) this.setFocus(target, true);
      else if (target) this.focusResult(target._ri, true, column, null).catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
    }
  });

  // ---------- the group-by bar, column menu entries and the totals row ----------
  // A fixed grouping shows one chip, with the host's optional removal. A grid grouped at runtime shows a chip per level, in
  // order: the column, the order of its groups (direction, and value or an aggregate) and removal, then Expand all and
  // Collapse all. Chips move with Alt+Left/Right or by dragging; a column header dragged onto the bar (with column reorder)
  // adds a level. Column menus offer Group by and Stop grouping; sorting a grouped column turns its groups around.
  const GROUP_CONTROL_BASE = {};
  for (const name of ["buildHeader", "querySortHeader"]) GROUP_CONTROL_BASE[name] = DataGrid.prototype[name];
  Object.assign(DataGrid.prototype, {
    attachGroupControls() {
      const reporting = this.view.reporting || {};
      this.groupingDynamic = reportingDynamicGroups(this.view);
      if (reporting.grouping || this.groupingDynamic) {
        this.groupBar = h("div", "cx-groupbar"); this.groupBar.setAttribute("role", "group"); this.groupBar.setAttribute("aria-label", this.labels.gridGroupedBy);
        this.groupBar.hidden = this.opts.toolbar === false; this.notice.before(this.groupBar);
      }
      if (reporting.aggregates?.length) {
        this.summaryControls = h("div", "cx-grid-summary"); this.summaryControls.setAttribute("role", "rowgroup");
        this.summaryControls.setAttribute("aria-label", this.labels.gridSummary); this.summaryControls.hidden = true;
      }
      this.syncGroupBar(); this.buildHeader();
    },
    buildHeader() {
      GROUP_CONTROL_BASE.buildHeader.call(this);
      const column = this.view.reporting?.grouping?.column;
      const header = column && this.headCells.find(cell => cell.getAttribute("data-cx-column") === column), button = header?.querySelector(".cx-sort");
      if (button) { button.disabled = true; button.title = this.labels.gridGroupOrder; }
    },
    groupLevelsNow() { return this.view.reporting.grouping ? [this.view.reporting.grouping] : this.queryForChange().groupBy || []; },
    // Sorting a grouped column turns its groups around: its header toggles the level, its menu sorts through the query.
    querySortHeader(id, event) {
      const levels = this.groupingDynamic && this.groupLevelsNow();
      if (!levels || !levels.some(level => level.column === id)) return GROUP_CONTROL_BASE.querySortHeader.call(this, id, event);
      this.setGroupBy(levels.map(level => level.column === id ? { ...level, direction: level.direction === "asc" ? "desc" : "asc" } : level)).catch(() => {});
    },
    // Contribute actions before the shared menu initializes its keyboard model.
    appendColumnGroupActions(column, add, separator) {
      if (!this.groupingDynamic || !column.sortable) return;
      const id = column.id, levels = this.groupLevelsNow(), grouped = levels.some(level => level.column === id);
      if (!grouped && !this.view.reporting?.groupable) return;
      separator();
      add(grouped ? this.labels.gridUngroup : this.labels.gridGroupBy, () => {
        const latest = this.groupLevelsNow(), present = latest.some(level => level.column === id);
        if (this.destroyed || !this.groupingDynamic || !this.columns.some(item => item.id === id && item.sortable) ||
            grouped !== present || !grouped && (!this.view.reporting?.groupable || latest.length >= 4)) return;
        return this.setGroupBy(grouped ? latest.filter(level => level.column !== id) : [...latest, { column: id, direction: "asc" }]);
      }, !grouped && levels.length >= 4);
    },
    // A column dragged onto the bar becomes the innermost level.
    groupDrop(column) {
      const levels = this.groupingDynamic && this.groupLevelsNow();
      if (!levels || !this.view.reporting?.groupable || !column.sortable || levels.length >= 4 || levels.some(level => level.column === column.id)) return false;
      this.setGroupBy([...levels, { column: column.id, direction: "asc" }]).catch(error => this.emit("error", { error }));
      return true;
    },
    syncGroupBar() {
      const bar = this.groupBar;
      if (!bar) return;
      const levels = this.groupLevelsNow(), levelsKey = JSON.stringify(levels), key = JSON.stringify([levels, this.groupCollapseVersion || 0]);
      // Query intent, acceptance and failure settlement all sync here. Only grouping changes retire a column menu.
      if (bar._levelsKey !== undefined && bar._levelsKey !== levelsKey && this.gridPopover?.panel.classList.contains("cx-column-menu"))
        this.closeGridPopover(false);
      bar._levelsKey = levelsKey;
      if (bar._key === key && bar._summary === this.summary) return;
      // Rebuilding keeps keyboard focus on the same control of the same chip (or the chip a level moved to).
      const active = bar.contains(document.activeElement) ? document.activeElement : null, chip = active?.closest(".cx-gchip");
      const place = this.groupChipFocus || active && { level: chip ? Number(chip.dataset.cxLevel) : 0,
        control: [...(chip || bar).querySelectorAll("button,select")].indexOf(active) };
      this.groupChipFocus = null;
      bar._key = key; bar._summary = this.summary; bar.replaceChildren();
      if (place) queueMicrotask(() => {
        const scope = place.level ? bar.querySelector('.cx-gchip[data-cx-level="' + place.level + '"]') : bar;
        const controls = [...(scope || bar).querySelectorAll("button,select")];
        (controls[Math.max(0, Math.min(controls.length - 1, place.control))] || bar.querySelector("button,select"))?.focus();
      });
      const lead = h("span", "cx-groupbar-label"); setText(lead, this.labels.gridGroupedBy); bar.appendChild(lead);
      if (this.view.reporting.grouping) {
        const chip = h("span", "cx-gchip"); setText(chip, this.columns.find(column => column.id === levels[0].column).title);
        if (typeof this.opts.onUngroup === "function") {
          const remove = gridDecorateButton(gridButton("", () => this.runGridHook(signal => this.opts.onUngroup({ query: this.getQuery(), signal }), this.dataLifetime.signal)
            .catch(error => this.emit("error", { error }))), "close", true);
          remove.setAttribute("aria-label", this.labels.gridRemoveGrouping); chip.appendChild(remove);
        }
        bar.appendChild(chip); return;
      }
      if (!levels.length) { const hint = h("span", "cx-groupbar-hint"); setText(hint, this.labels.gridGroupDrop); bar.appendChild(hint); return; }
      levels.forEach((level, index) => {
        if (index) { const next = h("span", "cx-groupbar-next"); next.setAttribute("aria-hidden", "true"); setText(next, "›"); bar.appendChild(next); }
        bar.appendChild(this.groupChip(levels, level, index));
      });
      const spacer = h("span", "cx-groupbar-spacer"); bar.appendChild(spacer);
      const busy = !this.summary;
      for (const [label, collapsed] of [[this.labels.gridExpandAll, false], [this.labels.gridCollapseAll, true]]) {
        const button = gridButton(label, () => { if (!this.pendingQuery) this.setGroupLevelCollapsed(0, collapsed); }); button.classList.add("cx-groupbar-all"); button.disabled = busy; bar.appendChild(button);
      }
    },
    groupChip(levels, level, index) {
      const column = this.columns.find(item => item.id === level.column), chip = h("span", "cx-gchip"), name = h("span", "cx-gchip-name");
      const change = next => this.setGroupBy(next).catch(error => this.emit("error", { error }));
      chip.dataset.cxLevel = String(index + 1); chip.title = this.labels.gridGroupMove; setText(name, column.title); chip.appendChild(name);
      const descending = level.direction === "desc", direction = gridDecorateButton(gridButton("", () =>
        change(levels.map(item => item === level ? { ...item, direction: descending ? "asc" : "desc" } : item))), descending ? "down" : "up", true);
      direction.classList.add("cx-gchip-direction"); direction.setAttribute("aria-label", column.title + ": " + (descending ? this.labels.gridSortAscending : this.labels.gridSortDescending));
      direction.setAttribute("aria-pressed", String(descending)); chip.appendChild(direction);
      const aggregates = this.view.reporting.aggregates || [];
      if (aggregates.length) {
        const order = h("select", "cx-gchip-order"); order.setAttribute("aria-label", column.title + ": " + this.labels.gridGroupSortBy);
        const option = (value, text) => { const item = h("option"); item.value = value; setText(item, text); order.appendChild(item); };
        option("", this.labels.gridGroupSortValue); aggregates.forEach(item => option(item.id, fill(this.labels.gridGroupSortAggregate, { aggregate: item.label })));
        order.value = level.aggregate || "";
        order.addEventListener("change", () => change(levels.map(item => {
          if (item !== level) return item;
          const { aggregate, ...rest } = item; return order.value ? { ...rest, aggregate: order.value } : rest;
        })));
        chip.appendChild(order);
      }
      const keys = this.groupKeys(index + 1), allCollapsed = keys.length > 0 && keys.every(key => this.collapsedGroups.has(key));
      const fold = gridButton(allCollapsed ? "+" : "−", () => { if (!this.pendingQuery) this.setGroupLevelCollapsed(index + 1, !allCollapsed); });
      fold.classList.add("cx-gchip-fold"); fold.disabled = !keys.length;
      fold.setAttribute("aria-label", fill(allCollapsed ? this.labels.gridExpandLevel : this.labels.gridCollapseLevel, { level: index + 1 })); fold.title = fold.getAttribute("aria-label");
      chip.appendChild(fold);
      const remove = gridDecorateButton(gridButton("", () => change(levels.filter(item => item !== level))), "close", true);
      remove.setAttribute("aria-label", column.title + ": " + this.labels.gridUngroup); chip.appendChild(remove);
      // Alt+Left and Alt+Right move a level; focus stays on the moved chip.
      chip.addEventListener("keydown", event => {
        if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        const target = index + (event.key === "ArrowLeft" ? -1 : 1);
        if (target < 0 || target >= levels.length) return;
        event.preventDefault(); const next = levels.slice(); next.splice(target, 0, next.splice(index, 1)[0]);
        this.groupChipFocus = { level: target + 1, control: [...chip.querySelectorAll("button,select")].indexOf(event.target) };
        change(next);
      });
      name.addEventListener("pointerdown", event => this.dragGroupChip(event, levels, index, chip));
      return chip;
    },
    // Pointer reordering of chips: the chip follows the pointer as a label and drops before or after the chip under it.
    dragGroupChip(event, levels, index, chip) {
      if (event.button !== 0 || this.pendingQuery) return;
      event.preventDefault();
      const pointer = event.pointerId, startX = event.clientX; let ghost = null, target = index;
      const chips = [...this.groupBar.querySelectorAll(".cx-gchip")];
      const move = ev => {
        if (ev.pointerId !== pointer || !ghost && Math.abs(ev.clientX - startX) < 5) return;
        if (!ghost) { ghost = h("div", "cx-column-drag"); ghost.setAttribute("aria-hidden", "true"); setText(ghost, chip.querySelector(".cx-gchip-name").textContent); document.body.appendChild(ghost); }
        ghost.style.left = ev.clientX + 12 + "px"; ghost.style.top = ev.clientY + 12 + "px";
        const before = chips.filter(item => { const box = item.getBoundingClientRect(); return ev.clientX > box.left + box.width / 2; }).length;
        target = before > index ? before - 1 : before;
      };
      const stop = ev => {
        if (ev && ev.pointerId !== undefined && ev.pointerId !== pointer) return;
        this.dragGroupChipEnd?.();
        const dropped = ghost && ev?.type === "pointerup"; ghost?.remove();
        if (dropped && target !== index) { const next = levels.slice(); next.splice(target, 0, next.splice(index, 1)[0]); this.setGroupBy(next).catch(error => this.emit("error", { error })); }
      };
      const cancel = ev => { if (ev.pointerId === pointer) { ghost?.remove(); ghost = null; stop(); } };
      const drag = new AbortController(), listen = { signal: AbortSignal.any([drag.signal, this.lifetime.signal]) };
      global.addEventListener("pointermove", move, listen); global.addEventListener("pointerup", stop, listen); global.addEventListener("pointercancel", cancel, listen);
      this.lifetime.signal.addEventListener("abort", () => ghost?.remove(), { once: true, signal: drag.signal });
      this.dragGroupChipEnd = () => drag.abort();
    }
  });

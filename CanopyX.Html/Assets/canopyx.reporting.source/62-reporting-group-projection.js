  // ---------- sparse display projection: group headings never become record ordinals ----------
  const GROUP_TRIM = DataGrid.prototype.trimInactiveCache;
  Object.assign(DataGrid.prototype, {
    renderPass() { return ROW_VIEWPORT.renderPass.call(this, this.rowProjection || this); },
    trimInactiveCache() {
      if (this.rowProjection) this.window = this.rowProjection.recordWindow(this.window.first, this.window.last);
      return GROUP_TRIM.call(this);
    },
    prepareGroupProjection() {
      if (!this.view.reporting.grouping || !this.summary) return;
      this.collapsedGroups ||= new Set();
      const bounds = this.rowBounds(), key = [this.summary, bounds.first, bounds.last, this.groupCollapseVersion || 0];
      if (this.groupProjectionKey?.every((value, i) => value === key[i])) return;
      const segments = [], recordSegments = []; let count = 0;
      for (let i = 0; i < this.summary.groups.length; i++) {
        const group = this.summary.groups[i], first = Math.max(bounds.first, group.offset), last = Math.min(bounds.last, group.offset + group.count - 1);
        if (first > last) continue;
        const header = { _ri: -i - 1, hpx: this.rowH, h: { cells: {} }, status: "group", group };
        const length = 1 + (this.collapsedGroups.has(group.key) ? 0 : last - first + 1);
        const segment = { start: count, length, header, first, last };
        segments.push(segment); recordSegments.push(segment); count += length;
      }
      const find = (list, index, field) => {
        let low = 0, high = list.length;
        while (low < high) { const middle = (low + high) >>> 1; if (list[middle][field] <= index) low = middle + 1; else high = middle; }
        return low ? list[low - 1] : null;
      };
      const projection = {
        rowCount: () => count,
        rowAt: top => this.autoRows && this.rowOffsets ? this.rowOffsets.at(top) : Math.max(0, Math.min(count - 1, Math.floor(top / this.rowH))),
        rowTop: index => this.autoRows && this.rowOffsets ? this.rowOffsets.top(index) : index * this.rowH,
        recordIndex: ordinal => {
          const segment = find(recordSegments, ordinal, "first");
          return !segment || ordinal > segment.last || segment.length === 1 ? -1 : segment.start + 1 + ordinal - segment.first;
        },
        rowItem: index => {
          const segment = find(segments, index, "start");
          return !segment || index >= segment.start + segment.length ? null : index === segment.start ? segment.header : this.rowItem(segment.first + index - segment.start - 1);
        },
        indexOf: row => {
          if (!row) return -1;
          if (row.group) { const segment = segments.find(item => item.header.group.key === row.group.key); return segment?.start ?? -1; }
          const segment = find(recordSegments, row._ri, "first");
          return !segment || row._ri > segment.last || segment.length === 1 || this.indexOf(row) < 0 ? -1 : segment.start + 1 + row._ri - segment.first;
        },
        recordWindow: (first, last) => {
          const ranges = [];
          // Hidden groups can separate adjacent presentation rows by millions of record positions.
          // Preserve each visible record interval for both paging and cache retention.
          for (const segment of segments) {
            const start = Math.max(first, segment.start + 1), end = Math.min(last, segment.start + segment.length - 1);
            if (start <= end) ranges.push({ first: segment.first + start - segment.start - 1, last: segment.first + end - segment.start - 1 });
          }
          return { first: ranges[0]?.first ?? bounds.first, last: ranges.at(-1)?.last ?? -1, ranges };
        }
      };
      const focus = this.focused;
      if (focus) {
        const segment = focus.group ? segments.find(item => item.header.group.key === focus.group.key) : find(recordSegments, focus._ri, "first");
        if (segment && (focus.group || segment.length === 1)) this.focused = segment.header;
      }
      this.rowProjection = projection; this.groupProjectionKey = key;
      if (this.autoRows) this.syncRowOffsets();
      else { this.total = count * this.rowH; this.syncScrollRange(this.logicalTop()); }
      this.grid.setAttribute("aria-rowcount", String(count + 1));
    },
    setGroupCollapsed(key, collapsed) {
      if (this.destroyed || this.pendingQuery || !this.summary || !this.view.reporting.grouping || typeof collapsed !== "boolean" ||
          !this.summary.groups.some(group => group.key === key)) throw new Error("CanopyX: choose an accepted group and a boolean collapse intent.");
      this.collapsedGroups ||= new Set();
      const ownedFocus = this.canvas.contains(document.activeElement);
      if (collapsed && !this.collapsedGroups.has(key) && this.collapsedGroups.size >= 10000) throw new Error("CanopyX: at most 10,000 collapsed group keys are supported.");
      if (collapsed) this.collapsedGroups.add(key); else this.collapsedGroups.delete(key);
      this.groupCollapseVersion = (this.groupCollapseVersion || 0) + 1; this.version++; this.render();
      if (ownedFocus && this.focused?.group) this.rendered.get(this.focused)?.focus({ preventScroll: true });
      this.emit("group", { key, collapsed });
      this.noteViewPreferenceIntent?.();
      this.stateChanged();
    }
  });

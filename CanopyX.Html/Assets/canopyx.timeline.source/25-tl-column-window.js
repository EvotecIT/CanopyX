  // ---------- calendar: a bounded column window for large day/week schedules ----------
  Object.assign(DataGrid.prototype, {
    calWindowTimeColumns(columns) {
      this.calTimeWindow = null;
      if (this.calPhone || this.calPrinting || columns.length <= 24) return columns;
      const size = Math.max(2, Math.min(24, Math.floor((this.calBody.clientWidth - this.calKit.CAL_GUTTER) / 150)));
      const first = Math.max(0, Math.min(columns.length - size, this.calTimeFirst || 0));
      this.calTimeFirst = first;
      this.calTimeWindow = { first, size, total: columns.length, columns };
      return columns.slice(first, first + size).map((column, index) => ({ ...column, index: first + index }));
    },
    /** Reveals a global column index, then focuses the same time slot in its newly mounted cell. */
    calTimeReveal(index, minutes) {
      const window = this.calTimeWindow;
      if (!window || index < 0 || index >= window.total) return false;
      const column = window.columns[index];
      this.calTimeFirst = index < window.first ? index : index >= window.first + window.size ? index - window.size + 1 : window.first;
      this.calFocus = { day: column.day, minutes, resource: column.resource, event: null };
      this.calPaint({ keep: true }); this.calRestoreFocus(true);
      return true;
    }
  });

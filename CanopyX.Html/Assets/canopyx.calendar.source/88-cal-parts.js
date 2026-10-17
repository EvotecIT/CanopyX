  // ---------- calendar: the parts a definition needs beyond the core ----------
  // A basic calendar loads only this part. Recurrence (rules, exceptions, recurring ranges and iCalendar sources), editing
  // (moving, resizing, creating and dropping events) and iCalendar (export and import) are parts of their own that load before
  // the calendar starts when the definition uses them, or on first use (the Export menu, exportCalendar).
  Object.assign(DataGrid.prototype, {
    calParts() {
      const input = this.view.calendar || {}, ranges = Array.isArray(input.ranges) ? input.ranges : [], sources = Array.isArray(input.sources) ? input.sources : [];
      const ics = sources.some(source => source && source.ics !== undefined), needs = [];
      if (input.recurrence !== undefined || ics || ranges.some(range => range && range.recurrence !== undefined)) needs.push("calendar-recurrence");
      if (input.editable || input.create || input.drop) needs.push("calendar-edit");
      if (ics) needs.push("calendar-ics");
      return Promise.all(needs.map(name => this.calLoadPart(name)));
    },
    calLoadPart(name) { return loadPart(DataGrid.prototype.parts[name]); },
    /** The Export menu's iCalendar format for this grid; the iCalendar part loads when it is chosen. */
    calExportFormat() {
      const grid = this;
      return { id: "ics", label: this.calLabels.calendarExport, extension: "ics", mime: "text/calendar",
        async write(capture, context) { await grid.calLoadPart("calendar-ics"); return grid.calIcsWrite(capture, context); } };
    },
    /**
     * Exports iCalendar text: scope "visible" (the default) takes the records of the occurrences shown, "filtered", "selected" and
     * "all" the records of the grid's export scopes. Resolves with { blob, fileName, text }; download: true saves the file.
     */
    async exportCalendar(options = {}) { await this.calLoadPart("calendar-ics"); return this.calIcsExport(options); }
  });
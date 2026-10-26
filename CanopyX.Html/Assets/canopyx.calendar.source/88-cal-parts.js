  // ---------- calendar: the parts a definition needs beyond the core ----------
  // A basic calendar loads only this part. Recurrence (rules, exceptions, recurring ranges and iCalendar sources), editing
  // (moving, resizing, creating and dropping events) and iCalendar (export and import) are parts of their own that load before
  // the calendar starts when the definition uses them, or on first use (the Export menu, exportCalendar).
  Object.assign(DataGrid.prototype, {
    editCalendarOccurrence() { return Promise.resolve(false); },
    calParts() {
      const input = this.view.calendar || {}, ranges = Array.isArray(input.ranges) ? input.ranges : [], sources = Array.isArray(input.sources) ? input.sources : [];
      const ics = sources.some(source => source && source.ics !== undefined), needs = [];
      if (input.recurrence !== undefined || ics || sources.some(source => source?.url) || ranges.some(range => range && range.recurrence !== undefined)) needs.push("calendar-recurrence");
      if (input.editable || input.create || input.drop) needs.push("calendar-edit");
      if (ics) needs.push("calendar-ics");
      return Promise.all(needs.map(name => this.calLoadPart(name)));
    },
    calLoadPart(name) { return loadPart(DataGrid.prototype.parts[name]); },
    /** The Export menu's iCalendar format for this grid; the iCalendar part loads when it is chosen. */
    calExportFormat() {
      const grid = this;
      const write = this.calIcsFormatWriter = async (capture, context) => { await grid.calLoadPart("calendar-ics"); return grid.calIcsWrite(capture, context); };
      return { id: "ics", label: this.calLabels.calendarExport, extension: "ics", mime: "text/calendar", write };
    },
    /** Calendar settings hold the actual column objects; hidden or phone-fit fields still define the serialized event. */
    calIcsExportColumns(explicit) {
      const mapped = new Set(Object.values(this.cal)), columns = this.columns.filter(column => mapped.has(column));
      if (columns.some(column => column.exportable === false)) throw new Error("CanopyX: iCalendar export needs every mapped calendar column to allow export.");
      const ids = columns.map(column => column.id);
      if (explicit !== undefined && (!Array.isArray(explicit) || ids.some(id => !explicit.includes(id))))
        throw new Error("CanopyX: iCalendar export needs all mapped calendar columns; include their ids in the export columns.");
      return ids;
    },
    /** The built-in writer captures complete authorized fields at invocation, with the ordinary query/selection owner. */
    calPrepareIcsExport(options) {
      const columns = this.calIcsExportColumns(options.columns);
      return this.prepareExport({ ...options, columns: options.columns === undefined ? columns : options.columns, values: "raw" });
    },
    /**
     * Exports iCalendar text: scope "visible" (the default) takes the records of the occurrences shown, "filtered", "selected" and
     * "all" the records of the grid's export scopes. Resolves with { blob, fileName, text }; download: true saves the file.
     */
    async exportCalendar(options = {}) { await this.calLoadPart("calendar-ics"); return this.calIcsExport(options); }
  });

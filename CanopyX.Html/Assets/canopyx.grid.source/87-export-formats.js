  // ---------- export part: format writers and tree records ----------
  // This part ships in the lazy export file, which flat grids and trees load on first use.
  function saveExport(blob, name) {
    const url = URL.createObjectURL(blob), link = h("a"); link.href = url;
    // A file name is a basename: path separators, reserved, control and bidirectional formatting characters become "_", and
    // so do leading and trailing dots and spaces.
    link.download = String(name).replace(/[\\/:*?"<>|\x00-\x1f\x7f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "_").replace(/^[. ]+|[. ]+$/g, "_");
    document.body.appendChild(link); link.click(); link.remove();
    // A large file can still be reading after the click returns; release the URL only later.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  Object.assign(EXPORT_IMPL, {
    // The capture was taken at invocation. Page reads keep their own request deadlines; the writer has the export timeout,
    // and cancellation, timeout or destruction settle the export even when a writer ignores its signal.
    async run(grid, id, options, capture, format) {
      if (!format) throw new Error("CanopyX: export format '" + id + "' is not available.");
      const total = capture.request.recordCount, onProgress = options.onProgress, diagnostics = [];
      if (onProgress !== undefined && typeof onProgress !== "function" || options.onDiagnostic !== undefined && typeof options.onDiagnostic !== "function" ||
          options.download !== undefined && typeof options.download !== "boolean" || options.includeMetadata !== undefined && typeof options.includeMetadata !== "boolean")
        throw new Error("CanopyX: export callbacks must be functions and download/includeMetadata must be booleans.");
      // The safety timeout ends with the export: a finished writer's signal does not abort later.
      const timer = new AbortController(), clock = setTimeout(() => timer.abort(new DOMException("Export timed out.", "TimeoutError")), exportTimeout(grid, options));
      const signal = AbortSignal.any([grid.lifetime.signal, timer.signal, options.signal].filter(Boolean));
      const failure = () => signal.reason?.name === "TimeoutError" ? new Error("CanopyX: export timed out.") : new DOMException("Export cancelled.", "AbortError");
      // Phases and counts only advance and repeat nothing; a count a writer reports that is not a record count is ignored.
      const phases = ["reading", "generating", "ready"];
      let phase = -1, done = 0, read = 0, inputsComplete = false, finished = false, stop;
      const report = (name, completed) => {
        const next = phases.indexOf(name), count = total === null ? completed : Math.min(completed, total);
        if (signal.aborted || next < phase || !Number.isSafeInteger(completed) || completed < 0 || next === phase && count <= done) return;
        phase = next; done = Math.max(done, count);
        onProgress?.(Object.freeze({ phase: name, completed: done, total }));
      };
      const stopped = new Promise((resolve, reject) => { stop = () => reject(failure()); });
      signal.addEventListener("abort", stop, { once: true });
      try {
        if (signal.aborted) throw failure();
        const diagnostic = value => {
          if (signal.aborted || finished) return;
          if (!value || typeof value.code !== "string" || !value.code || value.code.length > 256 ||
              [value.columnId, value.rowId].some(id => id !== undefined && (typeof id !== "string" || id.length > 1024)))
            throw new Error("CanopyX: invalid export diagnostic.");
          const item = Object.freeze({ code: value.code, ...(value.columnId === undefined ? {} : { columnId: value.columnId }),
            ...(value.rowId === undefined ? {} : { rowId: value.rowId }) });
          if (diagnostics.some(known => known.code === item.code && known.columnId === item.columnId && known.rowId === item.rowId)) return;
          if (diagnostics.length >= 1000) throw new Error("CanopyX: too many export diagnostics.");
          diagnostics.push(item); options.onDiagnostic?.(item);
        };
        const counted = Object.freeze({ request: capture.request, rows: async function* (more) {
          read = 0;
          for await (const row of capture.rows({ signal: AbortSignal.any([signal, more?.signal].filter(Boolean)) })) {
            if (++read % 100 === 0) report(inputsComplete ? "generating" : "reading", read);
            yield row;
          }
          inputsComplete = true; report("generating", read);
        } });
        const base = capture.request.fileName || grid.view.id.replace(/[^a-z0-9_-]/gi, "_");
        report("reading", 0);
        let blob = await Promise.race([Promise.resolve().then(() => format.write(counted,
          Object.freeze({ signal, fileName: base, format: format.id, includeMetadata: options.includeMetadata === true, diagnostic,
            progress: completed => report(inputsComplete ? "generating" : "reading", completed) }))), stopped]).catch(error => {
          throw error instanceof Error || error instanceof DOMException ? error : new Error("CanopyX: export format '" + id + "' failed: " + String(error));
        });
        if (signal.aborted) throw failure();
        if (blob instanceof ArrayBuffer || ArrayBuffer.isView(blob)) blob = new Blob([blob], { type: format.mime });
        if (!(blob instanceof Blob)) throw new Error("CanopyX: export format '" + id + "' must write a Blob.");
        // A writer that names its file returns a File; otherwise the suggested name gets the format's extension.
        const fileName = blob.name || base + "." + format.extension;
        if (options.download !== false) saveExport(blob, fileName);
        report("generating", read); report("ready", read);
        return Object.freeze({ blob, fileName, format: format.id, diagnostics: Object.freeze(diagnostics.slice()) });
      } finally { finished = true; clearTimeout(clock); signal.removeEventListener("abort", stop); }
    },

    async *treeRows(grid, request, rows, signal) {
      const fmt = formatting(request.locale, request.timeZone === "local", grid.labels);
      const columns = request.columns.map(column => [column.id, grid.columns.findIndex(item => item.id === column.id)]);
      for (const { id, level, path, node } of rows) {
        if (grid.destroyed || signal.aborted) throw new DOMException("Grid cancelled.", "AbortError");
        const cells = Object.create(null);
        for (const [key, index] of columns) {
          const column = grid.columns[index], cell = grid.cellOf(node, column, index), tone = isCellObject(cell) && cell.tone;
          cells[key] = Object.freeze({ value: cellValue(cell) ?? null, text: cellText(cell, column, fmt), ...(tone ? { tone } : {}) });
        }
        yield Object.freeze({ id, level, path: Object.freeze(path), cells: Object.freeze(cells) });
      }
    }
  });

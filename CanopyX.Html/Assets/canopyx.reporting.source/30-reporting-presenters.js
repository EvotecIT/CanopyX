  // ---------- optional safe cell presenters over the existing host renderer contract ----------
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridExpandCell: "{column}: show complete text", gridCloseCell: "Close complete text"
  }));
  const PRESENTERS_VALIDATE = GRID_REPORTING.validate, PRESENTERS_BUILD = DataGrid.prototype.build;

  function reportingPresenter(options, column, columns) {
    const fields = { link: ["hrefColumn", "newWindow"], icon: ["glyph"], progress: ["maximum"],
      boolean: [], list: ["separator", "limit"], longText: [] };
    if (!options || typeof options !== "object" || Array.isArray(options) || !Object.hasOwn(fields, options.kind) ||
        Object.keys(options).some(key => key !== "kind" && !fields[options.kind].includes(key)))
      throw new Error("CanopyX: invalid reporting presenter.");
    if (options.kind === "progress" && (column.kind !== "number" || !Number.isFinite(options.maximum) ||
        options.maximum <= 0 || options.maximum > Number.MAX_SAFE_INTEGER) ||
        ["boolean", "list", "link"].includes(options.kind) && column.kind !== "text")
      throw new Error("CanopyX: presenter and raw column kind are incompatible.");
    if (options.kind === "link" && (options.newWindow !== undefined && typeof options.newWindow !== "boolean" ||
        options.hrefColumn !== undefined && !columns.some(item => item.id === options.hrefColumn && item.kind === "text")) ||
        options.kind === "icon" && (typeof options.glyph !== "string" || !options.glyph.trim() || options.glyph.length > 32) ||
        options.kind === "list" && (typeof options.separator !== "string" || !options.separator.length || options.separator.length > 16 ||
          !Number.isInteger(options.limit) || options.limit < 1 || options.limit > 16))
      throw new Error("CanopyX: invalid reporting presenter options.");
  }

  GRID_REPORTING.validate = view => {
    PRESENTERS_VALIDATE(view);
    const presenters = view.reporting.presenters;
    if (presenters === undefined) return;
    if (!presenters || typeof presenters !== "object" || Array.isArray(presenters))
      throw new Error("CanopyX: presenters are keyed by declared column ID.");
    for (const [id, options] of Object.entries(presenters)) {
      const column = view.columns.find(item => item && item.id === id);
      if (!column) throw new Error("CanopyX: a presenter needs a declared column.");
      reportingPresenter(options, column, view.columns);
    }
  };

  function reportingLink(raw) {
    if (typeof raw !== "string" || raw.length > 8192 || /[\u0000-\u001f\u007f]/.test(raw) || !raw.trim()) return null;
    const value = raw.trim();
    try {
      const url = new URL(value, document.baseURI);
      if (["http:", "https:", "mailto:"].includes(url.protocol)) return url.href;
      // Offline documents may navigate a relative file or fragment, never an explicit file/UNC URL.
      if (url.protocol === "file:" && !/^[a-z][a-z\d+.-]*:|^[\\/]{2}|\\/i.test(value)) return url.href;
    } catch (_) { /* Invalid destinations keep their text. */ }
    return null;
  }

  function reportingCellRenderer(grid, column, options) {
    return (row, element) => {
      const cell = row.cells[column.id], raw = cellValue(cell), text = cellText(cell, column, grid.fmt);
      const object = isCellObject(cell), tone = object ? toneOf(cell.tone) : NO_TONE;
      applyTone(element, element.className + " cx-presented-cell", tone);
      if (object && cell.title) element.title = cell.title;
      const appendText = (value, tag = "span", cls = "cx-presenter-text") => {
        const item = h(tag, cls); setText(item, value); element.appendChild(item); return item;
      };
      if (options.kind === "link") {
        const href = reportingLink(cellValue(options.hrefColumn ? row.cells[options.hrefColumn] : cell));
        const link = appendText(text, href ? "a" : "span");
        if (href) { link.href = href;
          if (options.newWindow) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
        }
      } else if (options.kind === "icon") {
        const glyph = appendText(options.glyph, "span", "cx-presenter-icon"); glyph.setAttribute("aria-hidden", "true"); appendText(text);
      } else if (options.kind === "progress" && typeof raw === "number") {
        const progress = h("progress", "cx-presenter-progress"); progress.max = options.maximum;
        progress.value = Math.min(options.maximum, Math.max(0, raw)); progress.setAttribute("aria-label", column.title + ": " + text);
        element.appendChild(progress); appendText(text);
      } else if (options.kind === "boolean" && typeof raw === "boolean") {
        appendText(object && cell.text !== undefined ? text : raw ? grid.labels.gridTrue : grid.labels.gridFalse);
      } else if (options.kind === "longText" || options.kind === "list") {
        const items = options.kind === "list" ? text.split(options.separator, options.limit + 1) : null;
        const value = items ? items.slice(0, options.limit).join(options.separator) + (items.length > options.limit ? " …" : "") : text;
        const preview = value.length > 256 ? value.slice(0, 256).replace(/[\uD800-\uDBFF]$/, "") + " …" : value;
        if (text && (!items || items.length > options.limit || value.length > 256)) {
          const button = appendText(preview, "button", "cx-presenter-expand"); button.type = "button";
          button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-label", fill(grid.labels.gridExpandCell, { column: column.title }));
          button.addEventListener("click", () => grid.showReportingText(column, text, button, row.id));
        } else appendText(preview);
      } else appendText(text);
      if (object) for (const badge of cell.badges || []) element.appendChild(badgeElement(badge));
      return true;
    };
  }

  DataGrid.prototype.build = function () {
    for (const column of this.columns) {
      const options = this.view.reporting && this.view.reporting.presenters && this.view.reporting.presenters[column.id];
      if (options && !column.render) column.render = reportingCellRenderer(this, column, options);
    }
    return PRESENTERS_BUILD.call(this);
  };

  // Portable export semantics are captured independently of DOM rendering and CSS.
  const GRID_EXPORT_PRESENTATION = new WeakMap();
  function gridCopyExportPresentation(from, to) {
    GRID_REPORTING.copyExportFormatting?.(from, to);
    const capture = GRID_EXPORT_PRESENTATION.get(from);
    if (capture) GRID_EXPORT_PRESENTATION.set(to, capture);
  }
  GRID_REPORTING.captureExport = (grid, request) => GRID_EXPORT_PRESENTATION.set(request,
    JSON.parse(JSON.stringify({ rules: grid.view.highlightRules || [], columns: grid.view.columns, labels: grid.labels, locale: grid.lang })));
  GRID_REPORTING.captureCardText = (request, columns) => { GRID_EXPORT_PRESENTATION.get(request).cardTextColumns = new Set(columns); };
  GRID_REPORTING.exportColumn = function (grid, column) {
    const policy = grid.columnLayouts?.get(column.id), presenter = column.presenter || grid.view.reporting?.presenters?.[column.id];
    const minimum = column.minWidth ?? policy?.minimum ?? 40, maximum = column.maxWidth ?? policy?.maximum;
    return { id: column.id, title: column.title, kind: column.kind,
      width: { unit: "css-px", preferred: column.renderWidth ?? column.width, minimum, ...(maximum === undefined ? {} : { maximum }) },
      pinned: column.effectivePin === "left" || column.effectivePin === "right" ? column.effectivePin : null,
      wrap: !!column.wrap, alignment: column.kind === "number" ? "right" : "left", ...(column.format ? { format: { ...column.format } } : {}),
      ...(presenter ? { presenter: JSON.parse(JSON.stringify(presenter)) } : {}),
      ...JSON.parse(JSON.stringify({ valueLabels:column.valueLabels, valueTones:column.valueTones, numericTones:column.numericTones })),
      ...(column.render && column.hostRenderer !== false ? { diagnostics: ["custom-renderer"] } : {}) };
  };
  GRID_REPORTING.exportRecord = function (grid, request, row) {
    const capture = GRID_EXPORT_PRESENTATION.get(request), matches = new Map(), cells = Object.create(null),
      templateText = capture.cardTextColumns ? Object.create(null) : null;
    for (const rule of capture.rules) {
      const key = rule.target === "cell" ? rule.column : null;
      if (!matches.has(key) && gridMatches(row, rule, capture.columns.find(column => column.id === rule.column))) matches.set(key, rule);
    }
    const fmt = formatting(request.locale || capture.locale, request.timeZone === "local", capture.labels);
    for (const column of request.columns) {
      const cell = row.cells[column.id], object = isCellObject(cell), value = cellValue(cell) ?? null, presenter = column.presenter;
      let text = cellText(cell, column, fmt);
      if (capture.cardTextColumns?.has(column.id)) templateText[column.id] = text;
      const missing = presenter && (value === null && (!object || cell.text === undefined) || text === "");
      const diagnostics = [...(column.diagnostics || [])];
      if (object && cell.className) diagnostics.push("custom-class");
      if (object && cell.badges?.length) diagnostics.push("badges");
      if (object && cell.series) diagnostics.push("history-series");
      if (missing) text = "—";
      if (!missing && presenter?.kind === "boolean" && typeof value === "boolean") text = value ? capture.labels.yes : capture.labels.no;
      if (!missing && presenter?.kind === "identifier") {
        const secondary = presenter.secondaryColumn ? cellText(row.cells[presenter.secondaryColumn],
          capture.columns.find(item => item.id === presenter.secondaryColumn), fmt) : object && cell.secondary;
        if (secondary) text += "\n" + secondary;
      }
      if (!missing && presenter?.kind === "change") {
        const delta = cellValue(row.cells[presenter.deltaColumn]);
        if (typeof delta === "number" && Number.isFinite(delta)) {
          text = (delta === 0 ? "" : delta > 0 ? "↑ " : "↓ ") + numberFormat(request.locale || capture.locale).format(Math.abs(delta)) + " " + text;
          if (delta !== 0) diagnostics.push("partial-tone");
        }
      }
      let link;
      if (!missing && presenter?.kind === "link") {
        const target = cellValue(presenter.hrefColumn ? row.cells[presenter.hrefColumn] : cell);
        if (typeof target === "string" && /^[a-z][a-z\d+.-]*:/i.test(target.trim())) {
          const safe = gridPresenterLink(target);
          if (safe && /^(https?:|mailto:)/i.test(safe)) link = { target: safe, ...(object && cell.title ? { tooltip: cell.title } : {}) };
          else diagnostics.push("unsafe-link");
        } else if (target) diagnostics.push("relative-link");
      }
      const mark = matches.get(column.id), tone = mark?.tone ?? columnValueTone(column,cell) ?? (presenter?.kind === "boolean" && value === true && presenter.inverted ? "danger" :
        presenter ? gridPresenterTone(presenter, value, object ? cell.tone : null) : object ? cell.tone : undefined);
      if (mark?.className) diagnostics.push("custom-class");
      cells[column.id] = { value, text, ...(tone ? { tone } : {}), ...(link ? { link } : {}), ...(diagnostics.length ? { diagnostics: [...new Set(diagnostics)] } : {}) };
    }
    const mark = matches.get(null), tone = mark?.tone ?? row.tone, diagnostics = row.className || mark?.className ? ["custom-class"] : [];
    return gridFreeze({ id: row.id, cells, ...(templateText ? { templateText } : {}), ...(tone ? { tone } : {}), ...(diagnostics.length ? { diagnostics } : {}) });
  };

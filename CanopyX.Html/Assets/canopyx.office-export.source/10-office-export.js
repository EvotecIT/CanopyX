  // OfficeIMO owns document construction and capture-to-document mapping. This part only connects delivery contracts.
  const officeWrite = global.OfficeIMO.exportCanopy;
  // A tree's records carry their level (1 is a root). The workbook groups them with native row outlines, at most Excel's
  // seven levels, and both documents indent the first column's text by level, as the CSV export does. Four spaces a
  // level stay visible in a proportional document font. The writer needs a revision string; an inline tree has none.
  const TREE_INDENT = "    ", TREE_OUTLINE_LEVELS = 7;
  // OfficeIMO appends a cell's badge labels to its text, but a badge's pill has no document form. Every runtime therefore
  // marks a cell with badges with the "badges" diagnostic, as the reporting runtime's capture already does, and the
  // writer reports the lost styling as a warning for any capture.
  function badgeLoss(row) {
    let cells = null;
    for (const [id, cell] of Object.entries(row.cells)) if (cell?.badges?.length && !cell.diagnostics?.includes("badges"))
      (cells ??= { ...row.cells })[id] = Object.freeze({ ...cell, diagnostics: Object.freeze([...(cell.diagnostics || []), "badges"]) });
    return cells ? Object.freeze({ ...row, cells: Object.freeze(cells) }) : row;
  }
  // A tree's records also carry their level (1 is a root): the first column is indented by level, and only text is
  // indented, so a raw number or timestamp keeps its exact value and the writer can still type it.
  function treeIndent(row, first, text) {
    const indent = TREE_INDENT.repeat(Math.max(0, row.level - 1)), cell = row.cells[first];
    return !indent || !cell ? row : Object.freeze({ ...row, cells: Object.freeze({ ...row.cells, [first]: Object.freeze({ ...cell,
      text: indent + cell.text, ...(text && typeof cell.value === "string" ? { value: indent + cell.value } : {}) }) }) });
  }
  function documentCapture(capture, levels, limits) {
    const input = capture.request, tree = input.kind === "tree", first = input.columns[0].id, text = input.columns[0].kind === "text";
    const request = limits.request(tree ? Object.freeze({ ...input, revision: input.revision ?? "inline" }) : input);
    return Object.freeze({ request, rows: async function* (options) {
      levels.length = 0;
      for await (const row of capture.rows(options)) {
        if (tree) levels.push(row.level);
        yield limits.row(badgeLoss(tree ? treeIndent(row, first, text) : row));
      }
    } });
  }
  EXPORT_IMPL.office = (capture, context) => {
    const tree = capture.request.kind === "tree", levels = [];
    // Records stream to the worksheet in order, so a data row's index is its position in this enumeration.
    const outline = tree && context.format === "xlsx" ? { xlsx: { sheet: { outlineSummaryBelow: false, maxOutlineLevel: TREE_OUTLINE_LEVELS,
      rowOutline: ({ rowIndex }) => levels[rowIndex] > 1 ? { level: Math.min(levels[rowIndex] - 1, TREE_OUTLINE_LEVELS) } : undefined } } } : {};
    const diagnostic = value => context.diagnostic(value);
    return officeWrite(documentCapture(capture, levels, officeLimits(context.format, diagnostic)), context.format, {
      signal: context.signal, about: context.includeMetadata, onProgress: progress => context.progress(progress.rows), ...outline,
      // OfficeIMO fills the standard tones with fixed document colours (each pair above 4.5:1), since a stylesheet theme
      // cannot reach a file; neutral stays plain. Presentation a document cannot keep (badge pills, custom classes and
      // renderers, native rules in a PDF, a host's own tone name) falls back to the captured value and text. The writer
      // reports each case, and the export passes it on as a warning in onDiagnostic and the result's diagnostics instead
      // of failing. Invalid captures still throw.
      unsupportedPresentation: "text",
      onDiagnostic: diagnostic
    });
  };

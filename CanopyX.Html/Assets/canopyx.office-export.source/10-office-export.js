  // OfficeIMO owns document construction and capture-to-document mapping. This part only connects delivery contracts.
  const officeWrite = global.OfficeIMO.exportCanopy;
  // A tree's records carry their level (1 is a root). The workbook groups them with native row outlines, at most Excel's
  // seven levels, and both documents indent the first column's text by level, as the CSV export does. Four spaces a
  // level stay visible in a proportional document font. The writer needs a revision string; an inline tree has none.
  const TREE_INDENT = "    ", TREE_OUTLINE_LEVELS = 7;
  // Document colours for the standard tones, fill and text, the same pairs OfficeIMO uses for native workbook rules. A
  // stylesheet theme cannot reach a file, so row and cell tones get these fixed colours (each pair is above 4.5:1);
  // neutral stays plain and a host's own tone name stays plain text with an UNMAPPED_TONE diagnostic.
  const DOCUMENT_TONES = Object.freeze({
    info: Object.freeze({ background: "DDEBF7", color: "1F4E78" }),
    success: Object.freeze({ background: "E2F0D9", color: "375623" }),
    warning: Object.freeze({ background: "FFF2CC", color: "7F5000" }),
    danger: Object.freeze({ background: "FFC7CE", color: "9C0006" }),
    muted: Object.freeze({ color: "595959" })
  });
  function treeDocument(capture, levels) {
    // Only text is indented: a raw number or timestamp keeps its exact value so the writer can still type it.
    const request = capture.request, first = request.columns[0].id, text = request.columns[0].kind === "text";
    return Object.freeze({ request: Object.freeze({ ...request, revision: request.revision ?? "inline" }), rows: async function* (options) {
      levels.length = 0;
      for await (const row of capture.rows(options)) {
        levels.push(row.level);
        const indent = TREE_INDENT.repeat(Math.max(0, row.level - 1)), cell = row.cells[first];
        yield !indent || !cell ? row : Object.freeze({ ...row, cells: Object.freeze({ ...row.cells, [first]: Object.freeze({ ...cell,
          text: indent + cell.text, ...(text && typeof cell.value === "string" ? { value: indent + cell.value } : {}) }) }) });
      }
    } });
  }
  EXPORT_IMPL.office = (capture, context) => {
    const tree = capture.request.kind === "tree", levels = [];
    // Records stream to the worksheet in order, so a data row's index is its position in this enumeration.
    const outline = tree && context.format === "xlsx" ? { xlsx: { sheet: { outlineSummaryBelow: false, maxOutlineLevel: TREE_OUTLINE_LEVELS,
      rowOutline: ({ rowIndex }) => levels[rowIndex] > 1 ? { level: Math.min(levels[rowIndex] - 1, TREE_OUTLINE_LEVELS) } : undefined } } } : {};
    return officeWrite(tree ? treeDocument(capture, levels) : capture, context.format, {
      signal: context.signal, about: context.includeMetadata, onProgress: progress => context.progress(progress.rows), ...outline,
      tones: DOCUMENT_TONES,
      // Presentation a document cannot keep (badge pills, custom classes and renderers, native rules in a PDF, an unknown
      // tone) falls back to the captured value and text. The writer reports each case, and the export passes it on as a
      // warning in onDiagnostic and the result's diagnostics instead of failing. Invalid captures still throw.
      unsupportedPresentation: "text",
      onDiagnostic: value => context.diagnostic(value)
    });
  };

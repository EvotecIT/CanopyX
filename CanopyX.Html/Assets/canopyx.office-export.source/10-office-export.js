  // OfficeIMO owns document construction and capture-to-document mapping. This part only connects delivery contracts.
  const officeWrite = global.OfficeIMO.exportCanopy;
  // A tree's records carry their level (1 is a root). The workbook groups them with native row outlines, at most Excel's
  // seven levels, and both documents indent the first column's text by level, as the CSV export does. Four spaces a
  // level stay visible in a proportional document font. The writer needs a revision string; an inline tree has none.
  const TREE_INDENT = "    ", TREE_OUTLINE_LEVELS = 7;
  function treeDocument(capture, levels) {
    const request = capture.request, first = request.columns[0].id;
    return Object.freeze({ request: Object.freeze({ ...request, revision: request.revision ?? "inline" }), rows: async function* (options) {
      levels.length = 0;
      for await (const row of capture.rows(options)) {
        levels.push(row.level);
        const indent = TREE_INDENT.repeat(Math.max(0, row.level - 1)), cell = row.cells[first];
        yield !indent || !cell ? row : Object.freeze({ ...row, cells: Object.freeze({ ...row.cells, [first]: Object.freeze({ ...cell,
          text: indent + cell.text, ...(typeof cell.value === "string" ? { value: indent + cell.value } : {}) }) }) });
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
      // A paged PDF preserves captured values and links; native workbook rules have no PDF equivalent, and a cell tone
      // without a document colour stays plain text, as it does in the workbook. Accept only those known limitations
      // explicitly, report them to the caller, and keep genuinely unsupported presentation as an error.
      ...(context.format === "pdf" ? { unsupportedPresentation: "text" } : {}),
      onDiagnostic: value => {
        if (context.format === "pdf" && value.code !== "PIVOT_OUTLINES_XLSX_ONLY" &&
            !value.code.startsWith("PDF_NATIVE_RULE_NOT_RENDERED:") && !value.code.startsWith("UNMAPPED_TONE:"))
          throw new Error("CanopyX: unsupported PDF presentation: " + value.code);
        context.diagnostic(value);
      }
    });
  };

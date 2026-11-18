  // OfficeIMO writes the CSV text: quoting, line endings and spreadsheet formula protection. This part only turns the
  // captured records into its rows, with a tree's first column indented two spaces a level, as the tree shows it.
  const writeCsv = global.OfficeIMO.csv.writeCsv;
  // OfficeIMO protects ASCII formula markers after ASCII spaces. Full-width markers, and markers after other leading white
  // space, can still start a formula in some spreadsheet input modes, so CanopyX protects those too.
  const wideFormula = /^\s*[=+\-@＝＋－＠]/, officeFormula = /^ *[=+\-@\t\r\n]/;
  const protect = value => typeof value === "string" && wideFormula.test(value) && !officeFormula.test(value) ? "'" + value : value;
  EXPORT_IMPL.csv = (capture, context, treeColumn) => {
    const request = capture.request, raw = request.values === "raw";
    const columns = request.columns.map(column => ({ key: column.id, header: protect(column.title) }));
    async function* rows() {
      for await (const row of capture.rows({ signal: context.signal })) {
        yield request.columns.map(column => {
          let value = raw ? row.cells[column.id]?.value : row.cells[column.id]?.text;
          if (row.level > 1 && column.id === treeColumn) value = "  ".repeat(row.level - 1) + (value ?? "");
          return protect(value ?? null);
        });
      }
    }
    return writeCsv(rows(), { columns, signal: context.signal, lineEnding: "\r\n", booleanText: { true: "true", false: "false" } });
  };

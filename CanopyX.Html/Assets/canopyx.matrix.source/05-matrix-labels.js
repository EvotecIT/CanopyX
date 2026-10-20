  // ---------- matrix: the English texts of the matrix labels (docs/matrix.md#labels-and-right-to-left) ----------
  // The label packs translate them (CanopyLabels.Matrix…, labels.json). A matrix document's labels and the host's replace them.
  const MATRIX_LABELS = {
    matrixRows: "Rows", matrixColumns: "Columns", matrixSearch: "Find rows and columns", matrixSortBy: "Sort by", matrixGroupBy: "Group by",
    matrixByLabel: "Name", matrixByTotal: "Total", matrixAsListed: "As listed", matrixNoGrouping: "No groups", matrixDescending: "Descending",
    matrixOnlyProblems: "Only problems", matrixHideEmpty: "Hide empty rows and columns", matrixSize: "{rows} × {columns}", matrixShown: "Rows: {rows} of {totalRows}, columns: {columns} of {totalColumns}",
    matrixAttention: "Need attention: {count}", matrixLegend: "States", matrixFilter: "Filter", matrixClearFilters: "Clear filters",
    matrixNoMatches: "No rows or columns match.", matrixSelf: "Same item", matrixNoData: "No data", matrixCell: "{row} and {column}: {state}",
    matrixTotal: "Total", matrixItemTotal: "{item}: {count}", matrixExpandGroup: "Expand {group}", matrixCollapseGroup: "Collapse {group}",
    matrixGroupCount: "Items: {count}", matrixDetails: "Details", matrixClose: "Close", matrixValue: "Value", matrixState: "State",
    matrixAllClear: "Nothing needs attention", matrixShowMore: "Show more"
  };

  /** A matrix's labels: the English texts, then the document's, then the host's. An unknown matrix… name is a mistake; other views' names are ignored. */
  function matrixLabels(...sources) {
    const labels = { ...MATRIX_LABELS };
    for (const source of sources) {
      if (source == null) continue;
      if (typeof source !== "object" || Array.isArray(source)) matrixFail("labels must be an object of strings");
      for (const [name, text] of Object.entries(source)) {
        // A whole label pack holds the labels of every view; a matrix takes its own.
        if (!Object.hasOwn(labels, name)) { if (/^matrix[A-Z]/.test(name)) matrixFail("there is no matrix label '" + name + "'"); continue; }
        if (typeof text !== "string" || !/\S/.test(text)) matrixFail("label '" + name + "' must be a string with visible text");
        labels[name] = text;
      }
    }
    return Object.freeze(labels);
  }
  /** A label with placeholders as a fast function of its values: the template is split once, not matched on every call. */
  function matrixTemplate(text) {
    const parts = text.split(/\{(\w+)\}/);
    return values => { let result = parts[0]; for (let i = 1; i < parts.length; i += 2) result += (values[parts[i]] ?? "{" + parts[i] + "}") + parts[i + 1]; return result; };
  }
  function matrixFail(message) { throw new Error("CanopyX: the matrix document is not valid: " + message + "."); }

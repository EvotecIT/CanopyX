  // A before/after endpoint preserves absence, explicit null and empty text as distinct visible values.
  function changeCellText(cell, column, fmt) {
    if (cell == null) return "—";
    const structured = isCellObject(cell) && ["items", "fields", "records", "events", "changes"].some(name => cell[name]);
    if (isCellObject(cell) && cellValue(cell) == null && !cell.text && !structured) return "null";
    const text = cellText(cell, column, fmt);
    return text.length ? text : '""';
  }

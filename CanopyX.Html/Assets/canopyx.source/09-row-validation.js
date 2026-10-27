  // ---------- row contracts shared by grids and record collections ----------
  // ids carries the identities of the earlier chunks of the same rows (the data part validates rowData chunk by chunk).
  // Grid loaders pass repair (repairGridCell, in the grid runtime): one mistyped or malformed cell must not fail the whole
  // view, so it is coerced or emptied and reported once per column on the console. Repair leaves the caller's rows untouched
  // (they may be cached or frozen): a repaired row is a copy, and the returned array holds it, so callers that repair use
  // the result. Host API calls keep the strict contract and throw to their caller.
  function validateGridRows(rows, columns, ids = new Set(), repair = null) {
    if (!Array.isArray(rows)) throw new Error("CanopyX: grid rows must be an array.");
    const declared = new Map(columns.map(column => [column.id, column])), repaired = new Map();
    let result = rows;
    rows.forEach((row, index) => {
      requireIdentifier(row && row.id, "grid row ID");
      if (ids.has(row.id)) throw new Error("CanopyX: duplicate grid row ID " + row.id);
      ids.add(row.id);
      if (!row.cells || typeof row.cells !== "object" || Array.isArray(row.cells))
        throw new Error("CanopyX: invalid flat row fields.");
      let copy = null;
      const own = () => copy || (result === rows && (result = rows.slice()), result[index] = copy = { ...row, cells: { ...row.cells } });
      try { gridDecoration(row.tone, row.className); } catch (error) { if (!repair) throw error; delete own().tone; delete copy.className; }
      for (const id of Object.keys(row.cells)) {
        const column = declared.get(id);
        try { if (!column) throw new Error("CanopyX: undeclared grid column " + id); validateGridCell(row.cells[id], column); }
        catch (error) {
          if (!repair) throw error;
          const cells = own().cells; if (column) cells[id] = repair(cells[id], column); else delete cells[id];
          const seen = repaired.get(id); if (seen) seen.count++; else repaired.set(id, { row: row.id, count: 1 });
        }
      }
    });
    for (const [id, seen] of repaired)
      console.warn("CanopyX: " + seen.count + " cell(s) in column " + id + " did not fit the column and were coerced, emptied or dropped (first row " + seen.row + ").");
    return result;
  }

  function validateGridCell(cell, column) {
    if (isCellObject(cell)) {
      if (Array.isArray(cell) ||
          ["text", "searchText", "title", "tone", "secondary"].some(name => cell[name] !== undefined && typeof cell[name] !== "string") ||
          cell.secondary !== undefined && cell.secondary.length > 4096 || cell.sort !== undefined && !(typeof cell.sort === "string" ? cell.sort.length <= 4096 : Number.isFinite(cell.sort)) || cell.series !== undefined && !gridSeriesValid(cell.series) ||
          cell.badges !== undefined && (!Array.isArray(cell.badges) || cell.badges.some(badge => !badge || typeof badge.text !== "string" ||
            ["tone", "title"].some(name => badge[name] !== undefined && typeof badge[name] !== "string"))))
        throw new Error("CanopyX: malformed grid cell.");
      if (typeof cell.sort === "number") gridScalar(cell.sort, { kind: "number" });
    }
    gridScalar(cell, column);
  }

  function gridDecoration(tone, className) {
    if (tone !== undefined && (typeof tone !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(tone) || tone.endsWith("-bg")) ||
        className !== undefined && (typeof className !== "string" || !className.trim() || className.length > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(className)))
      throw new Error("CanopyX: invalid highlight tone or className.");
  }
  function gridSeriesValid(points) {
    return Array.isArray(points)&&points.length<=4096&&points.every(point=>point&&typeof point==="object"&&!Array.isArray(point)&&
      typeof point.period==="string"&&!!point.period.trim()&&point.period.length<=256&&
      (point.value==null||Number.isFinite(point.value)&&Math.abs(point.value)<=Number.MAX_SAFE_INTEGER)&&
      (point.state==null||typeof point.state==="string"&&point.state.length<=4096)&&(point.tone===undefined||typeof point.tone==="string"));
  }

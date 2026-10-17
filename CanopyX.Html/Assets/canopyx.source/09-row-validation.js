  // ---------- row contracts shared by grids and record collections ----------
  // ids carries the identities of the earlier chunks of the same rows (the data part validates rowData chunk by chunk).
  function validateGridRows(rows, columns, ids = new Set()) {
    if (!Array.isArray(rows)) throw new Error("CanopyX: grid rows must be an array.");
    const declared = new Map(columns.map(column => [column.id, column]));
    for (const row of rows) {
      requireIdentifier(row && row.id, "grid row ID");
      if (ids.has(row.id)) throw new Error("CanopyX: duplicate grid row ID " + row.id);
      ids.add(row.id);
      if (!row.cells || typeof row.cells !== "object" || Array.isArray(row.cells))
        throw new Error("CanopyX: invalid flat row fields.");
      gridDecoration(row.tone, row.className);
      for (const id of Object.keys(row.cells)) {
        if (!declared.has(id)) throw new Error("CanopyX: undeclared grid column " + id);
        const cell = row.cells[id];
        if (isCellObject(cell)) {
          if (Array.isArray(cell) ||
              ["text", "searchText", "title", "tone", "secondary"].some(name => cell[name] !== undefined && typeof cell[name] !== "string") ||
              cell.secondary !== undefined && cell.secondary.length > 4096 || cell.sort !== undefined && !(typeof cell.sort === "string" ? cell.sort.length <= 4096 : Number.isFinite(cell.sort)) || cell.series !== undefined && !gridSeriesValid(cell.series) ||
              cell.badges !== undefined && (!Array.isArray(cell.badges) || cell.badges.some(badge => !badge || typeof badge.text !== "string" ||
                ["tone", "title"].some(name => badge[name] !== undefined && typeof badge[name] !== "string"))))
            throw new Error("CanopyX: malformed grid cell.");
          if (typeof cell.sort === "number") gridScalar(cell.sort, { kind: "number" });
        }
        gridScalar(cell, declared.get(id));
      }
    }
    return rows;
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

  // ---------- row contracts shared by grids and record collections ----------
  // ids carries the identities of the earlier chunks of the same rows (the data part validates rowData chunk by chunk).
  // Loaders pass repair: one mistyped or malformed cell must not fail the whole view, so it is coerced or emptied in place
  // and reported once per column on the console. Host API calls keep the strict contract and throw to their caller.
  function validateGridRows(rows, columns, ids = new Set(), repair = false) {
    if (!Array.isArray(rows)) throw new Error("CanopyX: grid rows must be an array.");
    const declared = new Map(columns.map(column => [column.id, column])), repaired = new Map();
    for (const row of rows) {
      requireIdentifier(row && row.id, "grid row ID");
      if (ids.has(row.id)) throw new Error("CanopyX: duplicate grid row ID " + row.id);
      ids.add(row.id);
      if (!row.cells || typeof row.cells !== "object" || Array.isArray(row.cells))
        throw new Error("CanopyX: invalid flat row fields.");
      if (repair) try { gridDecoration(row.tone, row.className); } catch { delete row.tone; delete row.className; }
      else gridDecoration(row.tone, row.className);
      for (const id of Object.keys(row.cells)) {
        if (!declared.has(id)) {
          if (!repair) throw new Error("CanopyX: undeclared grid column " + id);
          delete row.cells[id];
          const seen = repaired.get(id); if (seen) seen.count++; else repaired.set(id, { row: row.id, count: 1 });
          continue;
        }
        if (!repair) { validateGridCell(row.cells[id], declared.get(id)); continue; }
        try { validateGridCell(row.cells[id], declared.get(id)); }
        catch {
          row.cells[id] = repairGridCell(row.cells[id], declared.get(id));
          const seen = repaired.get(id); if (seen) seen.count++; else repaired.set(id, { row: row.id, count: 1 });
        }
      }
    }
    for (const [id, seen] of repaired)
      console.warn("CanopyX: " + seen.count + " cell(s) in column " + id + " did not fit the column and were coerced, emptied or dropped (first row " + seen.row + ").");
    return rows;
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

  // A number or bigint in a text column becomes its string, a numeric string in a number column its number; anything else
  // gets an empty raw value, so it sorts and filters as a missing value. Text keeps showing; a number outside the safe range
  // does not, because the browser may already have rounded it and would show a wrong value.
  function repairGridCell(cell, column) {
    const raw = cellValue(cell), shown = typeof raw === "string" || typeof raw === "boolean" ? String(raw) : undefined;
    let value = raw;
    try { gridScalar(value, column); } catch {
      value = null;
      if (column.kind === "number" && typeof raw === "string" && raw.trim()) value = Number(raw);
      else if (column.kind !== "number" && column.kind !== "datetime" && (typeof raw === "bigint" || Number.isFinite(raw))) value = String(raw);
      try { gridScalar(value, column); } catch { value = null; }
    }
    const text = isCellObject(cell) && !Array.isArray(cell) && typeof cell.text === "string" ? cell.text : value === null ? shown : undefined;
    if (isCellObject(cell) && !Array.isArray(cell)) {
      // Keep the tone, badges and other decorations when they are valid; an invalid sort key is dropped.
      const kept = { ...cell, value, ...(text === undefined ? {} : { text }) };
      try { validateGridCell(kept, column); return kept; } catch { }
      delete kept.sort;
      try { validateGridCell(kept, column); return kept; } catch { }
    }
    return text === undefined ? value : { value, text };
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

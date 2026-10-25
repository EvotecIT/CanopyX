  // ---------- exact correlated tuple membership (AND-combined with the other query criteria) ----------
  function gridTupleFilters(input, columns, strict) {
    if (!Array.isArray(input) || input.length > 8) throw new Error("CanopyX: at most eight tuple predicates.");
    return input.map(tuple => {
      if (!tuple || typeof tuple !== "object" || Array.isArray(tuple) || !Array.isArray(tuple.columns) ||
          tuple.columns.length < 1 || tuple.columns.length > 6 || !Array.isArray(tuple.values) ||
          tuple.values.length < 1 || tuple.values.length > 200 || tuple.exclude !== undefined && typeof tuple.exclude !== "boolean")
        throw new Error("CanopyX: invalid tuple predicate.");
      const fields = tuple.columns.map(field => {
        const column = field && columns.get(field.column);
        if (!field || typeof field !== "object" || Array.isArray(field) || !column || column.filterable === false)
          throw new Error("CanopyX: tuple fields require filterable columns.");
        const bucket = field.bucket === undefined ? null : gridBucketDefinition(field.bucket, column);
        return gridQueryRecord(field, { column: column.id, ...(bucket ? { bucket } : {}) }, strict);
      });
      const values = tuple.values.map(row => {
        if (!Array.isArray(row) || row.length !== fields.length) throw new Error("CanopyX: tuple widths must match their fields.");
        return Array.from(row, (value, index) => {
          if (value !== null) {
            if (value === undefined || typeof value === "object") throw new Error("CanopyX: tuple operands are raw scalars or explicit null.");
            const column = columns.get(fields[index].column);
            gridScalar(value, fields[index].bucket ? { ...column, kind: "number" } : column);
          }
          return value;
        });
      });
      return gridQueryRecord(tuple, { columns: fields, values, exclude: tuple.exclude ?? false }, strict);
    });
  }

  function gridMatchesTuples(row, tuples, columns) {
    return !tuples || tuples.every(tuple => {
      const scalars = tuple.columns.map(field => {
        const scalar = gridScalar(row.cells[field.column], columns.get(field.column));
        return field.bucket ? GRID_BUCKETS.key(field.bucket, scalar) : scalar;
      });
      const member = tuple.values.some(values => values.every((value, index) => {
        const field = tuple.columns[index], column = columns.get(field.column);
        return scalars[index] === (value === null || field.bucket ? value : gridScalar(value, column));
      }));
      return tuple.exclude ? !member : member;
    });
  }

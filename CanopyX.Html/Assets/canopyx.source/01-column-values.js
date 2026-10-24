  // Column presentation never replaces a row's raw values or predicate/group identities.
  function columnNumericTone(column, raw) {
    return typeof raw === "number" && Number.isFinite(raw) ? column.numericTones?.find(rule =>
      rule.operator === "atMost" ? raw <= rule.value : rule.operator === "atLeast" ? raw >= rule.value :
      rule.operator === "below" ? raw < rule.value : raw > rule.value) : undefined;
  }
  function columnValueTone(column, cell) {
    const raw = cellValue(cell);
    return columnNumericTone(column, raw)?.tone || (typeof raw === "string" && Object.hasOwn(column.valueTones || {}, raw) ? column.valueTones[raw] : undefined);
  }
  function validateColumnValues(column) {
    const fail = () => { throw new Error("CanopyX: invalid column value labels, order, tones or line limit."); };
    const tone = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(value) && !value.endsWith("-bg");
    if (column.maxLines !== undefined && (!Number.isInteger(column.maxLines) || column.maxLines < 1 || column.maxLines > 12)) fail();
    for (const name of ["valueLabels", "valueTones"]) if (column[name] !== undefined) {
      const map = column[name];
      if (column.kind !== "text" || !map || typeof map !== "object" || Array.isArray(map) || Object.keys(map).length > 512 ||
          Object.entries(map).some(([key, value]) => key.length > 4096 || (name === "valueTones" ? !tone(value) : typeof value !== "string" || value.length > 4096))) fail();
    }
    if (column.valueOrder !== undefined && (column.kind !== "text" || !Array.isArray(column.valueOrder) || column.valueOrder.length > 512 ||
        new Set(column.valueOrder).size !== column.valueOrder.length || column.valueOrder.some(value => typeof value !== "string" || value.length > 4096))) fail();
    if (column.numericTones !== undefined && (column.kind !== "number" || !Array.isArray(column.numericTones) || column.numericTones.length > 32 ||
        column.numericTones.some(rule => !rule || !["atMost", "atLeast", "below", "above"].includes(rule.operator) || !Number.isFinite(rule.value) ||
          !tone(rule.tone) || typeof rule.label !== "string" || !rule.label.trim() || rule.label.length > 4096))) fail();
  }

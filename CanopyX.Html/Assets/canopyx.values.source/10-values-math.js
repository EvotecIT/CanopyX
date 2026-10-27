  // Pure display math. Percent values stay fractions so numeric exports can pair them with a percent number format.
  function showAsValues(values, mode, grand = null, parent = null, rowTotals, columnTotals) {
    if (!Array.isArray(values) || values.length > 10000 || values.some(value => value !== null && !Number.isFinite(value)) || !GRID_SHOW_AS_MODES.includes(mode) ||
        rowTotals && rowTotals.length !== values.length || columnTotals && columnTotals.length !== values.length) throw new Error("CanopyX: invalid aggregate display inputs.");
    const ranks = new Map();
    if (mode === "rank") values.filter(value => value !== null).sort((a, b) => b - a).forEach((value, index) => { if (!ranks.has(value)) ranks.set(value, index + 1); });
    let running = 0;
    return values.map((value, index) => {
      if (value === null) return null;
      const divide = denominator => denominator !== null && denominator !== undefined && denominator !== 0 ? value / denominator : null;
      let result;
      switch (mode) {
        case "percentGrandTotal": result = divide(grand); break;
        case "percentParent": result = divide(parent); break;
        case "percentRow": result = divide(rowTotals?.[index]); break;
        case "percentColumn": result = divide(columnTotals?.[index]); break;
        case "runningTotal": running += value; result = running; break;
        case "rank": result = ranks.get(value); break;
        case "difference": result = !index || values[index - 1] === null ? null : value - values[index - 1]; break;
        case "percentChange": result = !index || values[index - 1] === null || values[index - 1] === 0 ? null : (value - values[index - 1]) / values[index - 1]; break;
        default: result = value;
      }
      return result === null || !Number.isFinite(result) ? null : result;
    });
  }
  const showAsPercent = mode => ["percentGrandTotal", "percentParent", "percentRow", "percentColumn", "percentChange"].includes(mode);
  const showAsFormat = mode => showAsPercent(mode) ? "0.00%" : mode === "rank" ? "0" : "0.00";
  Object.assign(GRID_SHOW_AS, { evaluate: showAsValues, percent: showAsPercent, numberFormat: showAsFormat });

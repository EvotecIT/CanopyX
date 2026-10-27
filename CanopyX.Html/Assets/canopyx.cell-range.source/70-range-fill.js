  // ---------- the fill handle (rangeSelection.fillHandle, off by default) ----------
  // The square on a single range's bottom-right corner drags down to fill the cells below. Each column continues its values:
  // two or more numbers, or dates, with the same step go on with that step; anything else repeats in turn. Ctrl/Cmd+D fills
  // the range itself from its first row. Filled values go the way pasted values go: the paste event, then the editing part.
  function crSeries(values, count, copy = false) {
    if (!values.length) return [];
    const repeat = () => Array.from({ length: count }, (_, index) => values[index % values.length]);
    if (copy) return repeat();
    const numbers = values.every(value => typeof value === "number" && Number.isFinite(value)),
      dates = !numbers && values.every(value => typeof value === "string" && /^\d{4}-\d\d-\d\d(?:T|$)/.test(value) && Number.isFinite(Date.parse(value))),
      items = !numbers && !dates && values.map(value => typeof value === "string" && /^(.*?)(\d+)$/.exec(value)),
      numbered = items && items.every(item => item && item[1] === items[0][1] && Number.isSafeInteger(Number(item[2])));
    if (numbers || dates || numbered) {
      const points = values.map((value, index) => numbers ? value : dates ? Date.parse(value) : Number(items[index][2])),
        step = points.length > 1 ? points[1] - points[0] : dates ? 86400000 : 1;
      if (points.every((point, index) => !index || Math.abs(point - points[index - 1] - step) < 1e-9)) {
        const places = value => { const [digits, power] = String(value).split("e"); return Math.max(0, (digits.split(".")[1] || "").length - Number(power || 0)); };
        const decimals = numbers ? Math.min(20, Math.max(...values.map(places))) : 0,
          dateOnly = dates && values.every(value => value.length === 10),
          padding = numbered && items.some(item => item[2].length > 1 && item[2][0] === "0") ? Math.max(...items.map(item => item[2].length)) : 0;
        const series = Array.from({ length: count }, (_, index) => {
          const next = points[points.length - 1] + step * (index + 1);
          if (numbers) return Number.isFinite(next) ? Number(next.toFixed(decimals)) : null;
          if (numbered) return Number.isSafeInteger(next) && next >= 0 ? items[0][1] + String(next).padStart(padding, "0") : null;
          const date = new Date(next);
          return Number.isFinite(date.getTime()) ? dateOnly ? date.toISOString().slice(0, 10) : date.toISOString() : null;
        });
        return series.some(value => value === null) ? repeat() : series;
      }
    }
    return repeat();
  }

  /** Fills rows below a rectangle (or its own rows below its first) and applies the values as a fill. */
  async function crFill(grid, rect, top, bottom, sourceRows, copy = false) {
    const blocks = [{ rows: Array.from({ length: bottom - rect.top + 1 }, (_, index) => rect.top + index), left: rect.left, right: rect.right }];
    const loaded = await crLoad(grid, blocks), cells = [];
    const targets = blocks[0].rows.filter(position => position >= top && position <= bottom && loaded.has(position));
    for (let index = rect.left; index <= rect.right; index++) {
      const column = grid.cols[index], values = [];
      for (let position = rect.top; position < rect.top + sourceRows; position++) { const row = loaded.get(position); if (row) values.push(cellValue(row.h.cells[column.id]) ?? null); }
      if (!values.length) continue;
      const series = crSeries(values, targets.length, copy);
      for (const [index, position] of targets.entries()) {
        const row = loaded.get(position);
        const value = series[index], previous = cellValue(row.h.cells[column.id]);
        cells.push({ id: row.key, column: column.id, row: position, text: value == null ? "" : cellText(value, column, grid.fmt), value, previous: previous ?? null });
      }
    }
    return crApply(grid, cells, [], "fill");
  }

  function crFillDown(grid) {
    const rect = crRects(grid)[0];
    if (!rect || rect.bottom === rect.top) return Promise.resolve();
    const first = crDataBounds(grid, rect.top, rect.bottom).first;
    return first < 0 || first === rect.bottom ? Promise.resolve() : crFill(grid, { ...rect, top: first }, first + 1, rect.bottom, 1, true);
  }

  function crFillDrag(grid, event) {
    const rect = crRects(grid)[0];
    if (!rect || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    let bottom = rect.bottom;
    crTrack(grid, event, hit => {
      bottom = Math.max(rect.bottom, hit.row);
      grid.cellFillPreview = bottom > rect.bottom ? { top: rect.bottom + 1, bottom, left: rect.left, right: rect.right } : null;
      crPaint(grid);
    }, (released, pointer) => {
      grid.cellFillPreview = null;
      if (released && bottom > rect.bottom) {
        const range = grid.cellRanges[grid.cellRanges.length - 1];
        range.anchor = { row: rect.top, column: grid.cols[rect.left].id }; range.end = { row: bottom, column: grid.cols[rect.right].id };
        crFill(grid, rect, rect.bottom + 1, bottom, rect.bottom - rect.top + 1, !!(pointer?.ctrlKey || pointer?.metaKey)).catch(error => grid.emit("error", { error }));
        crChanged(grid, false);
        crFocus(grid, range.anchor);
      } else crPaint(grid);
      crSwallowClick(grid);
    });
  }

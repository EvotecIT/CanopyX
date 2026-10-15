  // ---------- column fitting counts the formatting: icons, badges, cues and bars take room beside the value ----------
  // Column fitting measures text (33-grid-column-fit.js). A formatted cell also draws an icon, a badge, a cue or a bar, so
  // the part adds them to the column's measured need. A cell that carries a flag (an icon, a badge or a cue) must stay
  // readable: its full width becomes the column's floor while these rules apply, so a narrow grid hides a column by its
  // priority (and the phone's "+N" button names it) rather than cut a flagged value short. The floor is the column's minW,
  // put back before every measurement.
  const FORMAT_MEASURE = DataGrid.prototype.measureGridColumn;
  DataGrid.prototype.measureGridColumn = function (column) {
    if (column.formatMinW !== undefined) { column.minW = column.formatMinW; delete column.formatMinW; }
    const result = FORMAT_MEASURE.call(this, column);
    if (!this.formatCompiled || !this.formatCompiled.length || !this.fitContext || !this.fitFont) return result;
    const context = this.fitContext, [font, small, , pad] = this.fitFont, first = column === this.columns.find(item => !item.hidden);
    const measure = (text, face) => { context.font = face; return context.measureText(String(text).slice(0, 512)).width; };
    let need = 0, floor = 0, sampled = 0;
    for (const row of this.rowCache.values()) {
      if (sampled++ === 200) break;
      const formats = this.formatResult(row.h), own = formats && formats.cells.get(column.id), cues = first && formats && formats.row;
      if (!own && !cues) continue;
      let width = measure(cellText(row.h.cells[column.id], column, this.fmt) || "—", font), flag = false;
      for (const target of [own, cues]) if (target) {
        if (target.glyph) { width += 20; flag = true; }
        if (target.badge) { width += measure(target.badge, small) + 20; flag = true; }
        if (target.cue) { width += measure(target.cue, small) + 6; flag = true; }
        if (target.bar) width += 30;
      }
      width = Math.ceil(width + 2 * pad + 4); need = Math.max(need, width);
      if (flag) floor = Math.max(floor, width);
    }
    if (floor) { column.formatMinW = column.minW; column.minW = Math.max(column.minW || 0, Math.min(floor, 420)); }
    return need > result.width || floor > result.width ? Object.freeze({ ...result, width: Math.max(result.width, Math.min(Math.max(need, floor), 420)) }) : result;
  };
  // New or changed rules measure the columns again.
  DataGrid.prototype.formatRefit = function () { this.fitKey = null; if (this.sized && this.grid.clientWidth) this.applyWidths(); };

  // Grid default painting shares the core column policy with trees and records.
  const VALUE_PAINT = DataGrid.prototype.paintSlot;
  DataGrid.prototype.paintSlot = function (slot, row, column, index, wrapper) {
    VALUE_PAINT.call(this, slot, row, column, index, wrapper);
    if (!column.render) {
      const cell = row.cells[column.id], rule = columnNumericTone(column, cellValue(cell)), tone = columnValueTone(column, cell);
      if (tone) { applyTone(slot.cell, slot.base, toneOf(tone)); slot.cls = slot.cell.className; }
      if (rule) { slot.cell.title = rule.label; slot.title = rule.label; }
      setAttr(slot.cell,"aria-description",rule?.label || null);
    }
  };

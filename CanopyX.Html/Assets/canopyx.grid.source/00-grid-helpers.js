  // Capture neutral helpers before optional tree interaction subclasses wrap their replacements.
  // Flat views share these implementations, rather than inheriting checking, editing or tree state.
  const ROW_HELPERS = {};
  for (const name of ["buildHeader", "visibleColumns", "applyWidths", "setColumnWidth", "startResize", "cell", "newCell", "paintSlot", "paintBadges",
      "paintHostSlot", "setSlotContent", "setTimeZone", "rowCells", "heldCell", "restoreCell", "focusCell", "revealInRow", "revealInCell", "settleCell"])
    ROW_HELPERS[name] = TreeGrid.prototype[name];

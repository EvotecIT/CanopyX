  // Capture neutral helpers before optional tree interaction subclasses wrap their replacements.
  // Flat views share these implementations, rather than inheriting checking, editing or tree state.
  const ROW_HELPERS = {};
  const GRID_REPORTING = {};
  // Native editor and clipboard wall times must retain every requested component, including across local DST gaps.
  // Setters preserve years 0–99; the multi-argument Date constructor would silently add 1900 to them.
  function gridMomentFromParts(year, month, day, hours, minutes, seconds, local) {
    const parts = [year, month, day, hours, minutes, seconds];
    if (!parts.every(Number.isInteger)) return null;
    const moment = new Date(0), zone = local ? "" : "UTC";
    moment["set" + zone + "FullYear"](year, month - 1, day);
    moment["set" + zone + "Hours"](hours, minutes, seconds, 0);
    const actual = ["FullYear", "Month", "Date", "Hours", "Minutes", "Seconds"].map(name => moment["get" + zone + name]());
    actual[1]++;
    return parts.every((value, index) => value === actual[index]) ? moment : null;
  }
  function gridFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(gridFreeze); Object.freeze(value);
    }
    return value;
  }
  for (const name of ["buildHeader", "visibleColumns", "applyWidths", "setColumnWidth", "startResize", "cell", "newCell", "paintSlot", "paintBadges", "cellTip",
      "paintHostSlot", "setSlotContent", "setTimeZone", "rowCells", "heldCell", "restoreCell", "focusCell", "revealInRow", "revealInCell", "settleCell"])
    ROW_HELPERS[name] = TreeGrid.prototype[name];

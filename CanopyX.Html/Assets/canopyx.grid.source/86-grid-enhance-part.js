  // ---------- progressive enhancement and simple init come with a part ----------
  // CanopyX.enhance(table, options) turns an existing <table> into a grid; CanopyX.grid(element, options) builds one from a
  // table, plain data or a URL. Both load canopyx-enhance.js (Build/parts.json) and resolve with the grid's controller.
  const GRID_ENHANCE_IMPL = {}, GRID_ENHANCE = definePart(DataGrid, "enhance", "table enhancement", () => ({ DataGrid, GRID_ENHANCE_IMPL, PROTOCOL,
    createDataGrid, h, setText, gridQueryRows, gridCompare, gridResultShape, isIdentifier, GRID_REPORTING, loadPart, GRID_PAGER }));
  // The enhance part loads the pager part itself, after a table has left the page, so the pager stylesheet does not restyle it.
  const gridEnhancer = table => (target, options) => loadPart(GRID_ENHANCE).then(() => GRID_ENHANCE_IMPL.create(target, options, table));
  const GRID_API = { createDataGrid, createCalendar, enhance: gridEnhancer(true), grid: gridEnhancer(false) };

  // ---------- auto height: when every row fits, the grid is exactly as tall as its chrome, header and rows ----------
  // The host's own height stays the bound. A max-height equal to the content height removes the empty body below the
  // last row; longer results reach the bound and scroll inside it as before. Content height never depends on the
  // grid's own height, so the observer that calls this settles after one pass.
  const HEIGHT_RENDER = DataGrid.prototype.render;
  DataGrid.prototype.render = function () {
    const measured = HEIGHT_RENDER.call(this);
    if (this.sized && this.total !== this.fitTotal) { this.fitTotal = this.total; this.fitHeight(); }
    return measured;
  };
  DataGrid.prototype.fitHeight = function () {
    if (this.view.autoHeight === false || !this.sized || this.pendingQuery) return;
    // The host's own max-height, read before the first change, stays a bound; without rows the host's own value returns.
    const grid = this.grid, style = this.host.style, content = [...grid.children].reduce((sum, child) => sum + child.offsetHeight, grid.offsetHeight - grid.clientHeight);
    if (this.fitInline === undefined) { this.fitInline = style.maxHeight; this.fitMax = parseFloat(getComputedStyle(this.host).maxHeight) || Infinity; }
    const value = this.rowCount() ? Math.min(this.fitMax, Math.ceil(this.host.offsetHeight - grid.offsetHeight + content)) + "px" : this.fitInline;
    if (this.host.style.maxHeight !== value) this.host.style.maxHeight = value;
  };

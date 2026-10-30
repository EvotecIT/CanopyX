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
    if (this.view.autoHeight === false || this.pendingQuery || !this.grid.clientWidth || !this.host.checkVisibility()) return;
    // The host's own max-height, read before the first change, stays a bound for empty and populated results.
    // Preserve relative inline bounds; remeasure stylesheet bounds when the viewport changes.
    const grid = this.grid, style = this.host.style;
    // Only a real horizontal scrollbar consumes block space. Overlay scrollbars contribute zero, without a guessed gutter.
    // Width overflow can disappear before the occupied gutter is released during a column reset.
    const content = [...grid.children].reduce((sum, child) => {
      const position = getComputedStyle(child).position;
      return position === "absolute" || position === "fixed" ? sum : sum + child.getBoundingClientRect().height;
    }, grid.offsetHeight - grid.clientHeight);
    if (this.fitInline === undefined) {
      // Alternate views restore the authored bound when they take ownership of the host.
      this.fitInline = style.maxHeight;
      global.addEventListener("resize", () => { this.fitMax = undefined; this.fitHeight(); }, { signal: this.lifetime.signal });
    }
    if (this.fitMax === undefined) {
      const fitted = style.maxHeight;
      style.maxHeight = this.fitInline;
      const own = this.fitInline || getComputedStyle(this.host).maxHeight;
      style.maxHeight = fitted;
      this.fitMax = own === "none" ? null : own;
    }
    // Reuse the minimum's flow measurement without reserving rows in the empty state.
    const empty = !this.toolbar.hidden && this.host.classList.contains("cx-grid-awaiting");
    const height = Math.ceil(Math.max(empty ? 0 : this.host.getBoundingClientRect().height - grid.getBoundingClientRect().height, this.minimumGridHeight(false)) + content), bound = this.fitMax;
    const value = this.rowCount() || empty ? bound ? "min(" + height + "px, " + bound + ")" : height + "px" : this.fitInline;
    // Only release a minimum that empty fitting owned; populated alternate views keep their own sizing.
    if (empty || this.fitEmpty) style.setProperty("--cx-min-h", empty ? value : this.minimumGridHeight() + "px");
    this.fitEmpty = empty;
    if (style.maxHeight !== value) style.maxHeight = value;
  };

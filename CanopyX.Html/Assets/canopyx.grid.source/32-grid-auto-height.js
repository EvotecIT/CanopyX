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
    // Pixels bound the fit as a number; a relative bound (a percentage, calc()) stays CSS, so the browser keeps resolving it.
    const grid = this.grid, style = this.host.style;
    // Only a real horizontal scrollbar consumes block space. Overlay scrollbars contribute zero, without a guessed gutter.
    // Width overflow can disappear before the occupied gutter is released during a column reset.
    const content = [...grid.children].reduce((sum, child) => {
      const position = getComputedStyle(child).position;
      return position === "absolute" || position === "fixed" ? sum : sum + child.getBoundingClientRect().height;
    }, grid.offsetHeight - grid.clientHeight);
    if (this.fitMax === undefined) {
      const own = getComputedStyle(this.host).maxHeight;
      this.fitMax = own === "none" ? Infinity : /^-?[\d.]+px$/.test(own) ? parseFloat(own) : own;
    }
    // Reuse the minimum's flow measurement without reserving rows in the empty state.
    const empty = !this.notice.hidden && this.notice.classList.contains("cx-state");
    const height = Math.ceil(this.minimumGridHeight(false) + content), bound = this.fitMax;
    const value = typeof bound === "number" ? Math.min(bound, height) + "px" : "min(" + height + "px, " + bound + ")";
    const minimum = empty ? value : this.minimumGridHeight() + "px";
    if (style.getPropertyValue("--cx-min-h") !== minimum) style.setProperty("--cx-min-h", minimum);
    if (style.maxHeight !== value) style.maxHeight = value;
  };

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
    // The host's own max-height, read before the first change, stays a bound; without rows the host's own value returns.
    // Pixels bound the fit as a number; a relative bound (a percentage, calc()) stays CSS, so the browser keeps resolving it.
    const grid = this.grid, style = this.host.style, box = grid.getBoundingClientRect(), computed = getComputedStyle(grid);
    const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
    // Only a real horizontal scrollbar consumes block space. Overlay scrollbars contribute zero, without a guessed gutter.
    const scrollbar = grid.scrollWidth > grid.clientWidth ? Math.max(0, grid.offsetHeight - grid.clientHeight - borders) : 0;
    const content = [...grid.children].reduce((sum, child) => sum + child.getBoundingClientRect().height, borders + scrollbar);
    if (this.fitInline === undefined) {
      const own = getComputedStyle(this.host).maxHeight;
      this.fitInline = style.maxHeight; this.fitMax = own === "none" || !own ? Infinity : /^-?[\d.]+px$/.test(own) ? parseFloat(own) : own;
    }
    // Chrome can grow beyond the old fitted host before its flex body has room again.
    const hostStyle = getComputedStyle(this.host);
    const chrome = [...this.host.children].filter(child => child !== grid).reduce((sum, child) => {
      const css = getComputedStyle(child);
      return css.position === "absolute" || css.position === "fixed" ? sum : sum + child.getBoundingClientRect().height;
    }, parseFloat(hostStyle.borderTopWidth) + parseFloat(hostStyle.borderBottomWidth) + parseFloat(hostStyle.paddingTop) + parseFloat(hostStyle.paddingBottom));
    const height = Math.ceil(Math.max(this.host.getBoundingClientRect().height - box.height, chrome) + content), bound = this.fitMax;
    const value = !this.rowCount() ? this.fitInline : typeof bound === "number" ? Math.min(bound, height) + "px" : "min(" + height + "px, " + bound + ")";
    if (this.host.style.maxHeight !== value) this.host.style.maxHeight = value;
  };

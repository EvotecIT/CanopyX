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
    const grid = this.grid, style = this.host.style, box = grid.getBoundingClientRect(), computed = getComputedStyle(grid);
    const borders = parseFloat(computed.borderTopWidth) + parseFloat(computed.borderBottomWidth);
    // Only a real horizontal scrollbar consumes block space. Overlay scrollbars contribute zero, without a guessed gutter.
    // Width overflow can disappear before the occupied gutter is released during a column reset.
    const scrollbar = Math.max(0, grid.offsetHeight - grid.clientHeight - borders);
    const content = [...grid.children].reduce((sum, child) => {
      const position = getComputedStyle(child).position;
      return position === "absolute" || position === "fixed" ? sum : sum + child.getBoundingClientRect().height;
    }, borders + scrollbar);
    if (this.fitInline === undefined) {
      const own = getComputedStyle(this.host).maxHeight;
      this.fitInline = style.maxHeight; this.fitMax = own === "none" || !own ? Infinity : /^-?[\d.]+px$/.test(own) ? parseFloat(own) : own;
    }
    // Chrome can grow beyond the old fitted host before its flex body has room again.
    const hostStyle = getComputedStyle(this.host);
    const empty = !this.notice.hidden && this.notice.classList.contains("cx-state");
    const chrome = [...this.host.children].filter(child => child !== grid).reduce((sum, child) => {
      const css = getComputedStyle(child);
      if (empty && child === this.notice) {
        // The state flexes into the old viewport. Measure its content, not that allocated height,
        // so repeated observer passes cannot feed the previous height back into the fit.
        const items = [...child.children].filter(item => {
          const itemStyle = getComputedStyle(item);
          return itemStyle.display !== "none" && itemStyle.position !== "absolute" && itemStyle.position !== "fixed";
        });
        const natural = items.reduce((height, item) => {
          const itemStyle = getComputedStyle(item);
          return height + item.getBoundingClientRect().height + (parseFloat(itemStyle.marginTop) || 0) + (parseFloat(itemStyle.marginBottom) || 0);
        }, parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth)
          + Math.max(0, items.length - 1) * (parseFloat(css.rowGap) || 0));
        return sum + Math.max(parseFloat(css.minHeight) || 0, natural);
      }
      return css.position === "absolute" || css.position === "fixed" ? sum : sum + child.getBoundingClientRect().height;
    }, parseFloat(hostStyle.borderTopWidth) + parseFloat(hostStyle.borderBottomWidth) + parseFloat(hostStyle.paddingTop) + parseFloat(hostStyle.paddingBottom));
    const height = Math.ceil((empty ? chrome : Math.max(this.host.getBoundingClientRect().height - box.height, chrome)) + content), bound = this.fitMax;
    const value = typeof bound === "number" ? Math.min(bound, height) + "px" : "min(" + height + "px, " + bound + ")";
    // The resize minimum reserves visible data rows. An empty state owns its intrinsic
    // minimum instead: no extra data row, and enough room even when the authored height is shorter.
    if (empty && style.getPropertyValue("--cx-min-h") !== value) style.setProperty("--cx-min-h", value);
    if (this.host.style.maxHeight !== value) this.host.style.maxHeight = value;
  };

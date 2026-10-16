  // ---------- tree tools: auto height ----------
  // A tree whose visible rows fit is exactly as tall as its toolbar, header and rows: a max-height equal to that content
  // height removes the empty body below the last row. Longer trees reach the host's own height and scroll inside it, as
  // before. Expanding and collapsing change the rows; the height follows once they settle (debounced), and the content
  // height never depends on the tree's own height, so the observers that call this settle after one pass. view.autoHeight
  // false keeps the host's height.
  const TREE_HEIGHT_DELAY = 60;

  Object.assign(TreeGrid.prototype, {
    watchHeight() {
      if (!this.fitReady || this.view.autoHeight === false || this.total === this.heightTotal) return;
      this.heightTotal = this.total;
      clearTimeout(this.heightTimer);
      // Fit the first measurable rows before their first paint. Delaying that initial shrink can move the page
      // between a reader's pointer press and release; later expansion changes still settle through the debounce.
      if (!this.heightFitted) { this.fitHeight(); return; }
      this.heightTimer = setTimeout(() => this.destroyed || this.fitHeight(), TREE_HEIGHT_DELAY);
    },

    fitHeight() {
      const grid = this.grid, style = this.host.style;
      if (!grid.clientWidth) { this.heightTotal = undefined; return; }
      // The host's own max-height, read before the first change, stays a bound; without rows the host's own value returns.
      if (this.heightInline === undefined) {
        this.heightInline = style.maxHeight; this.heightMax = parseFloat(getComputedStyle(this.host).maxHeight) || Infinity;
        this.lifetime.signal.addEventListener("abort", () => { clearTimeout(this.heightTimer); style.maxHeight = this.heightInline; }, { once: true });
      }
      const content = [...grid.children].reduce((sum, child) => sum + child.offsetHeight, grid.offsetHeight - grid.clientHeight);
      const value = this.rows.length ? Math.min(this.heightMax, Math.ceil(this.host.offsetHeight - grid.offsetHeight + content)) + "px" : this.heightInline;
      if (style.maxHeight !== value) style.maxHeight = value;
      // An empty or hidden host must not consume the first fit of actual rows when data or visibility arrives.
      if (this.rows.some(row => !row.status)) this.heightFitted = true;
    }
  });

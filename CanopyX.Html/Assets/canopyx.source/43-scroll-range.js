  // ---------- logical scroll offsets over a bounded native scrollbar ----------
  // Rows keep their real heights. Only the scrollbar's range is scaled; the rendered window is translated
  // relative to its logical top, avoiding browser limits on element heights and transform coordinates.
  const NATIVE_HEIGHT = 8000000;

  const ROW_SCROLLING = {
    scrollRange() {
      const view = Math.max(0, this.grid.clientHeight - this.head.offsetHeight);
      return { logical: Math.max(0, this.total - view), native: Math.max(0, NATIVE_HEIGHT - view) };
    },

    logicalTop() {
      const physical = this.grid.scrollTop;
      if (!this.scaledScroll) return physical;
      const range = this.scrollRange();
      const point = this.scrollPosition;
      return Math.min(range.logical, point && point.native === physical ? point.logical :
        range.native ? physical * range.logical / range.native : 0);
    },

    setLogicalTop(value) {
      if (!this.scaledScroll) { this.grid.scrollTop = value; this.scrollPosition = null; return; }
      const range = this.scrollRange(), logical = Math.max(0, Math.min(range.logical, value));
      this.grid.scrollTop = range.logical ? logical * range.native / range.logical : 0;
      // Native offsets have finite precision. Preserve the requested logical offset even when two nearby
      // rows map to the same native pixel; wheel, touch, and keyboard movement still reach either row.
      this.scrollPosition = { native: this.grid.scrollTop, logical };
      this.scheduleRender(); this.stateChanged();
    },

    syncScrollRange(top) {
      const scaled = this.total > NATIVE_HEIGHT;
      this.canvas.style.height = Math.min(this.total, NATIVE_HEIGHT) + "px";
      if (scaled !== !!this.scaledScroll) {
        this.scaledScroll = scaled;
        this.canvas.toggleAttribute("data-cx-scaled", scaled);
        if (!this.onScaledWheel) {
          this.onScaledWheel = event => this.scaledWheel(event);
          this.onScaledTouchStart = event => {
            if (!event.defaultPrevented && event.touches.length === 1) {
              const touch = event.touches[0];
              this.touchScroll = { x: touch.clientX, y: touch.clientY, top: this.logicalTop(), left: this.grid.scrollLeft };
            } else this.touchScroll = null;
          };
          this.onScaledTouchMove = event => this.scaledTouch(event);
          this.onScaledTouchEnd = () => { this.touchScroll = null; };
        }
        const method = scaled ? "addEventListener" : "removeEventListener";
        this.grid[method]("wheel", this.onScaledWheel, { passive: false });
        this.grid[method]("touchstart", this.onScaledTouchStart, { passive: true });
        this.grid[method]("touchmove", this.onScaledTouchMove, { passive: false });
        this.grid[method]("touchend", this.onScaledTouchEnd);
        this.grid[method]("touchcancel", this.onScaledTouchEnd);
        this.touchScroll = null;
      }
      this.setLogicalTop(top);
    },

    scaledWheel(event) {
      if (event.defaultPrevented || event.ctrlKey || event.shiftKey || !event.deltaY || !event.cancelable) return;
      if (this.nestedScroll(event.target, event.deltaY)) return;
      const unit = event.deltaMode === 1 ? this.rowH : event.deltaMode === 2 ? this.grid.clientHeight - this.head.offsetHeight : 1;
      const top = this.logicalTop(), next = Math.max(0, Math.min(this.scrollRange().logical, top + event.deltaY * unit));
      if (next === top) return; // Preserve native scroll chaining at either boundary.
      event.preventDefault();
      this.grid.scrollLeft += event.deltaX * unit;
      this.setLogicalTop(next);
    },

    scaledTouch(event) {
      const start = this.touchScroll;
      if (!start || event.defaultPrevented || event.touches.length !== 1 || !event.cancelable) { this.touchScroll = null; return; }
      const touch = event.touches[0], dy = start.y - touch.clientY, dx = start.x - touch.clientX;
      if (Math.abs(dx) > Math.abs(dy)) return;
      if (this.nestedScroll(event.target, dy)) { this.touchScroll = null; return; }
      const next = Math.max(0, Math.min(this.scrollRange().logical, start.top + dy));
      if (next === this.logicalTop()) return;
      event.preventDefault(); this.grid.scrollLeft = start.left + dx; this.setLogicalTop(next);
    },

    nestedScroll(target, delta) {
      for (let element = target; element && element !== this.grid; element = element.parentElement) {
        if (element.clientHeight && element.scrollHeight > element.clientHeight &&
            /^(auto|scroll)$/.test(getComputedStyle(element).overflowY) &&
            (delta > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : element.scrollTop > 0)) return true;
      }
      return false;
    }
  };
  Object.assign(TreeGrid.prototype, ROW_SCROLLING);

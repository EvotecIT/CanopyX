  // ---------- grid lifetime and owned data release ----------
  Object.assign(TreeGrid.prototype, {
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.lifetime.abort();
      this.dataLifetime.abort();
      if (this.queryController) this.queryController.abort();
      if (this.restoreController) this.restoreController.abort();
      if (this.cancelResize) this.cancelResize();
      clearTimeout(this.saveTimer);
      clearTimeout(this.layoutTimer);
      if (this.cancelSearch) this.cancelSearch();
      if (this.disposeColumnChooser) this.disposeColumnChooser();
      if (this.disposeSearchFlyout) this.disposeSearchFlyout();
      cancelAnimationFrame(this.rafId);
      this.resizeObserver.disconnect();
      if (this.detailObserver) this.detailObserver.disconnect();
      this.grid.removeEventListener("scroll", this.onScroll);
      this.grid.removeEventListener("wheel", this.onScaledWheel);
      this.grid.removeEventListener("touchstart", this.onScaledTouchStart);
      this.grid.removeEventListener("touchmove", this.onScaledTouchMove);
      this.grid.removeEventListener("touchend", this.onScaledTouchEnd);
      this.grid.removeEventListener("touchcancel", this.onScaledTouchEnd);
      global.removeEventListener("beforeprint", this.onPrint);
      global.removeEventListener("hashchange", this.onHash);
      global.removeEventListener("popstate", this.onHash);
      if (this.linkOpening) this.linkOpening.abort();
      [this.toolbar, this.grid, this.live, this.outline].forEach(element => element.remove());
      this.host.classList.remove("cx-pin-tree");
      this.host.removeAttribute("data-cx-ready");
      this.host.removeAttribute("data-canopyx-mounted");
      this.keyMap.clear(); this.selected.clear(); this.rendered.clear(); this.pool.length = 0;
      if (this.inactiveCache) this.inactiveCache.clear();
      if (this.inlineRetained) this.inlineRetained.clear();
      this.rows = []; this.tops = [0]; this.total = 0;
      this.root.children = null; this.root.inlineCache = null; this.root.inlineOrder = null;
      this.focused = null; this.anchor = null; this.source = null; this.touchScroll = null;
      this.opts = {};
      for (const column of this.columns) column.render = null;
      this.filter = null; this.declaredFilter = null; this.pendingRestorationToggles = null;
      this.scrolledCell = null; this.focusHandoff = null;
      this.cancelResize = null; this.cancelSearch = null;
      this.disposeColumnChooser = null; this.disposeSearchFlyout = null;
      this.canvas.replaceChildren(); this.outline.replaceChildren();
    }
  });

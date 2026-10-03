  // ---------- permanent node retirement shared by reload and eviction ----------
  Object.assign(TreeGrid.prototype, {
    retireWrapper(w) {
      w._invalidated = true;
      this.retirePage(w);
      if (this.inlineRetained && this.inlineRetained.get(w.key) === w) this.inlineRetained.delete(w.key);
      if (this.inactiveCache) this.inactiveCache.delete(w);
      if (this.keyMap.get(w.key) === w) this.keyMap.delete(w.key);
      w.children = null; w.inlineCache = null; w.inlineOrder = null;
      const selected = this.selected.delete(w);
      if (this.anchor === w) this.anchor = null;
      return selected ? w : null;
    }
  });

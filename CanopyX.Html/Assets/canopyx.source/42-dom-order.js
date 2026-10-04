
  // ---------- shared virtual rows: DOM order ----------
  const ROW_DOM_ORDER = {
    // Screen readers in browse mode read rows in DOM order, so rows are kept (or put back) in visual order. The focused
    // row is never moved, because moving a focused element drops its focus. After in-place reuse the DOM is usually a
    // rotation of the visual order, and moving the smaller block keeps the number of restyled rows low.
    keepDomOrder(first, last, rows) {
      const ordered = [];
      const focusedIndex = rows.indexOf(this.focused);
      const focusedEl = focusedIndex >= 0 ? this.rendered.get(this.focused) : null;
      if (focusedEl && focusedIndex < first) {
        ordered.push(focusedEl);
      }
      for (let i = first; i <= last; i++) {
        const rowEl = this.rendered.get(rows.rowItem(i));
        if (rowEl) {
          ordered.push(rowEl);
        }
      }
      if (focusedEl && focusedIndex > last) {
        ordered.push(focusedEl);
      }
      const kids = [...this.canvas.children];
      const n = ordered.length;
      let inOrder = kids.length === n;
      for (let k = 0; inOrder && k < n; k++) {
        inOrder = kids[k] === ordered[k];
      }
      if (inOrder) {
        return;
      }
      if (kids.length === n && !focusedEl) {
        const shift = kids.indexOf(ordered[0]);
        let rotation = shift > 0;
        for (let k = 0; rotation && k < n; k++) {
          rotation = kids[(shift + k) % n] === ordered[k];
        }
        if (rotation) {
          if (shift <= n - shift) {
            for (let k = 0; k < shift; k++) {
              this.canvas.appendChild(kids[k]);
            }
          } else {
            for (let k = n - 1; k >= shift; k--) {
              this.canvas.insertBefore(kids[k], this.canvas.firstChild);
            }
          }
          return;
        }
      }
      const p = focusedEl ? ordered.indexOf(focusedEl) : -1;
      if (p < 0) {
        let node = this.canvas.firstChild;
        for (const rowEl of ordered) {
          if (node === rowEl) {
            node = node.nextSibling;
          } else {
            this.canvas.insertBefore(rowEl, node);
          }
        }
        return;
      }
      let ref = focusedEl;
      for (let k = p - 1; k >= 0; k--) {
        if (ordered[k].nextSibling !== ref) {
          this.canvas.insertBefore(ordered[k], ref);
        }
        ref = ordered[k];
      }
      let prev = focusedEl;
      for (let k = p + 1; k < ordered.length; k++) {
        if (prev.nextSibling !== ordered[k]) {
          this.canvas.insertBefore(ordered[k], prev.nextSibling);
        }
        prev = ordered[k];
      }
    }
  };
  Object.assign(TreeGrid.prototype, ROW_DOM_ORDER);

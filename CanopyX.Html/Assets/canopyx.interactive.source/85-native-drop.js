  // ---------- internal pointer drag/drop; the host executes every proposal ----------
  TreeGrid = class extends TreeGrid {
    build() {
      super.build();
      const signal = this.interactionUiLifetime.signal;
      this.grid.addEventListener("scroll", () => this.clearDropRow(), { signal, passive: true });
      this.grid.addEventListener("dragstart", event => {
        const row = event.target.closest(".cx-row");
        if (!row || hostControl(event.target) || !event.dataTransfer || !this.markMove(row._w)) { event.preventDefault(); return; }
        this.dragLease = this.moveNodes;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-canopyx-move", this.id);
      }, { signal });
      this.grid.addEventListener("dragover", event => {
        const row = event.target.closest(".cx-row");
        if (this.dragLease && event.dataTransfer && Array.from(event.dataTransfer.types).includes("application/x-canopyx-move") && row && this.moveTarget(row._w)) {
          event.preventDefault(); event.dataTransfer.dropEffect = "move";
          if (this.dropRow !== row) { this.clearDropRow(); this.dropRow = row; row.classList.add("cx-drop-target"); }
          row.setAttribute("data-cx-drop-placement", this.dropPlacement(event, row));
        } else this.clearDropRow();
      }, { signal });
      this.grid.addEventListener("drop", event => {
        const row = event.target.closest(".cx-row");
        if (!this.dragLease || !event.dataTransfer || event.dataTransfer.getData("application/x-canopyx-move") !== this.id || !row || !this.moveTarget(row._w)) return;
        event.preventDefault();
        const placement = this.dropPlacement(event, row);
        this.clearDropRow(); this.dragLease = null; this.moveTo(row._w, placement, "pointer");
      }, { signal });
      this.grid.addEventListener("dragend", () => {
        this.clearDropRow();
        if (this.dragLease) { this.moveNodes = null; this.cacheDirty = true; }
        this.dragLease = null;
      }, { signal });
    }

    paintRowState(row, w) {
      super.paintRowState(row, w);
      row.draggable = !!(this.view.dragDrop && this.opts.onDrop && !w.status && !w.h.detail);
    }

    clearDropRow() {
      if (this.dropRow) { this.dropRow.classList.remove("cx-drop-target"); this.dropRow.removeAttribute("data-cx-drop-placement"); }
      this.dropRow = null;
    }

    dropPlacement(event, row) {
      const bounds = row.getBoundingClientRect(), fraction = (event.clientY - bounds.top) / bounds.height;
      return fraction < 0.25 ? "before" : fraction > 0.75 ? "after" : "inside";
    }

    destroy() { this.clearDropRow(); this.dragLease = null; super.destroy(); }
  };

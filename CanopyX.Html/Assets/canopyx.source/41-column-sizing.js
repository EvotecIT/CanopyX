
  // ---------- tree grid: column sizing ----------
  Object.assign(TreeGrid.prototype, {
    applyWidths() {
      let sum = 0;
      this.cols.forEach((column, i) => {
        this.headCells[i].style.width = column.width + "px";
        const grip = this.headCells[i].querySelector(".cx-resize");
        grip.setAttribute("aria-label", "Resize " + column.title);
        grip.setAttribute("aria-valuenow", String(column.width));
        grip.setAttribute("aria-valuetext", column.width + " pixels");
        sum += column.width;
      });
      this.rowWidth = sum;
      this.headRow.style.width = sum + "px";
      this.canvas.style.width = sum + "px";
      // A new column layout makes every row rebuild its cell skeleton once.
      this.layout = (this.layout || 0) + 1;
      this.version++;
      this.scheduleRender();
    },

    startResize(e, column) {
      if (this.destroyed || e.button !== 0) return;
      if (this.cancelResize) this.cancelResize();
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = column.width;
      const pointer = e.pointerId;
      const move = (ev) => {
        if (ev.pointerId !== pointer) return;
        column.width = Math.max(40, w0 + ev.clientX - x0);
        this.applyWidths();
      };
      const stop = () => {
        global.removeEventListener("pointermove", move);
        global.removeEventListener("pointerup", end);
        global.removeEventListener("pointercancel", end);
        global.removeEventListener("blur", stop);
        if (this.cancelResize === stop) this.cancelResize = null;
      };
      const end = (ev) => { if (ev.pointerId === pointer) stop(); };
      this.cancelResize = stop;
      global.addEventListener("pointermove", move);
      global.addEventListener("pointerup", end);
      global.addEventListener("pointercancel", end);
      global.addEventListener("blur", stop);
    }
  });

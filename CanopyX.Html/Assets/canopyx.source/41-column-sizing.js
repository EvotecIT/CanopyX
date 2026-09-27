
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
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = column.width;
      const move = (ev) => {
        column.width = Math.max(40, w0 + ev.clientX - x0);
        this.applyWidths();
      };
      const up = () => {
        global.removeEventListener("pointermove", move);
        global.removeEventListener("pointerup", up);
      };
      global.addEventListener("pointermove", move);
      global.addEventListener("pointerup", up);
    }
  });

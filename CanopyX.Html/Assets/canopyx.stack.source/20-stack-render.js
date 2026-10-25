  Object.assign(DataGrid.prototype, {
    stackTitle(layer) {
      const stack = this.stack, row = stack.settings.records.get(layer.record), column = this.columns.find(column => column.id === stack.settings.titleColumn);
      return cellText(row.cells[column.id], column, this.fmt) || row.id;
    },
    stackRecordButton(layer) {
      const button = stackRecordTemplate(this.stackTitle(layer));
      button.addEventListener("click", () => this.openRecord(layer.record, { returnFocus: button }).catch(error => { this.setNotice(error.message, true); this.emit("error", { error }); }));
      return button;
    },
    stackPaint() {
      const stack = this.stack, frame = this.stackFrame, layers = stack.settings.layers;
      const held = document.activeElement, focusLayer = frame.contains(held) ? held.closest("[data-cx-stack-layer]")?.dataset.cxStackLayer : null;
      frame.replaceChildren();
      const list = stackFrameTemplate.call(this, stack, frame, layers, layer => this.stackRecordButton(layer), (title, list, index) => {
        title.addEventListener("keydown", event => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          const next = event.key === "Home" ? 0 : event.key === "End" ? layers.length - 1 : event.key === "ArrowDown" ? Math.min(layers.length - 1, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1) : null;
          if (next !== null) { event.preventDefault(); list.children[next].querySelector("button").focus(); }
        });
      });
      if (!list) return;
      if (focusLayer) [...list.children].find(item => item.dataset.cxStackLayer === focusLayer)?.querySelector("button").focus({ preventScroll: true });
    }
  });

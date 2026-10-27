  Object.assign(DataGrid.prototype, {
    pathPaint() {
      const path = this.path, settings = path.settings, labels = path.labels;
      const active = document.activeElement, held = this.pathFrame.contains(active) ? active.dataset.cxPathPosition : null;
      this.pathFrame.replaceChildren();
      pathFrameTemplate.call(this, settings, labels, (hop, index, chainIndex, total) => this.pathHop(hop, index, chainIndex, total));
      if (held) [...this.pathFrame.querySelectorAll("[data-cx-path-position]")].find(node => node.dataset.cxPathPosition === held)?.focus({ preventScroll: true });
    },
    pathHop(hop, index, chainIndex, total) {
      const path = this.path, labels = path.labels, row = path.settings.records.get(hop.record);
      const column = this.columns.find(column => column.id === path.settings.titleColumn), cell = row.cells[column.id];
      const text = cellText(cell, column, this.fmt) || row.id;
      const badges = [...(cell && typeof cell === "object" ? cell.badges || [] : []), ...(hop.badges || [])];
      const { item, title } = pathHopTemplate.call(this, hop, row, labels, text, badges, index, chainIndex, total);
      title.addEventListener("click", () => this.openRecord(row.id, { returnFocus: title }).catch(error => this.emit("error", { error })));
      title.addEventListener("keydown", event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const buttons = [...item.parentElement.querySelectorAll(".cx-path-title")];
        const target = event.key === "Home" ? buttons[0] : event.key === "End" ? buttons.at(-1) :
          ["ArrowLeft", "ArrowUp"].includes(event.key) ? buttons[index - 1] : ["ArrowRight", "ArrowDown"].includes(event.key) ? buttons[index + 1] : null;
        if (target) { event.preventDefault(); target.focus(); }
      });
      return item;
    }
  });

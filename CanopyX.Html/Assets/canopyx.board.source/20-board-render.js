  function boardItems(board, lane) {
    const group = board.settings.swimlaneColumn;
    if (!group) return lane.rows.map(row => ({ row, height: board.cardHeight }));
    const groups = new Map();
    for (const row of lane.rows) {
      const value = cellValue(row.cells[group]), key = boardKey(value, board.grid.columns.find(column => column.id === group));
      if (!groups.has(key)) groups.set(key, { label: value == null ? board.labels.boardUnassigned : boardText(board.grid, row, group), rows: [] });
      groups.get(key).rows.push(row);
    }
    return [...groups.values()].flatMap(item => [{ label: item.label, count: item.rows.length, height: board.groupHeight }, ...item.rows.map(row => ({ row, height: board.cardHeight }))]);
  }
  Object.assign(DataGrid.prototype, {
    boardPaint() {
      const board = this.board, held = document.activeElement?.closest("[data-cx-board-record]")?.dataset.cxBoardRecord;
      board.grid = this;
      const positions = new Map([...this.boardFrame.querySelectorAll(".cx-board-scroll")].map(node => [node.dataset.lane, node.scrollTop]));
      this.boardFrame.replaceChildren();
      Object.assign(board, boardMeasureTemplate(this.boardFrame));
      if (!board.lanes.some(lane => lane.key === board.lane)) board.lane = board.lanes[0]?.key;
      const picker = boardToolsTemplate.call(this, board);
      picker.addEventListener("change", () => { board.lane = picker.value; this.boardSyncLane(); this.stateChanged(); });
      const lanes = h("div", "cx-board-lanes"); this.boardFrame.appendChild(lanes);
      for (const lane of board.lanes) {
        const { section, scroll, canvas } = boardLaneTemplate.call(this, board, lane, lanes);
        const items = boardItems(board, lane); let top = 0;
        for (const item of items) { item.top = top; top += item.height; }
        canvas.style.height = top + "px";
        const paint = () => {
          const focus = document.activeElement?.closest("[data-cx-board-record]"), preserve = focus && canvas.contains(focus) ? focus.dataset.cxBoardRecord : null;
          const from = board.printing ? 0 : Math.max(0, scroll.scrollTop - board.cardHeight), to = board.printing ? Infinity : scroll.scrollTop + (scroll.clientHeight || 440) + board.cardHeight;
          let low = 0, high = items.length;
          while (low < high) { const at = (low + high) >>> 1; if (items[at].top + items[at].height < from) low = at + 1; else high = at; }
          const fragment = document.createDocumentFragment();
          for (let at = low; at < items.length && items[at].top < to; at++) {
            const item = items[at], node = item.row ? this.boardCard(item.row, lane) : h("h4", "cx-board-swimlane");
            if (!item.row) setText(node, item.label + " · " + item.count);
            node.style.top = item.top + "px"; fragment.appendChild(node);
          }
          canvas.replaceChildren(fragment);
          if (preserve) [...canvas.querySelectorAll("[data-cx-board-record]")].find(node => node.dataset.cxBoardRecord === preserve)?.focus({ preventScroll: true });
        };
        scroll.addEventListener("scroll", paint, { passive: true }); scroll.scrollTop = positions.get(lane.key) || 0; lane.scroll = scroll; lane.items = items; lane.paint = paint;
        scroll.addEventListener("dragover", event => { if (board.drag && this.boardCanMove(board.drag, lane)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; section.classList.add("cx-board-drop"); } });
        scroll.addEventListener("dragleave", () => section.classList.remove("cx-board-drop"));
        scroll.addEventListener("drop", event => { event.preventDefault(); section.classList.remove("cx-board-drop"); if (board.drag) this.boardMove(board.drag.id, lane.key); board.drag = null; });
        if (!items.length) { const empty = h("p", "cx-board-empty"); setText(empty, board.labels.boardEmpty); canvas.appendChild(empty); }
        else paint();
      }
      this.boardSyncLane();
      if (held) this.boardFocus(held);
    },
    boardSyncLane() {
      for (const lane of this.boardFrame.querySelectorAll(".cx-board-lane")) lane.classList.toggle("cx-board-active", lane.dataset.lane === this.board.lane);
    },
    boardFocus(id) {
      const lane = this.board.lanes.find(item => item.rows.some(row => row.id === id)); if (!lane) return;
      this.board.lane = lane.key; this.boardSyncLane();
      const picker = this.boardFrame.querySelector(".cx-board-picker"); if (picker) picker.value = lane.key;
      const item = lane.items.find(item => item.row?.id === id);
      lane.scroll.scrollTop = Math.max(0, item.top - 8); lane.paint();
      [...lane.scroll.querySelectorAll("[data-cx-board-record]")].find(node => node.dataset.cxBoardRecord === id)?.focus({ preventScroll: true });
    },
    boardCard(row, lane) {
      const board = this.board, settings = board.settings, text = boardText(this, row, settings.titleColumn);
      const fields = settings.fields || this.columns.filter(column => !column.hidden && ![settings.column, settings.titleColumn, settings.swimlaneColumn].includes(column.id)).slice(0, 2).map(column => column.id);
      const values = fields.slice(0, 2).map(id => ({ title: this.columns.find(column => column.id === id).title, text: boardText(this, row, id) }));
      const { card, title } = boardCardTemplate.call(this, row, text, values);
      title.addEventListener("click", () => this.openRecord(row.id).catch(error => this.emit("error", { error })));
      if (settings.editable) {
        const options = board.lanes.map(target => ({ key: target.key, label: target.label, disabled: target.key !== lane.key && !this.boardCanMove(row, target) }));
        const disabled = board.pending.has(row.id) || this.editReadOnly || !!this.edit && !this.canEditCell(row, settings.column);
        const move = boardMoveTemplate(board.labels.boardMove + ": " + text, options, lane.key, disabled, card);
        move.addEventListener("change", () => { const key = move.value; move.value = lane.key; this.boardMove(row.id, key); });
        card.draggable = !move.disabled;
        card.addEventListener("dragstart", event => { board.drag = row; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", row.id); });
        card.addEventListener("dragend", () => { board.drag = null; for (const node of this.boardFrame.querySelectorAll(".cx-board-drop")) node.classList.remove("cx-board-drop"); });
      }
      card.addEventListener("keydown", event => {
        if (event.target !== card) return;
        if (event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault(); const target = board.lanes[board.lanes.indexOf(lane) + (event.key === "ArrowLeft" ? -1 : 1)]; if (target) this.boardMove(row.id, target.key);
        } else if (["ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault(); const target = lane.rows[lane.rows.indexOf(row) + (event.key === "ArrowUp" ? -1 : 1)]; if (target) this.boardFocus(target.id);
        } else if (event.key === "Enter") { event.preventDefault(); this.openRecord(row.id).catch(error => this.emit("error", { error })); }
      });
      return card;
    }
  });

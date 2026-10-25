  const BOARD_CARD_H = 152, BOARD_GROUP_H = 36;
  function boardItems(board, lane) {
    const group = board.settings.swimlaneColumn;
    if (!group) return lane.rows.map(row => ({ row, height: BOARD_CARD_H }));
    const groups = new Map();
    for (const row of lane.rows) {
      const value = cellValue(row.cells[group]), key = boardKey(value, board.grid.columns.find(column => column.id === group));
      if (!groups.has(key)) groups.set(key, { label: value == null ? board.labels.boardUnassigned : boardText(board.grid, row, group), rows: [] });
      groups.get(key).rows.push(row);
    }
    return [...groups.values()].flatMap(item => [{ label: item.label, count: item.rows.length, height: BOARD_GROUP_H }, ...item.rows.map(row => ({ row, height: BOARD_CARD_H }))]);
  }
  Object.assign(DataGrid.prototype, {
    boardPaint() {
      const board = this.board, held = document.activeElement?.closest("[data-cx-board-record]")?.dataset.cxBoardRecord;
      board.grid = this;
      const positions = new Map([...this.boardFrame.querySelectorAll(".cx-board-scroll")].map(node => [node.dataset.lane, node.scrollTop]));
      this.boardFrame.replaceChildren();
      if (!board.lanes.some(lane => lane.key === board.lane)) board.lane = board.lanes[0]?.key;
      const toolbar = h("div", "cx-board-tools"), label = h("label"), picker = h("select", "cx-board-picker");
      label.htmlFor = this.id + "-board-lane"; picker.id = label.htmlFor; setText(label, board.labels.boardLane);
      for (const lane of board.lanes) { const option = h("option"); option.value = lane.key; setText(option, lane.label + " (" + lane.rows.length + ")"); picker.appendChild(option); }
      picker.value = board.lane || ""; picker.addEventListener("change", () => {
        board.lane = picker.value; this.boardSyncLane(); this.stateChanged();
      });
      const help = h("p", "cx-board-help"); help.id = this.id + "-board-help"; setText(help, board.labels.boardKeys);
      toolbar.append(label, picker); this.boardFrame.append(toolbar, help);
      if (board.partial) { const warning = h("p", "cx-board-warning"); warning.setAttribute("role", "status"); setText(warning, fill(board.labels.boardPartial, { count: board.rows.length })); this.boardFrame.appendChild(warning); }
      const lanes = h("div", "cx-board-lanes"); this.boardFrame.appendChild(lanes);
      for (const lane of board.lanes) {
        const section = h("section", "cx-board-lane"), header = h("header", "cx-board-heading"), title = h("h3"), count = h("span", "cx-board-count");
        section.dataset.lane = lane.key; title.id = this.id + "-lane-" + board.lanes.indexOf(lane); setText(title, lane.label); section.setAttribute("aria-labelledby", title.id);
        setText(count, lane.wipLimit ? fill(board.labels.boardWip, { count: lane.count, limit: lane.wipLimit }) : String(lane.rows.length));
        count.title = lane.wipLimit ? fill(board.labels.boardWipFull, { lane: lane.label, limit: lane.wipLimit }) : lane.label;
        section.classList.toggle("cx-board-full", !!lane.wipLimit && lane.count >= lane.wipLimit); header.append(title, count); section.appendChild(header);
        const scroll = h("div", "cx-board-scroll"), canvas = h("div", "cx-board-canvas"); scroll.dataset.lane = lane.key;
        scroll.tabIndex = 0; scroll.setAttribute("aria-label", lane.label); scroll.appendChild(canvas); section.appendChild(scroll); lanes.appendChild(section);
        const items = boardItems(board, lane); let top = 0;
        for (const item of items) { item.top = top; top += item.height; }
        canvas.style.height = top + "px";
        const paint = () => {
          const focus = document.activeElement?.closest("[data-cx-board-record]"), preserve = focus && canvas.contains(focus) ? focus.dataset.cxBoardRecord : null;
          const from = board.printing ? 0 : Math.max(0, scroll.scrollTop - BOARD_CARD_H), to = board.printing ? Infinity : scroll.scrollTop + (scroll.clientHeight || 440) + BOARD_CARD_H;
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
      const board = this.board, settings = board.settings, card = h("article", "cx-board-card"), title = h("button", "cx-board-title");
      const text = boardText(this, row, settings.titleColumn); card.dataset.cxBoardRecord = row.id; card.tabIndex = 0;
      card.setAttribute("aria-label", text); card.setAttribute("aria-describedby", this.id + "-board-help"); title.type = "button"; setText(title, text); title.title = text;
      title.addEventListener("click", () => this.openRecord(row.id).catch(error => this.emit("error", { error }))); card.appendChild(title);
      const fields = settings.fields || this.columns.filter(column => !column.hidden && ![settings.column, settings.titleColumn, settings.swimlaneColumn].includes(column.id)).slice(0, 2).map(column => column.id);
      const details = h("dl", "cx-board-fields");
      for (const id of fields.slice(0, 2)) { const key = h("dt"), value = h("dd"), text = boardText(this, row, id); setText(key, this.columns.find(column => column.id === id).title); setText(value, text); value.title = text; details.append(key, value); }
      card.appendChild(details);
      if (settings.editable) {
        const move = h("select", "cx-board-move"); move.setAttribute("aria-label", board.labels.boardMove + ": " + text);
        for (const target of board.lanes) { const option = h("option"); option.value = target.key; option.disabled = target.key !== lane.key && !this.boardCanMove(row, target); setText(option, target.label); move.appendChild(option); }
        move.value = lane.key; move.disabled = board.pending.has(row.id) || this.editReadOnly || !!this.edit && !this.canEditCell(row, settings.column); move.addEventListener("change", () => { const key = move.value; move.value = lane.key; this.boardMove(row.id, key); }); card.appendChild(move);
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

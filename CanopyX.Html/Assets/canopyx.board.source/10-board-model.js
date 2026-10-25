  const BOARD_TEXT = { boardLane: "Lane", boardUnassigned: "Unassigned", boardEmpty: "No records in this lane",
    boardWip: "{count} / {limit}", boardWipFull: "{lane} has reached its work limit ({limit}).",
    boardMove: "Move to lane", boardMoved: "{title} moved to {lane}.", boardRejected: "Move was not accepted.",
    boardPending: "Waiting for the host to accept the move…", boardPartial: "Showing the first {count} records. Narrow the filters to see the rest.",
    boardKeys: "Use Alt+Left or Alt+Right to move between lanes; Up and Down to browse cards." };
  const boardKey = (value, column) => JSON.stringify(column ? gridScalar(value, column) : value ?? null);
  const boardText = (grid, row, id) => cellText(row.cells[id], grid.columns.find(column => column.id === id), grid.fmt);
  function boardScalar(value) { return value == null || ["string", "number", "boolean"].includes(typeof value) && (typeof value !== "number" || Number.isFinite(value)); }
  function boardSettings(grid) {
    const input = grid.view.board, known = id => typeof id === "string" && grid.columns.some(column => column.id === id);
    if (!input || !known(input.column) || input.titleColumn !== undefined && !known(input.titleColumn) ||
        input.swimlaneColumn !== undefined && (!known(input.swimlaneColumn) || input.swimlaneColumn === input.column) ||
        input.fields !== undefined && (!Array.isArray(input.fields) || input.fields.length > 8 || new Set(input.fields).size !== input.fields.length || input.fields.some(id => !known(id))) ||
        input.editable !== undefined && typeof input.editable !== "boolean" || grid.view.calendar || grid.cursor || grid.paged)
      throw new Error("CanopyX: a board needs known columns and continuous offset navigation, without a calendar.");
    const seen = new Set(), column = grid.columns.find(column => column.id === input.column);
    if (input.lanes !== undefined && (!Array.isArray(input.lanes) || input.lanes.length > 200 || input.lanes.some(lane => {
      if (!lane || !boardScalar(lane.value) || typeof lane.label !== "string" || !lane.label.trim() ||
          lane.wipLimit !== undefined && (!Number.isInteger(lane.wipLimit) || lane.wipLimit < 1 || lane.wipLimit > 100000)) return true;
      const key = boardKey(lane.value, column); if (seen.has(key)) return true; seen.add(key); return false;
    }))) throw new Error("CanopyX: board lanes need unique scalar values, labels and positive work limits.");
    if (input.editable && (!column.editable || grid.view.rowIdentity === "ordinal"))
      throw new Error("CanopyX: board moves need an editable lane column and stable record identities.");
    return { ...input, titleColumn: input.titleColumn || grid.columns.find(column => column.rowHeader)?.id || grid.columns.find(column => !column.hidden).id };
  }
  Object.assign(DataGrid.prototype, {
    startBoard() {
      if (this.board) return;
      const settings = boardSettings(this), labels = {};
      for (const [key, text] of Object.entries(BOARD_TEXT)) labels[key] = this.opts.labels?.[key] || this.view.labels?.[key] || text;
      const board = this.board = { settings, labels, rows: [], lanes: [], pending: new Set(), targets: new Map(), epoch: 0 };
      // Editing can install after this part; resolve its setter at call time for this board instance.
      this.setReadOnly = (...args) => { const result = DataGrid.prototype.setReadOnly.apply(this, args); this.boardPaint(); return result; };
      this.host.classList.add("cx-board-host"); this.grid.hidden = true;
      if (this.pager) this.pager.hidden = true;
      this.boardFrame = h("section", "cx-board"); this.boardFrame.setAttribute("aria-label", this.view.label);
      this.host.insertBefore(this.boardFrame, this.grid.nextSibling);
      this.host.addEventListener("canopyx:commit", () => this.boardReload(), { signal: this.lifetime.signal });
      window.addEventListener("beforeprint", () => { board.printing = true; this.boardPaint(); }, { signal: this.lifetime.signal });
      window.addEventListener("afterprint", () => { board.printing = false; this.boardPaint(); }, { signal: this.lifetime.signal });
      this.lifetime.signal.addEventListener("abort", () => this.boardFrame.remove(), { once: true });
    },
    async boardReload() {
      const board = this.board; if (!board || this.destroyed || !this.acceptedQuery) return;
      const epoch = ++board.epoch, signal = this.dataLifetime.signal, query = this.acceptedQuery;
      this.boardFrame.setAttribute("aria-busy", "true");
      try {
        let rows = [], total = 0;
        if (this.view.source.kind === "inline" && !this.opts.source) {
          if (this.view.rowData) await this.source.decoded;
          rows = gridQueryRows(this.view, query, new Map(this.columns.map(column => [column.id, column])));
          total = rows.length;
        } else {
          while (rows.length < 100000) {
            const request = gridQuery(this.view, { ...query, offset: rows.length, limit: Math.min(10000, 100000 - rows.length) });
            const page = validateGridPage(await this.requestPage(request, signal), this.view, request, this.snapshot);
            total = page.matched; rows.push(...page.items);
            if (rows.length >= total || !page.items.length) break;
          }
        }
        if (this.destroyed || signal.aborted || epoch !== board.epoch) return;
        board.rows = rows; board.partial = rows.length < total;
        const column = this.columns.find(column => column.id === board.settings.column);
        const lanes = new Map((board.settings.lanes || []).map(lane => [boardKey(lane.value, column), { ...lane, key: boardKey(lane.value, column), rows: [], count: 0 }]));
        for (const row of rows) {
          const value = cellValue(row.cells[board.settings.column]);
          if (!boardScalar(value)) throw new Error("CanopyX: a board lane cell must be scalar.");
          const key = boardKey(value, column);
          if (!lanes.has(key)) lanes.set(key, { key, value: value ?? null, label: value == null ? board.labels.boardUnassigned : boardText(this, row, board.settings.column), rows: [], count: 0 });
          lanes.get(key).rows.push(row);
        }
        // WIP describes the entire inline dataset, even while a search hides some cards.
        const countRows = this.view.source.kind === "inline" && !this.opts.source ? this.view.rows : rows;
        for (const row of countRows) { const lane = lanes.get(boardKey(cellValue(row.cells[board.settings.column]), column)); if (lane) lane.count++; }
        board.lanes = [...lanes.values()]; this.boardPaint();
      } catch (error) { if (!signal.aborted && !this.destroyed && epoch === board.epoch) { this.setNotice(error.message, true); this.emit("error", { error }); } }
      finally { if (epoch === board.epoch) this.boardFrame.setAttribute("aria-busy", "false"); }
    }
  });
  const BOARD_QUERY = DataGrid.prototype.setQuery;
  DataGrid.prototype.setQuery = async function (...args) {
    const result = await BOARD_QUERY.apply(this, args); if (this.board) await this.boardReload(); return result;
  };

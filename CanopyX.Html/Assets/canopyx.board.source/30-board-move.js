  Object.assign(DataGrid.prototype, {
    boardCanMove(row, lane) {
      const board = this.board;
      return !!board.settings.editable && !board.pending.has(row.id) && !this.pendingQuery && !this.editReadOnly && (!this.edit || this.canEditCell(row, board.settings.column)) &&
        lane.key !== boardKey(cellValue(row.cells[board.settings.column]), this.columns.find(column => column.id === board.settings.column)) && (!lane.wipLimit ||
          lane.count + [...board.targets.values()].filter(key => key === lane.key).length < lane.wipLimit);
    },
    async boardMove(id, key) {
      const board = this.board, row = board.rows.find(row => row.id === id), lane = board.lanes.find(lane => lane.key === key);
      if (!row || !lane) return false;
      if (!this.boardCanMove(row, lane)) {
        if (lane.wipLimit && lane.count >= lane.wipLimit) setText(this.live, fill(board.labels.boardWipFull, { lane: lane.label, limit: lane.wipLimit }));
        return false;
      }
      const epoch = this.queryEpoch, signal = this.dataLifetime.signal, revision = this.snapshot.revision, version = board.version;
      board.pending.add(id); board.targets.set(id, key); this.boardPaint(); setText(this.live, board.labels.boardPending);
      try {
        await this.loadEditing();
        if (this.edit.changes.has(id) || !this.canEditCell(row, board.settings.column)) return false;
        const proposal = { protocol: PROTOCOL, type: "gridCommit", view: this.view.id, revision,
          rows: [{ id, values: { [board.settings.column]: lane.value } }] };
        let response, answered = false;
        const detail = { id, column: board.settings.column, previous: cellValue(row.cells[board.settings.column]), value: lane.value,
          proposal: JSON.parse(JSON.stringify(proposal)), respondWith: answer => { if (answered) throw new Error("CanopyX: board move already answered."); answered = true; response = answer; } };
        const permitted = this.host.dispatchEvent(new CustomEvent("canopyx:boardMove", { detail, cancelable: true }));
        if (typeof this.opts.onBoardMove === "function") { const result = this.opts.onBoardMove(detail); if (result !== undefined && !answered) { response = result; answered = true; } }
        const writer = typeof this.edit.options.commit === "function" || typeof this.source.commit === "function";
        if (!permitted || (!answered && !writer)) return false;
        if (answered && await this.runGridHook(() => Promise.resolve(response), signal) !== true) return false;
        if (this.destroyed || signal.aborted || epoch !== this.queryEpoch || revision !== this.snapshot.revision || version !== board.version || this.edit.changes.has(id)) return false;
        const currentRow = board.rows.find(item => item.id === id);
        if (!currentRow || !this.canEditCell(currentRow, board.settings.column)) return false;
        // Another move can fill a lane while the host considers this proposal.
        const current = board.lanes.find(item => item.key === key);
        const otherMoves = [...board.targets].filter(([record, target]) => record !== id && target === key).length;
        if (!current || current.wipLimit && current.count + otherMoves >= current.wipLimit) return false;
        const record = JSON.parse(JSON.stringify(currentRow)), spec = this.edit.specs.get(board.settings.column);
        if (!this.editApply(id, spec, lane.value, "board", record)) return false;
        const result = await this.commitChanges({ ids: [id] });
        if (!result.ok) { this.revertChanges([id]); return false; }
        await this.boardReload(); this.boardFocus(id);
        setText(this.live, fill(board.labels.boardMoved, { title: boardText(this, row, board.settings.titleColumn), lane: lane.label }));
        return true;
      } catch (error) { if (!signal.aborted) this.emit("error", { error }); return false; }
      finally {
        board.pending.delete(id); board.targets.delete(id);
        if (!this.destroyed) { this.boardPaint(); if (boardKey(cellValue(board.rows.find(row => row.id === id)?.cells[board.settings.column]), this.columns.find(column => column.id === board.settings.column)) !== key) setText(this.live, board.labels.boardRejected); }
      }
    }
  });
  const BOARD_GET_STATE = DataGrid.prototype.getState, BOARD_READ_STATE = DataGrid.prototype.readGridState, BOARD_SET_STATE = DataGrid.prototype.setState;
  DataGrid.prototype.getState = function () { const state = BOARD_GET_STATE.call(this); if (this.board?.lane) state.board = { lane: this.board.lane }; return state; };
  DataGrid.prototype.readGridState = function (input) {
    const state = BOARD_READ_STATE.call(this, input);
    if (input.board !== undefined) {
      if (!input.board || typeof input.board.lane !== "string" || input.board.lane.length > 4096) throw new Error("CanopyX: invalid board state.");
      let value; try { value = JSON.parse(input.board.lane); } catch (_) { throw new Error("CanopyX: invalid board lane."); }
      if (!boardScalar(value)) throw new Error("CanopyX: invalid board lane.");
      state.board = { lane: input.board.lane };
    }
    return state;
  };
  DataGrid.prototype.setState = function (input, ...args) {
    const state = this.readGridState(input); if (this.board && state.board) this.board.lane = state.board.lane;
    return BOARD_SET_STATE.call(this, state, ...args);
  };

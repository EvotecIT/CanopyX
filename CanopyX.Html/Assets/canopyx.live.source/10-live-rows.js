  // ---------- live data: options, transactions and the batched update rate ----------
  // A transaction is { add, update, remove } (or a gridTransaction document, which the C# CanopyGridTransaction writes).
  // add takes complete rows, and a row whose id the grid already has replaces that row; update takes rows whose cells are
  // merged into the existing row's (a null cell clears it; tone, className, fields and detail replace the row's when given);
  // remove takes ids or rows. Within one transaction removes apply first, then adds, then updates. An update or remove of an
  // id the grid does not have is skipped and reported as missing, so a stream that races a removal keeps going.
  // With batchMs, changes queue and apply together at most once per that many milliseconds: later changes to the same row
  // merge with the queued ones, and every call's promise settles with the batch it joined.
  const LIVE_KEYS = new Set(["stableOrder", "flash", "batchMs", "pollMs", "load", "announce", "pauseWhenHidden"]);
  const LIVE_MAX_ROWS = 100000;

  /** The grid's live options: the view's live object, then the host's live option, checked. */
  function liveOptions(view, options) {
    const read = value => {
      if (value === undefined || value === true || value === false) return {};
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !LIVE_KEYS.has(key)))
        throw new Error("CanopyX: live takes stableOrder, flash, batchMs, pollMs, load, announce and pauseWhenHidden.");
      return value;
    };
    // live: false on the host keeps the view's live settings from applying; the live methods still work.
    const merged = options.live === false ? {} : { ...read(view.live), ...read(options.live) }, flash = merged.flash;
    const integer = (value, min, max) => value === undefined || Number.isInteger(value) && value >= min && value <= max;
    if (["stableOrder", "announce", "pauseWhenHidden"].some(key => merged[key] !== undefined && typeof merged[key] !== "boolean") ||
        !(flash === undefined || typeof flash === "boolean" || flash && typeof flash === "object" && Object.keys(flash).every(key => key === "durationMs") && integer(flash.durationMs, 100, 10000)) ||
        !integer(merged.batchMs, 0, 60000) || !(merged.pollMs === undefined || merged.pollMs === 0 || integer(merged.pollMs, 250, 86400000)) ||
        merged.load !== undefined && typeof merged.load !== "function")
      throw new Error("CanopyX: invalid live options.");
    return { stableOrder: merged.stableOrder !== false, flashMs: flash ? flash.durationMs || 1200 : 0, batchMs: merged.batchMs || 0,
      pollMs: merged.pollMs || 0, load: merged.load || null, announce: merged.announce !== false, pauseWhenHidden: merged.pauseWhenHidden !== false };
  }

  /** Checks a transaction and returns owned copies of its rows, without changing the grid. */
  function liveTransaction(grid, input) {
    if (input && typeof input === "object" && input.protocol !== undefined) {
      checkDocument(input, "gridTransaction");
      if (input.view !== grid.view.id) throw new Error("CanopyX: the transaction is for another grid.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["add", "update", "remove", "protocol", "type", "view"].includes(key)))
      throw new Error("CanopyX: a transaction is { add, update, remove }.");
    const list = name => {
      const value = input[name];
      if (value !== undefined && !Array.isArray(value)) throw new Error("CanopyX: transaction " + name + " takes an array.");
      return value || [];
    };
    if (list("add").length + list("update").length + list("remove").length > LIVE_MAX_ROWS) throw new Error("CanopyX: a transaction changes at most " + LIVE_MAX_ROWS + " rows.");
    const add = JSON.parse(JSON.stringify(list("add"))), update = JSON.parse(JSON.stringify(list("update")));
    const remove = list("remove").map(item => typeof item === "string" ? item : item && item.id);
    validateGridRows(add, grid.view.columns);
    const seen = new Set();
    for (const row of update) {
      requireIdentifier(row && row.id, "updated row ID");
      if (seen.has(row.id)) throw new Error("CanopyX: duplicate updated row ID " + row.id);
      seen.add(row.id);
      if (row.cells !== undefined && (!row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) || row.fields !== undefined && (!row.fields || typeof row.fields !== "object" || Array.isArray(row.fields)))
        throw new Error("CanopyX: invalid updated row.");
      const cells = {};
      for (const [id, cell] of Object.entries(row.cells || {})) if (cell !== null) cells[id] = cell;
      for (const id of Object.keys(row.cells || {})) if (!grid.view.columns.some(column => column.id === id)) throw new Error("CanopyX: undeclared grid column " + id);
      validateGridRows([{ id: row.id, cells, tone: row.tone ?? undefined, className: row.className ?? undefined }], grid.view.columns);
    }
    remove.forEach(id => requireIdentifier(id, "removed row ID"));
    for (const row of add) for (const [id, cell] of Object.entries(row.cells)) if (cell === null) delete row.cells[id];
    return { add, update, remove };
  }

  /** Merges a checked transaction into a queue of changes by row id (a Map), in the order the transaction applies. */
  function liveEnqueue(queue, change) {
    for (const id of change.remove) queue.set(id, { kind: "remove", id });
    for (const row of change.add) queue.set(row.id, { kind: "add", id: row.id, row });
    for (const row of change.update) {
      const queued = queue.get(row.id);
      if (queued?.kind === "remove") continue;
      if (!queued) { queue.set(row.id, { kind: "update", id: row.id, row }); continue; }
      const target = queued.row, cells = Object.assign(target.cells || (target.cells = {}), row.cells || {});
      if (queued.kind === "add") for (const [id, cell] of Object.entries(cells)) if (cell === null) delete cells[id];
      for (const name of ["tone", "className", "fields", "detail"]) if (row[name] !== undefined) target[name] = row[name];
    }
    return queue;
  }

  const liveSame = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  /** The cells of a row that differ between two versions of it, or "*" when the row is new. */
  function liveChangedColumns(before, after) {
    if (!before) return "*";
    const columns = new Set();
    for (const id of new Set([...Object.keys(before.cells), ...Object.keys(after.cells)])) if (!liveSame(before.cells[id], after.cells[id])) columns.add(id);
    return columns;
  }

  /** Whether two versions of a row carry the same cells, decoration, record fields and detail. */
  function liveSameRow(a, b) {
    return ["tone", "className", "fields", "detail"].every(name => liveSame(a[name], b[name])) && !liveChangedColumns(a, b).size;
  }

  /** A full replacement as a transaction: rows the grid lacks are added, changed rows replace theirs, the others go. */
  function liveDiff(rows, current) {
    const add = [], keep = new Set();
    for (const row of rows) {
      keep.add(row.id);
      const existing = current.get(row.id);
      if (!existing || !liveSameRow(existing, row)) add.push(row);
    }
    return { add, update: [], remove: [...current.keys()].filter(id => !keep.has(id)) };
  }

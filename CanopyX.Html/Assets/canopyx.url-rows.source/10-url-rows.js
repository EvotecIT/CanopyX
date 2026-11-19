  // ---------- url-rows part: reads an inline grid's rows from its source address (docs/data-protocol.md, "Rows from an address") ----------
  // The address answers an array of rows, or an object with a rows array, in the view's row format. The first query reads it
  // with same-origin credentials, and every query after that works on those rows in the browser. A failed read fails the query,
  // and its retry reads again. source.refreshSeconds reads the rows again while the page is visible and no query is pending,
  // and runs the reader's query again over them.
  function urlRowsSource(grid, outer) {
    const view = grid.view, address = gridRowsAddress(view.source.url);
    let inner = null, loading = null, timer = 0;
    const read = async signal => {
      const response = await fetch(address, { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
      if (!response.ok) throw new Error("CanopyX: the rows at " + view.source.url + " could not be read (HTTP " + response.status + ").");
      const data = await response.json(), rows = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray(data.rows) ? data.rows : null;
      if (!rows) throw new Error("CanopyX: the rows at " + view.source.url + " are not an array of rows.");
      return validateGridRows(rows, view.columns, undefined, repairGridCell);
    };
    const accept = rows => { view.rows = rows; inner = inlineGridSource(view); return inner; };
    let refreshing = false;
    const refresh = () => {
      if (grid.destroyed) { clearInterval(timer); return; }
      // One read at a time: a slow read is not overtaken by the next tick's.
      if (document.hidden || !inner || grid.pendingQuery || refreshing) return;
      refreshing = true;
      read(grid.lifetime?.signal).then(rows => {
        if (grid.destroyed || grid.pendingQuery) return;
        accept(rows);
        // The grouping part keeps the summary of a query and revision; the rows changed under the same revision.
        grid.summaryCandidate = null;
        grid.setQuery(gridQueryStart(grid.queryForChange(true)), grid.pendingPaging && { pageLength: grid.pendingPaging.pageLength, allRows: grid.pendingPaging.allRows })
          .catch(error => { if (error?.name !== "AbortError") grid.emit("error", { error }); });
      }, error => { if (error?.name !== "AbortError" && !grid.destroyed) grid.emit("error", { error }); }).finally(() => { refreshing = false; });
    };
    const ready = () => loading ||= read(grid.lifetime?.signal).then(rows => {
      if (grid.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
      if (view.source.refreshSeconds && !timer) {
        timer = setInterval(refresh, view.source.refreshSeconds * 1000);
        grid.lifetime?.signal.addEventListener("abort", () => clearInterval(timer), { once: true });
      }
      return accept(rows);
    }, error => { loading = null; outer.reset(); throw error; });
    return {
      query: (query, options) => ready().then(() => inner.query(query, options)),
      position: (query, id) => inner ? inner.position(query, id) : -1,
      row: id => inner ? inner.row(id) : null
    };
  }

  // Presentation bands read the final displayed columns; column layout and controls keep their ordinary behavior.
  const cgBandKey = grid => JSON.stringify(grid.cols.map(column => [column.id, column.effectivePin || "none"]));
  function cgInstallPresentation(grid) {
    const shared = Object.getPrototypeOf(grid);
    grid.buildHeader = function(...args) {
      this.groupCells = []; this.columnBandsBuilding = true;
      try { shared.buildHeader.apply(this, args); }
      finally { this.columnBandsBuilding = false; }
      cgHeader(this);
    };
    grid.applyWidths = function(...args) {
      shared.applyWidths.apply(this, args);
      if (this.columnBandsBuilding || !this.cols || this.headCells?.length !== this.cols.length) return;
      if (this.columnBandKey !== cgBandKey(this)) cgHeader(this);
      else cgLayout(this);
    };
    grid.lifetime.signal.addEventListener("abort", () => {
      grid.host.classList.remove("cx-column-groups"); grid.host.style.removeProperty("--cx-pin-left-w");
    }, { once: true });
    grid.buildHeader(); grid.render();
  }

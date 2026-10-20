  // ---------- the views a flow's pick steps embed (57-flow-pick.js) ----------
  // The grid entry points lend the flow part their grid and tree factories; the flow entry point carries neither, so its flows
  // have no pick steps. The reporting entry adds row checkboxes (selectionControls), which a picker turns on for its grid.
  const FLOW_GRID_VIEWS = Object.freeze({ grid: createDataGrid, tree: createTreeGrid,
    get reporting() { return typeof GRID_REPORTING === "object" && typeof GRID_REPORTING.api === "function"; } });


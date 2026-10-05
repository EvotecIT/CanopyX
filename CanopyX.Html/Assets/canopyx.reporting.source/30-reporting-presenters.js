  // Reporting uses the same presenter owner as ordinary grids and facets.
  const PRESENTERS_VALIDATE = GRID_REPORTING.validate;
  GRID_REPORTING.validate = view => {
    PRESENTERS_VALIDATE(view);
    const presenters = view.reporting.presenters;
    if (presenters === undefined) return;
    if (!presenters || typeof presenters !== "object" || Array.isArray(presenters)) throw new Error("CanopyX: presenters are keyed by declared column ID.");
    for (const [id,options] of Object.entries(presenters)) {
      const column = view.columns.find(item => item && item.id === id);
      if (!column) throw new Error("CanopyX: a presenter needs a declared column.");
      gridPresenter(options,column,view.columns);
    }
  };

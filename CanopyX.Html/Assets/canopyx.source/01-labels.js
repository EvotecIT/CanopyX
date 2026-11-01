  // ---------- labels ----------
  // Every text the runtime writes itself, in English. A view document can carry translations in "labels", and a host
  // can pass more in the options; placeholders such as {count} are replaced. Host data (labels of nodes, column
  // titles, cells) is never translated here.
  let DEFAULT_LABELS = Object.freeze({
    searchPlaceholder: "Search", searchResults: "Search results", searchResultCount: "{count} results",
    searchResultCountOfTotal: "{count} of {total} results", searchResultCountOfMany: "{count} of many results",
    searchNoResults: "No results", searchTooShort: "Type at least {min} characters",
    searchWordTooShort: "Type a word of at least {min} characters", searchFailed: "Search failed: {error}",
    columns: "Columns", hiddenColumns: "[one]+{count} column[other]+{count} columns", visibleColumns: "Visible columns", resizeColumn: "Resize {column}", columnWidth: "{width} pixels",
    loading: "Loading…", loadError: "Could not load: {error} (Enter to retry)",
    queryFailed: "Could not update the view: {error}",
    showMore: "Show more ({loaded} of {total} loaded)", showMoreUnknownTotal: "Show more ({loaded} loaded)",
    pageLoaded: "{loaded} of {total} loaded", itemsLoaded: "{count} items", yes: "Yes", no: "No",
    utcTime: "{time} UTC", localTime: "{time} local time", mountError: "This view could not be displayed: {error}"
  });

  /** The labels of a grid: the English defaults, then the view's, then the host's. A name CanopyX does not know is a mistake. */
  function labelsFor(...sources) {
    const labels = Object.assign({}, DEFAULT_LABELS);
    for (const source of sources) {
      if (source == null) continue;
      if (typeof source !== "object" || Array.isArray(source)) throw new Error("CanopyX: labels must be an object of strings.");
      Object.keys(source).forEach((name) => {
        // Parts that carry the English defaults of their own labels: forms and editing (gridEdit…), conditional formatting (format…),
        // the calendar (calendar…), flows (flow…), the matrix (matrix…) and the change views (change…), so a whole label pack applies to any view.
        // Standalone UI parts likewise carry their own defaults; accept their known names before those parts load.
        const uiLabel = /^(?:accordion[A-Z]\w+|tabs(?:More(?:Selected)?|ScrollPrevious|ScrollNext|Section|Position|Pause|Play|MotionDisabled)|stepper(?:StepOf|Back|Next|Finish|Skip|SaveDraft|AllSteps|Optional|Completed|Skipped|Issues?)|dialogClose|drawer(?:Close|Previous|Next)|state(?:Loading|Retry|Details))$/.test(name);
        if (!Object.hasOwn(DEFAULT_LABELS, name) && !/^(?:gridEdit|format|calendar|flow|matrix|change|board|plan|path|stack|time|compare|viewIntent)[A-Z]\w{0,63}$/.test(name) && !uiLabel) throw new Error("CanopyX: there is no label '" + name + "'.");
        if (typeof source[name] !== "string" || !/\S/.test(source[name])) throw new Error("CanopyX: label '" + name + "' must be a string with visible text.");
        if ((name === "utcTime" || name === "localTime") && source[name].indexOf("{time}") < 0) throw new Error("CanopyX: label '" + name + "' must hold {time}.");
        labels[name] = source[name];
      });
    }
    return Object.freeze(labels);
  }

  // ---------- linked views: the link part (canopyx.link.source) ----------
  // Another view on the page (a chart, another grid) can filter or highlight this one: an external filter combines with
  // the reader's own filters and shows as a removable chip, and a highlight marks rows without filtering them. A view
  // with the linkEvents option also reports its selection and its own filters as neutral canopyx:linkchange payloads.
  // The code comes with the link part, loaded by the first of these methods or by linkEvents; the getters answer
  // without it.
  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    linkFilteredBy: "Filtered by {source}: {values}", linkRemoveFilter: "Remove the filter from {source}: {values}",
    linkFiltered: "Filtered by {source}: {count} rows", linkHighlighted: "{count} rows highlighted from {source}", linkHighlightedRows: "{count} rows highlighted",
    linkCleared: "Linked filters removed"
  }));
  const LINK_IMPL = { TreeGrid, queryOwn: Symbol("own conditions") }, LINK_PART = definePart(TreeGrid, "link", "linked views", () => ({ LINK_IMPL, h, setText, fill, numberFormat,
    cellValue, setAttr, cellMatches }));
  const LINK_METHODS = ["setExternalFilter", "clearExternalFilters", "setHighlight", "clearHighlight", "startLinkEvents"];
  /** Gives a view kind the link methods: each loads the part, which replaces them, and runs again. */
  function linkMethods(View) {
    // The stubs are marked, so a feature can tell whether the part is in (the record panel's Open all in grid uses it then).
    for (const name of LINK_METHODS) (View.prototype[name] = function (...args) {
      return this.destroyed ? Promise.resolve(/Highlight/.test(name) ? 0 : name === "startLinkEvents" ? undefined : false) : loadPart(LINK_PART).then(() => this[name](...args));
    }).linkStub = true;
    View.prototype.getExternalFilters = function () { return (this.linkCommitted || []).map(item => JSON.parse(JSON.stringify(item))); };
    View.prototype.getHighlight = function () { return Array.from(this.linkHighlight || []); };
    View.prototype.linkStart = function () {
      if (this.opts.linkEvents === true) return loadPart(LINK_PART).then(() => this.linkWatch()).catch(error => { this.emit("error", { error }); throw error; });
    };
  }
  linkMethods(TreeGrid);
  // A flat grid's plugins can require the part as well (requirePart reads its view kind's parts).
  function linkGridPart(View) { (Object.hasOwn(View.prototype, "parts") ? View.prototype.parts : View.prototype.parts = {}).link = LINK_PART; }
  /** Requested link events are installed before a host observes the ready API. */
  function linkReady(grid, ready) { return Promise.all([ready, grid.linkStart()]).then(([result]) => result); }
  /** The link methods of a grid's public API. */
  function linkApi(grid) {
    const api = {};
    for (const name of LINK_METHODS.concat("getExternalFilters", "getHighlight")) api[name] = (...args) => grid[name](...args);
    return api;
  }

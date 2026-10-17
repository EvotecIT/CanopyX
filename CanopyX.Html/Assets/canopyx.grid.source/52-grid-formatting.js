  // ---------- conditional formatting comes with a part (docs/conditional-formatting.md) ----------
  // Evaluation, painting, the legend and the rule API ship in canopyx-formatting.js, the rule editor in
  // canopyx-format-editor.js. A grid whose view declares formatRules or formatting loads the part with its first query and
  // is ready once both are (50-grid-state.js); the API methods load it on first use. A saved view keeps its own rules: the
  // core carries them through readGridState untouched, and the part validates them when the view is applied. A grid whose
  // part cannot load keeps every other feature and reports the error.
  const GRID_FORMAT = definePart(DataGrid, "formatting", "conditional formatting", () => ({ DataGrid, h, setText, setClass, fill, gridFreeze, gridDateInputMoment,
    cellValue, cellText, foldText, toneOf, numberFormat, gridButton, gridOption, gridInputLabel, gridIcon, gridDecorateButton, GRID_REPORTING, loadPart,
    definePart, announceMenu, boundedPattern, wildcardMatch, svgIcon }));
  Object.assign(DataGrid.prototype, {
    loadFormatting() { return this.formatLoad ||= loadPart(GRID_FORMAT).then(() => this.startFormatting(), error => { this.formatLoad = null; throw error; }); },
    setFormatRules(rules) { return this.loadFormatting().then(() => this.setFormatRules(rules)); },
    validateFormatRules(rules) { return this.loadFormatting().then(() => this.validateFormatRules(rules)); },
    openFormatRules() { return this.loadFormatting().then(() => this.openFormatRules()); },
    getFormatRules() { return gridFreeze(JSON.parse(JSON.stringify(this.formatRules || this.view.formatRules || []))); }
  });

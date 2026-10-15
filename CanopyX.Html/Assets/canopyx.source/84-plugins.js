  // ---------- plugins: page-wide and per-grid extensions (docs/plugins.md) ----------
  // A plugin is { name, requires?, views?, init?, destroy?, cellRenderers?, columnTypes?, editors?, toolbarItems?, menuItems?,
  // exportFormats?, events?, detailRenderers?, drawerSections?, recordActions? }. CanopyX.use registers one for every grid and tree created afterwards; the plugins option adds
  // one to a single grid, replacing a page plugin of the same name. A grid subscribes its plugins' events and destroy hooks
  // as it is created, then starts them in requires order: the parts a plugin requires are loaded, then init runs with the
  // plugin context. The grid's ready waits for its plugins; a plugin that fails is reported as the grid's error event.
  const PLUGINS = new Map();
  function plugin(value) {
    const item = Object.freeze({ ...value }), fn = handler => typeof handler === "function";
    // A toolbar item runs; a menu entry runs or, on the reporting runtime, renders content.
    const entry = menu => action => action && typeof action.label === "string" && (fn(action.run) || menu && fn(action.render));
    if (!value || !partName(item.name) || PARTS[item.name] || [item.init, item.destroy].some(hook => hook !== undefined && !fn(hook)) ||
        ["requires", "views", "toolbarItems", "menuItems", "exportFormats", "recordActions"].some(key => item[key] !== undefined && !Array.isArray(item[key])) ||
        ["cellRenderers", "columnTypes", "editors", "events", "aggregates", "detailRenderers", "drawerSections"].some(key => item[key] !== undefined && Object(item[key]) !== item[key]) ||
        !(item.requires || []).every(partName) || !(item.views || []).every(kind => kind === "tree" || kind === "grid") ||
        ![...Object.values(item.cellRenderers || {}), ...Object.values(item.events || {}), ...Object.values(item.detailRenderers || {}), ...Object.values(item.drawerSections || {})].every(fn) ||
        !(item.toolbarItems || []).every(entry()) || !(item.recordActions || []).every(entry()) || !(item.menuItems || []).every(entry(true)))
      throw new Error("CanopyX: invalid plugin '" + item.name + "'.");
    item.exportFormats?.forEach(exportFormat);
    return item;
  }
  /** Registers a plugin for the grids and trees created from now on; returns a disposer for this registration. */
  function use(value) {
    const item = plugin(value);
    if (PLUGINS.has(item.name)) throw new Error("CanopyX: plugin '" + item.name + "' is already registered.");
    PLUGINS.set(item.name, item);
    const formats = item.exportFormats?.map(registerExportFormat) || [];
    return () => { if (PLUGINS.get(item.name) === item) { PLUGINS.delete(item.name); formats.forEach(dispose => dispose()); } };
  }
  /** The plugins of a new grid or tree of a kind, required plugins first; a required name is a plugin or a part. */
  function viewPlugins(options, kind) {
    const byName = new Map(PLUGINS), ordered = [], visiting = new Set(), applies = item => !item.views || item.views.includes(kind);
    for (const value of options.plugins || []) { const item = plugin(value); byName.set(item.name, item); }
    const visit = item => {
      if (ordered.includes(item) || !applies(item)) return;
      if (visiting.has(item)) throw new Error("CanopyX: plugin '" + item.name + "' requires itself.");
      visiting.add(item);
      for (const name of item.requires || []) {
        const required = byName.get(name);
        if (required && applies(required)) visit(required);
        else if (!PARTS[name]) throw new Error("CanopyX: plugin '" + item.name + "' requires '" + name + "', which is neither a plugin nor a part.");
      }
      ordered.push(item);
    };
    byName.forEach(visit);
    return ordered;
  }
  /** Runs a grid's plugins; api returns the grid's API once it exists. Resolves with the grid's own ready result. */
  function startPlugins(grid, api) {
    if (!grid.plugins.length) return grid.ready;
    const signal = grid.lifetime.signal, contexts = grid.plugins.map(item => {
      const context = Object.freeze({ get api() { return api(); }, element: grid.host, view: grid.view, kind: grid.kind, labels: grid.labels, signal,
        part: name => grid.requirePart(name) });
      for (const [name, handler] of Object.entries(item.events || {})) grid.host.addEventListener("canopyx:" + name, event => handler(event, context), { signal });
      if (item.destroy) signal.addEventListener("abort", () => item.destroy(context), { once: true });
      return context;
    });
    const started = Promise.resolve().then(async () => {
      for (const [index, item] of grid.plugins.entries()) {
        if (signal.aborted) return;
        try {
          for (const name of item.requires || []) if (!grid.plugins.some(other => other.name === name)) await grid.requirePart(name);
          if (!signal.aborted) await item.init?.(contexts[index]);
        } catch (error) { grid.emit("error", { error }); }
      }
    });
    return Promise.all([grid.ready, started]).then(([result]) => result);
  }
  // Menu entries and toolbar items of the grid's plugins, after the host's own actions.
  function pluginItems(grid, key) { return grid.plugins.flatMap(item => item[key] || []); }

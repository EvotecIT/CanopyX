  // ---------- tree tools: row activation, a host hook before the tree's own Enter and double-click actions ----------
  // Enter on a node row (select, and toggle) and a double click (toggle) activate it. The host hears first: the cancelable
  // canopyx:rowActivate event ({ id, node, keyboard }) and onRowActivate(node, { keyboard }), returning false, keep the tree's
  // own action from running, so a host can open its own view of the node instead. Space, the expander and status rows
  // (retry, show more) keep their actions.
  const TREE_ACTIVATION = { activate: TreeGrid.prototype.activate, onDblClick: TreeGrid.prototype.onDblClick };
  Object.assign(TreeGrid.prototype, {
    // As on a flat grid, both the event and the callback hear every activation, and a failing callback is logged.
    rowActivated(w, keyboard) {
      const callback = this.opts.onRowActivate;
      let go = this.host.dispatchEvent(new CustomEvent("canopyx:rowActivate", { detail: { id: w.key, node: w.h, keyboard }, bubbles: true, cancelable: true }));
      if (typeof callback === "function") {
        try { go = callback(w.h, { keyboard }) !== false && go; } catch (error) { global.console?.error(error); }
      }
      return go;
    },
    activate(w, enter) {
      if (!enter || w.status || this.rowActivated(w, true)) TREE_ACTIVATION.activate.call(this, w, enter);
    },
    onDblClick(event) {
      const w = this.rowFromEvent(event);
      if (!w || w.status || hostControl(event.target) || event.target.closest(".cx-exp") || this.rowActivated(w, false)) TREE_ACTIVATION.onDblClick.call(this, event);
    }
  });


  // ---------- tree grid: cells a host renderer draws ----------
  // A renderer (options.renderers) gets a fresh element in the place of its cell on every paint, so nothing it left
  // behind leaks into the next node. What happens next depends on what the renderer did with it:
  // - it drew the cell (returned true): the fresh element stays and the cell is the host's;
  // - it decorated the element (content, classes, or attributes) and returned false: the fresh element stays and the
  //   default text, tone, and badges are painted after the decoration;
  // - it left the element as it was and returned false: the element is dropped and the cell the runtime painted
  //   before is put back, so rows a renderer leaves to the default keep their cell, text node, and badges while rows
  //   are recycled, as the columns without a renderer do. Children, attributes and registered lifetime resources
  //   keep the fresh element; listeners attached without the context signal do not register lifetime ownership.

  /**
   * A badge as the runtime draws one: the "cx-badge" class, the classes of its tone, the theme colours of a host tone
   * (--hfx-color-status-<name>-fg and --hfx-color-status-<name>-bg), its text, and its tooltip. Exported as CanopyX.badge for renderers.
   */
  function badgeElement(badge) {
    const span = h("span");
    applyTone(span, "cx-badge", toneOf(badge.tone || "neutral"));
    setText(span, badge.text);
    if (badge.title) span.title = badge.title;
    return span;
  }

  /** CanopyX.badge: checks what a host passes, then draws the badge as the runtime does. */
  function hostBadge(badge) {
    if (!badge || typeof badge !== "object" || typeof badge.text !== "string" ||
        (badge.tone != null && typeof badge.tone !== "string") || (badge.title != null && typeof badge.title !== "string")) {
      throw new Error("CanopyX: badge needs { text, tone?, title? } with string values.");
    }
    return badgeElement(badge);
  }

  /** The attributes of an element as one string, to tell whether a renderer changed the element it was given. */
  function attributeShape(element) {
    let shape = "";
    for (const attribute of element.attributes) {
      shape += attribute.name + "=" + attribute.value + "\n";
    }
    return shape;
  }

  // The host's renderers by column id, then the plugins' cell renderers that columns name in their renderer field.
  function hostRenderers(renderers, columns, plugins) {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(renderers)) ||
        Object.keys(renderers).some(id => typeof renderers[id] !== "function" || !columns.some(column => column.id === id)))
      throw new Error("CanopyX: invalid column renderers.");
    const named = Object.assign(Object.create(null), ...plugins.map(item => item.cellRenderers));
    return Object.assign(Object.create(null), ...columns.filter(column => typeof column.renderer === "string" && named[column.renderer])
      .map(column => ({ [column.id]: named[column.renderer] })), renderers);
  }

  function disposeHostSlot(slot) {
    slot.childSlots?.forEach(disposeHostSlot);
    const lifetime = slot.hostLifetime;
    if (!lifetime) return;
    delete slot.hostLifetime;
    lifetime.dispose();
  }

  function disposeRowHostCells(row) {
    row._cells?.forEach(disposeHostSlot);
  }

  class HostCellContext {
    #controller;
    #cleanups;
    constructor(slot, column, level, expanded, index) {
      slot.hostLifetime = this;
      this.column = column; this.level = level; this.expanded = expanded; this.index = index;
    }
    get signal() {
      this.#controller ||= new AbortController();
      if (this.#cleanups === null) this.#controller.abort();
      return this.#controller.signal;
    }
    onDispose = cleanup => {
      if (typeof cleanup !== "function") throw new TypeError("Invalid cleanup.");
      if (this.#cleanups === null) cleanup(); else (this.#cleanups ||= []).push(cleanup);
    };
    get used() { return this.#controller || this.#cleanups; }
    dispose() {
      const cleanups = this.#cleanups;
      this.#cleanups = null;
      this.#controller?.abort();
      while (cleanups?.length) {
        try { cleanups.pop()(); } catch (error) { global.console?.error(error); }
      }
    }
  }

  Object.assign(TreeGrid.prototype, {
    /** Runs the renderer of a column for one cell and returns "host", "decorated", or "default" (see above). */
    paintHostSlot(slot, node, column, index, w) {
      const tree = slot.content !== slot.cell;
      const previous = slot.content;
      const fresh = tree ? h("span", "cx-content") : this.newCell(this.cols.indexOf(column), column.renderWidth || column.width, column.kind);
      const shape = attributeShape(fresh);
      disposeHostSlot(slot);
      previous.replaceWith(fresh);
      this.setSlotContent(slot, fresh, tree);
      let drawn;
      try {
        drawn = column.render(node, fresh, column.hostRenderer === false ? { column: column.id, level: w.level, expanded: w.expanded, index } :
          new HostCellContext(slot, column.id, w.level, w.expanded, index)) === true;
      } catch (e) {
        disposeHostSlot(slot);
        // The cell keeps what it showed, so a renderer that fails once does not leave it empty for later nodes.
        if (fresh.parentNode) fresh.replaceWith(previous);
        this.setSlotContent(slot, previous, tree);
        throw e;
      }
      const untouched = !drawn && !slot.hostLifetime?.used && !fresh.firstChild && attributeShape(fresh) === shape;
      if (untouched && slot.mode === "default") {
        disposeHostSlot(slot);
        fresh.replaceWith(previous);
        this.setSlotContent(slot, previous, tree);
        return "default";
      }
      // The fresh element replaces the cell for good: what the previous one carried (classes, tooltip, tone, badges)
      // went with it, and the cell of the tree column, which stays, is cleaned.
      if (tree) {
        slot.cell.className = slot.base;
        slot.cell.removeAttribute("title");
        toneColors(slot.cell, NO_TONE);
      }
      slot.cls = slot.base;
      slot.title = null;
      slot.badges = [];
      slot.mode = drawn ? "host" : untouched ? "default" : "decorated";
      if (!untouched) {
        // The grid is one Tab stop; the host's controls in the cell are reached with cell navigation.
        quietControls(fresh);
      }
      if (!drawn) {
        fresh.appendChild(slot.textSpan);
      }
      return slot.mode;
    },

    /** Points a slot at the element that holds its content; outside the tree column that element is the cell itself. */
    setSlotContent(slot, element, tree) {
      slot.content = element;
      if (!tree) {
        slot.cell = element;
      }
    }
  });

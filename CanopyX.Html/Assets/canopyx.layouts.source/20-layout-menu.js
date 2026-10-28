  // ---------- layout modes: the Layout menu, the API and the hooks ----------
  // The Layout menu follows Columns: one group of radio buttons for the modes the view allows, one for the density. Each
  // choice applies at once, is announced, and is part of the state saved views keep. toolbar.layout: false leaves the menu
  // out; setLayout keeps working.
  const LAYOUT_ICON = '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/>';
  let layoutSeq = 0;
  function layoutGroup(view, legend, name, choices, current, choose) {
    const group = h("div", "cx-layout-group"), title = h("div", "cx-layout-title");
    title.id = name + "-title"; group.setAttribute("role", "radiogroup"); group.setAttribute("aria-labelledby", title.id);
    setText(title, legend); group.appendChild(title);
    for (const [value, text] of choices) {
      const label = h("label", "cx-layout-choice"), input = h("input");
      input.type = "radio"; input.name = name; input.value = value; input.checked = value === current;
      input.addEventListener("change", () => { if (input.checked) choose(value); });
      label.append(input, document.createTextNode(text)); group.appendChild(label);
    }
    return group;
  }
  function layoutModeText(view, mode) { return view.labels[mode === "fit" ? "layoutFit" : mode === "scroll" ? "layoutScroll" : "layoutCards"]; }
  function layoutDensityText(view, density) { return view.labels[density === "compact" ? "layoutCompact" : density === "comfortable" ? "layoutComfortable" : "layoutNormal"]; }
  function layoutMenu(view) {
    if (view.tools.layout === false || typeof view.controlPanel !== "function") return;
    const { details, panel } = view.controlPanel(view.labels.layoutMenu, "cx-grid-layout"), id = view.id + "-layout-" + ++layoutSeq;
    const icon = details.firstChild.querySelector("svg");
    if (icon) icon.replaceWith(svgIcon(LAYOUT_ICON));
    const choose = change => Promise.resolve().then(() => VIEW_MODES.setLayout(view, change)).catch(error => view.emit("error", { error }));
    // The choices are built once; later renders only check the current ones, so keyboard focus stays on its radio.
    const render = () => {
      const options = view.layoutOptions;
      if (panel.firstChild) {
        for (const input of panel.querySelectorAll("input")) input.checked = input.value === view.layoutMode || input.value === view.density;
        return;
      }
      panel.replaceChildren(...[options.modes.length > 1 && layoutGroup(view, view.labels.layoutMenu, id + "-mode",
        options.modes.map(mode => [mode, layoutModeText(view, mode)]), view.layoutMode, mode => choose({ mode })),
      layoutGroup(view, view.labels.layoutDensity, id + "-density", LAYOUT_DENSITIES.map(density => [density, layoutDensityText(view, density)]),
        view.density, density => choose({ density }))].filter(Boolean));
    };
    render();
    view.layoutMenu = { details, render };
    // Before Views, after Columns and the plugins' toolbar items.
    const anchor = view.toolbar.querySelector(".cx-grid-views") || view.spacer;
    if (anchor && anchor.parentNode === view.toolbar) view.toolbar.insertBefore(details, anchor);
  }

  VIEW_MODES.layoutsStart = view => {
    // The menu needs the toolbar menus (a tree's tree tools part): it is built on the first start that finds them.
    if (view.layoutOptions && !view.layoutMenu) layoutMenu(view);
    if (view.layoutOptions && !view.sortMenu) sortMenu(view);
    if (view.kind === "grid" && view.view.stickyHeader) pageHeaderStart(view);
    if (view.layoutStarted) return;
    view.layoutStarted = true;
    view.host.classList.add("cx-layouts");
    view.lifetime.signal.addEventListener("abort", () => {
      cancelAnimationFrame(view.cardFocusFrame);
      view.host.classList.remove("cx-layouts");
      for (const name of ["cols", "span", "pad", "field", "gap", "title", "width", "height"]) view.host.style.removeProperty("--cx-card-" + name);
    }, { once: true });
    view.host.setAttribute("data-cx-density", view.density);
    if (view.layoutMode !== "fit" || view.kind === "grid" && view.density !== view.declaredDensity) layoutApply(view, view.layoutMode, view.density);
  };
  VIEW_MODES.refreshCardDensity = view => {
    const anchor = layoutAnchor(view), geometry = cardGeometry(view);
    cardStyle(view, geometry); view.rowH = geometry.pitch; view.version++;
    layoutCardRows(view, anchor);
  };
  VIEW_MODES.setLayout = (view, change) => {
    if (!change || typeof change !== "object" || Array.isArray(change) || Object.keys(change).some(key => !["mode", "density"].includes(key)) ||
        change.mode !== undefined && !view.layoutOptions.modes.includes(change.mode) || change.density !== undefined && !LAYOUT_DENSITIES.includes(change.density))
      throw new Error("CanopyX: setLayout takes a mode the view allows and a density.");
    if (!view.layoutStarted) VIEW_MODES.layoutsStart(view);
    const mode = change.mode ?? view.layoutMode, density = change.density ?? view.density;
    if (mode !== view.layoutMode || density !== view.density) {
      layoutApply(view, mode, density);
      view.layoutMenu?.render(); view.sortMenu?.sync();
      if (view.live) { setText(view.live, ""); setText(view.live, fill(view.labels.layoutChanged, { mode: layoutModeText(view, mode), density: layoutDensityText(view, density) })); }
      view.stateChanged();
      view.emit("layout", { mode, density });
    }
    return Promise.resolve(view.getLayout());
  };

  // Cards label their fields (the column title, drawn by the stylesheet) and let long text take a whole line.
  if (VIEW_MODES.DataGrid) {
    const proto = VIEW_MODES.DataGrid.prototype, paint = proto.fillRow, widths = proto.applyWidths;
    const rowTop = proto.rowTop, rowAt = proto.rowAt, renderPass = proto.renderPass, pageStep = proto.gridPageStep;
    const tiled = view => view.layoutMode === "cards" && view.cardGeometry && !view.rowProjection;
    proto.rowTop = function (index) {
      if (!tiled(this)) return rowTop.call(this, index);
      return CARD_GUTTER + Math.floor((index - this.pageOffset) / this.cardGeometry.lanes) * this.rowH;
    };
    proto.rowAt = function (top) {
      if (!tiled(this)) return rowAt.call(this, top);
      const bounds = this.rowBounds();
      return Math.max(bounds.first, Math.min(bounds.last, bounds.first + Math.max(0, Math.floor((top - CARD_GUTTER) / this.rowH)) * this.cardGeometry.lanes));
    };
    proto.gridPageStep = function (row, direction, ...args) {
      if (!tiled(this)) return pageStep.call(this, row, direction, ...args);
      return row._ri + direction * this.cardGeometry.lanes * Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH));
    };
    proto.renderPass = function (...args) {
      const cards = this.layoutMode === "cards" && this.cardGeometry;
      if (cards && !!this.rowProjection !== !!this.cardProjection) {
        const geometry = cardGeometry(this);
        if (geometry.lanes !== this.cardGeometry.lanes || geometry.height !== this.cardGeometry.height) {
          cardStyle(this, geometry); this.rowH = geometry.pitch; this.layout = (this.layout || 0) + 1; this.version++;
        }
        this.cardProjection = !!this.rowProjection;
      }
      const tile = tiled(this), viewport = this.viewportHeight;
      if (cards) cardMinHeight(this);
      if (tile) {
        const total = cardTotal(this);
        if (this.total !== total) { this.total = total; this.syncScrollRange(this.logicalTop()); }
        // Include the entire final visual band even without overscan. ARIA indices and DOM order still count records.
        this.viewportHeight = (viewport ?? this.grid.clientHeight - this.head.offsetHeight) + this.rowH;
      }
      try { return renderPass.apply(this, args); }
      finally {
        this.viewportHeight = viewport;
        for (const [row, element] of this.rendered) {
          const lane = tile ? (row._ri - this.pageOffset) % this.cardGeometry.lanes : 0;
          element.style.left = cards && !row.group && !row.status ? CARD_GUTTER + lane * (this.cardGeometry.width + CARD_COLUMN_GAP) + "px" : "";
          if (cards && tile && row.status) {
            element.style.left = CARD_GUTTER + lane * (this.cardGeometry.width + CARD_COLUMN_GAP) + "px";
            element.style.width = this.cardGeometry.width + "px";
          }
        }
      }
    };
    proto.fillRow = function (element, row) {
      paint.call(this, element, row);
      if (this.layoutMode !== "cards" || !element._cells || row.status || row.group) return;
      element._cells.forEach((slot, index) => {
        const column = this.cols[index], cell = slot && slot.cell;
        if (!column || !cell) return;
        const label = index ? column.title : null, wide = cardRole(column, index, this.cols);
        if ((cell.getAttribute("data-cx-label") ?? null) !== label) { if (label === null) cell.removeAttribute("data-cx-label"); else cell.setAttribute("data-cx-label", label); }
        if ((cell.getAttribute("data-cx-card") ?? null) !== wide) { if (wide) cell.setAttribute("data-cx-card", wide); else cell.removeAttribute("data-cx-card"); }
        cardTemplateSlot(this, row, column, slot);
      });
    };
    // A new width can change how many fields fit on a line, and so the card height.
    proto.applyWidths = function (...args) {
      const result = widths.apply(this, args);
      if (this.layoutMode === "cards" && !this.layoutApplying && this.cols && this.sized) {
        const anchor = layoutAnchor(this), previous = this.cardGeometry, geometry = cardGeometry(this);
        cardStyle(this, geometry);
        if (geometry.pitch !== this.rowH || geometry.lanes !== previous?.lanes || geometry.width !== previous?.width) {
          this.rowH = geometry.pitch; this.layout = (this.layout || 0) + 1; this.version++;
          layoutCardRows(this, anchor);
        }
        layoutKeepFocus(this);
      }
      return result;
    };
  }

  // ---------- cards: sorting, column menus and select-all without the header row ----------
  // Cards hide the header row (each field carries its column's title), so a "Sort by" menu takes over what the header offers:
  // each sortable column sorts by a press (Shift adds it to the sort), its column menu (filter, hide, pin and the rest) opens
  // beside it, and a reporting grid's select-all commands sit at the top. The menu shows only in the card layout.
  const SORT_ICON = '<path d="M8 5v14M4.5 15.5 8 19l3.5-3.5M16 19V5M12.5 8.5 16 5l3.5 3.5"/>';
  function sortMenuRender(view, panel) {
    const query = view.acceptedQuery, sorts = query ? query.sort : [], parts = [];
    // The select-all commands move here from the hidden header; the header takes them back when it is built again.
    if (view.selectionControls) parts.push(view.selectionControls);
    const list = h("div", "cx-sort-list");
    list.setAttribute("role", "group"); list.setAttribute("aria-label", view.labels.layoutSort);
    for (const column of view.cols || []) {
      if (!column.sortable && view.tools.columnMenus === false) continue;
      const row = h("div", "cx-sort-choice"), at = sorts.findIndex(sort => sort.column === column.id), sort = sorts[at];
      if (column.sortable) {
        const button = h("button", "cx-button cx-sort-column"), arrow = sort ? sort.direction === "asc" ? " \u2191" : " \u2193" : "";
        button.type = "button"; setText(button, column.title + arrow + (sort && sorts.length > 1 ? " " + (at + 1) : ""));
        button.setAttribute("aria-pressed", String(!!sort));
        button.setAttribute("aria-label", column.title + (sort ? ", " + view.labels[sort.direction === "asc" ? "gridSortAscending" : "gridSortDescending"] : ""));
        button.addEventListener("click", event => view.querySortHeader(column.id, event));
        row.appendChild(button);
      } else {
        const title = h("span", "cx-sort-column"); setText(title, column.title); row.appendChild(title);
      }
      if (view.tools.columnMenus !== false && typeof view.openColumnMenu === "function") {
        const menu = h("button", "cx-button icon cx-sort-menu");
        menu.type = "button"; menu.setAttribute("aria-label", fill(view.labels.gridColumnMenu, { column: column.title })); menu.setAttribute("aria-haspopup", "menu");
        menu.appendChild(document.createTextNode("\u22ef"));
        menu.addEventListener("click", () => view.openColumnMenu(column.id, menu));
        row.appendChild(menu);
      }
      list.appendChild(row);
    }
    parts.push(list);
    panel.replaceChildren(...parts);
  }
  function sortMenu(view) {
    if (view.kind !== "grid" || view.tools.layout === false || !view.layoutOptions.modes.includes("cards") || typeof view.controlPanel !== "function") return;
    const { details, panel } = view.controlPanel(view.labels.layoutSort, "cx-grid-sort", target => sortMenuRender(view, target));
    const icon = details.firstChild.querySelector("svg");
    if (icon) icon.replaceWith(svgIcon(SORT_ICON));
    const anchor = view.layoutMenu?.details || view.toolbar.querySelector(".cx-grid-views") || view.spacer;
    if (anchor && anchor.parentNode === view.toolbar) view.toolbar.insertBefore(details, anchor);
    // A new sort or result while the menu is open shows at once.
    view.host.addEventListener("canopyx:query", () => { if (details.open) sortMenuRender(view, panel); }, { signal: view.lifetime.signal });
    view.sortMenu = { details, sync: () => { details.hidden = view.layoutMode !== "cards"; if (details.hidden) details.open = false; } };
    view.sortMenu.sync();
  }

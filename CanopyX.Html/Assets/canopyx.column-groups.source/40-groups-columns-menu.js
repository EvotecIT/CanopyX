  // ---------- the Columns menu, nested by group ----------
  // Groups are headings with their columns below them, indented, in a role="group" named after the group. A group's check box
  // shows or hides all of its columns (mixed while some are shown); its handle moves the whole group. A column's handle and
  // Alt+Up/Down move it among the members of its own group. Find shows a matching column with its groups, and a matching
  // group with all its columns.
  function cgColumnControls(grid) {
    const list = grid.columnList, model = grid.columnGroupModel, active = document.activeElement, query = foldText(grid.columnFind?.value.trim() || "");
    const held = list.contains(active) ? active.closest(".cx-grid-column-choice") : null, heldId = held && (held.dataset.cxColumn || held.dataset.cxGroup), heldHandle = active?.matches?.(".cx-grid-column-handle");
    const byId = new Map(grid.columns.map(column => [column.id, column])), shown = () => grid.columns.filter(column => !column.hidden).length;
    const matches = id => !query || foldText(model.byId.get(id)?.title ?? byId.get(id).title).includes(query);
    const visible = id => { const node = model.byId.get(id); return !query || matches(id) || !!node && node.leaves.some(matches) || cgPath(model, id).some(group => matches(group.id)); };
    list.textContent = "";
    const render = (parent, container, level) => {
      for (const id of cgSiblings(grid, parent)) {
        const node = model.byId.get(id), column = byId.get(id), row = h("div", "cx-grid-column-choice"), label = h("label"), input = h("input"), name = h("span", "cx-grid-column-name"), handle = h("button", "cx-grid-column-handle");
        const title = node ? node.title : column.title, members = node ? node.leaves.map(leaf => byId.get(leaf)) : [column], hiddenCount = members.filter(item => item.hidden).length;
        input.type = "checkbox"; input.checked = hiddenCount === 0 || !node && hiddenCount < members.length; input.indeterminate = hiddenCount > 0 && hiddenCount < members.length;
        input.disabled = input.checked && shown() <= members.length - hiddenCount;
        input.onchange = () => { input.focus({ preventScroll: true }); node ? grid.setColumnGroupVisible(id, input.checked) : grid.setColumnVisible(id, input.checked); };
        setText(name, name.title = title); handle.type = "button"; setText(handle, "⋮⋮");
        handle.setAttribute("aria-label", fill(grid.labels.gridReorderColumn, { column: title }));
        label.append(input, name); row.append(handle, label); row.style.setProperty("--cx-level", String(level));
        row.hidden = !visible(id);
        if (node) { row.classList.add("cx-grid-column-group-choice"); row.dataset.cxGroup = id; } else row.dataset.cxColumn = id;
        const note = !node && (column.fitHidden || column.responsiveHidden ? grid.labels.gridResponsiveHidden : column.pin === "left" ? grid.labels.gridPinnedLeft : column.pin === "right" ? grid.labels.gridPinnedRight : "");
        if (note) { const span = h("span", "cx-grid-column-note"); setText(span, note); row.append(span); }
        row.onkeydown = event => {
          if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          const siblings = cgSiblings(grid, parent), target = siblings[siblings.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1)];
          event.preventDefault(); event.stopPropagation();
          if (target) cgChoose(grid, id, target, event.key === "ArrowDown");
        };
        handle.onpointerdown = event => cgDragChoice(grid, list, row, handle, id, event);
        container.appendChild(row);
        if (heldId === id) (heldHandle ? handle : input).focus({ preventScroll: true });
        if (node) {
          const children = h("div", "cx-grid-column-children");
          children.setAttribute("role", "group"); children.setAttribute("aria-label", title); children.hidden = row.hidden;
          container.appendChild(children); render(node, children, level + 1);
        }
      }
    };
    render(null, list, 0);
  }

  // A column or group moved among its siblings; a top-level item takes the pin of the item it lands beside, as moves do.
  function cgChoose(grid, id, targetId, after) {
    const node = grid.columnGroupModel.byId.get(id);
    if (node) { cgMoveGroup(grid, node, targetId, after); return; }
    const to = cgSibling(grid, id, targetId, after), order = to.id !== id && cgMoved(grid, id, to.id, to.after);
    if (!order) return;
    if (!grid.columnGroupModel.owner.has(id)) grid.columns.find(column => column.id === id).pin = grid.columns.find(column => column.id === cgFirst(grid, to.id)).pin;
    grid.setColumnOrder(order);
  }

  function cgDragChoice(grid, list, row, handle, id, event) {
    if (event.button) return;
    event.preventDefault(); handle.focus(); handle.setPointerCapture(event.pointerId);
    let target = null;
    const clear = () => { for (const item of list.querySelectorAll(".cx-drop-before,.cx-drop-after")) item.classList.remove("cx-drop-before", "cx-drop-after"); };
    handle.onpointermove = move => {
      clear(); target = null;
      const over = document.elementFromPoint(move.clientX, move.clientY)?.closest(".cx-grid-column-choice");
      if (!over || over === row || !list.contains(over)) return;
      const box = over.getBoundingClientRect(), to = cgSibling(grid, id, over.dataset.cxColumn || over.dataset.cxGroup, move.clientY > box.top + box.height / 2);
      if (to.id === id) return;
      target = to;
      const marked = list.querySelector('[data-cx-column="' + CSS.escape(to.id) + '"],[data-cx-group="' + CSS.escape(to.id) + '"]');
      marked?.classList.add(to.after ? "cx-drop-after" : "cx-drop-before");
    };
    handle.onpointerup = handle.onpointercancel = up => {
      handle.onpointermove = handle.onpointerup = handle.onpointercancel = null; clear();
      if (up.type === "pointerup" && target) cgChoose(grid, id, target.id, target.after);
    };
  }

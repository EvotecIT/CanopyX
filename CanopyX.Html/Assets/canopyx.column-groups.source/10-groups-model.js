  // ---------- column groups: definitions, membership and an order that keeps every group together (docs/column-groups.md) ----------
  // A view's columnGroups is a list of groups, each { id, title, columns?, groups?, pinned? }: the columns directly below it
  // and nested groups, at most three levels deep. A column belongs to one group at most. Groups never reorder columns among
  // themselves by their own lists: the grid's column order decides, and a group gathers its columns where most of them are.
  const CG_DEPTH = 3, CG_PINS = ["left", "none", "right"];
  const cgBad = problem => { throw new Error("CanopyX: column groups " + problem + "."); };

  /** Checks a view's column groups and indexes them: the roots, each group by id, each column's innermost group and the depth. */
  function cgRead(view) {
    const declared = new Set(view.columns.map(column => column.id)), owner = new Map(), byId = new Map();
    if (!Array.isArray(view.columnGroups) || view.columnGroups.length > 1000) cgBad("must be an array of at most 1000 groups");
    const read = (input, parent, depth) => {
      if (!input || typeof input !== "object" || Array.isArray(input)) cgBad("must be objects");
      requireIdentifier(input.id, "column group ID");
      const columns = input.columns ?? [], groups = input.groups ?? [];
      if (byId.has(input.id) || typeof input.title !== "string" || !input.title.trim() || input.title.length > 256 || depth > CG_DEPTH ||
          !Array.isArray(columns) || !Array.isArray(groups) || !columns.length && !groups.length ||
          input.pinned !== undefined && (parent || ![null, "left", "right"].includes(input.pinned)))
        cgBad("need unique IDs, titles, members, at most " + CG_DEPTH + " levels, and a pin only on a top-level group");
      const node = { id: input.id, title: input.title, pinned: input.pinned, parent, depth, columns: [], groups: [], leaves: [] };
      byId.set(node.id, node);
      for (const id of columns) {
        if (!declared.has(id) || owner.has(id)) cgBad("name declared columns, each in one group at most");
        owner.set(id, node); node.columns.push(id);
      }
      for (const group of groups) node.groups.push(read(group, node, depth + 1));
      return node;
    };
    const roots = view.columnGroups.map(group => read(group, null, 1));
    const gather = node => node.leaves = [...node.columns, ...node.groups.flatMap(gather)];
    roots.forEach(gather);
    return { roots, byId, owner, depth: Math.max(0, ...[...byId.values()].map(node => node.depth)) };
  }

  /** The groups above a column, from the top-level group down to its own; empty for a column outside every group. */
  function cgPath(model, id) {
    const path = [];
    for (let node = model.owner.get(id); node; node = node.parent) path.unshift(node);
    return path;
  }

  /**
   * Puts the columns in an order that keeps each group together. Each group takes the place of its middle column (the lower
   * median of its columns' positions), so a column moved out of its group goes back to the group's near edge, and a group
   * whose columns all moved goes with them. Every column of a top-level group takes one pin, the pin most of its columns
   * have (on a tie, the pin of its first column in the current order), so a group never splits across a pinned edge. A
   * group's declared pin is its columns' pin when the grid starts (startColumnGroups), not a rule applied on every build.
   */
  function cgOrder(grid) {
    const model = grid.columnGroupModel, rank = new Map(grid.columns.map((column, index) => [column.id, index]));
    const byId = new Map(grid.columns.map(column => [column.id, column]));
    const middle = ids => ids.map(id => rank.get(id)).sort((a, b) => a - b)[(ids.length - 1) >> 1];
    const place = node => [...node.columns.map(id => ({ at: rank.get(id), ids: [id] })), ...node.groups.map(group => ({ at: middle(group.leaves), ids: place(group) }))]
      .sort((a, b) => a.at - b.at).flatMap(item => item.ids);
    const items = model.roots.map(root => {
      const members = root.leaves.map(id => byId.get(id)).sort((a, b) => rank.get(a.id) - rank.get(b.id)), counts = new Map();
      for (const column of members) counts.set(column.pin || "none", (counts.get(column.pin || "none") || 0) + 1);
      let pin = members[0].pin || "none";
      for (const [side, count] of counts) if (count > counts.get(pin)) pin = side;
      for (const column of members) column.pin = pin;
      return { at: middle(root.leaves), ids: place(root), pin };
    });
    for (const column of grid.columns) if (!model.owner.has(column.id)) items.push({ at: rank.get(column.id), ids: [column.id], pin: column.pin || "none" });
    items.sort((a, b) => CG_PINS.indexOf(a.pin) - CG_PINS.indexOf(b.pin) || a.at - b.at);
    const order = items.flatMap(item => item.ids);
    if (order.some((id, index) => grid.columns[index].id !== id)) grid.columns = order.map(id => byId.get(id));
  }

  /** A column's or group's parent group, null at the top level. */
  function cgParent(model, id) { return model.byId.has(id) ? model.byId.get(id).parent : model.owner.get(id) || null; }
  /**
   * Where a column or group may land when dropped beside target: target, or target's ancestor, when it shares the moving
   * item's parent; otherwise the parent's first or last member, on the side target is on, so children stay in their group.
   */
  function cgSibling(grid, itemId, targetId, after) {
    const model = grid.columnGroupModel, parent = cgParent(model, itemId);
    for (let id = targetId; id;) {
      const up = cgParent(model, id);
      if (up === parent) return { id, after };
      id = up && up.id;
    }
    const order = grid.columns.map(column => column.id);
    return order.indexOf(cgFirst(grid, targetId)) < order.indexOf(cgFirst(grid, parent.id)) ?
      { id: cgTop(grid, parent, true), after: false } : { id: cgTop(grid, parent, false), after: true };
  }
  /** A column's or group's first column in the current order. */
  function cgFirst(grid, id) {
    const node = grid.columnGroupModel.byId.get(id);
    return node ? grid.columns.find(column => node.leaves.includes(column.id)).id : id;
  }
  /** The first or last direct member (column or group id) of a group in the current order. */
  function cgTop(grid, node, first) {
    const members = [...node.columns, ...node.groups.map(group => group.id)], order = grid.columns.map(column => column.id);
    const at = id => order.indexOf(cgFirst(grid, id));
    return members.sort((a, b) => first ? at(a) - at(b) : at(b) - at(a))[0];
  }

  /** The column order with a column or a whole group moved before or after another member of the same parent. */
  function cgMoved(grid, id, targetId, after) {
    const model = grid.columnGroupModel, block = model.byId.get(id)?.leaves || [id], targetBlock = model.byId.get(targetId)?.leaves || [targetId];
    const order = grid.columns.map(column => column.id).filter(item => !block.includes(item));
    const positions = targetBlock.map(item => order.indexOf(item)).filter(index => index >= 0);
    if (!positions.length) return null;
    order.splice(after ? Math.max(...positions) + 1 : Math.min(...positions), 0, ...grid.columns.map(column => column.id).filter(item => block.includes(item)));
    return order;
  }

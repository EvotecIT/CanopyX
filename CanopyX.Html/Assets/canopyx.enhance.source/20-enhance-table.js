  // ---------- reading an existing table ----------
  // A table gives the columns (the bottom header row, with the rows above it as header groups), the rows and their cells,
  // per-cell sort and search values, row identities, the caption and the footer. Options written as data-* attributes on the
  // table and its header cells come with it; script options win over them.
  const ENHANCE_TABLE_OPTIONS = ["label", "noun", "paging", "pageLength", "pageLengths", "lengthMenu", "info", "pageNumbers", "pageInput", "search", "searchText",
    "searchMode", "order", "sortable", "selection", "stateSave", "markup", "footer", "height", "theme", "density", "zebra"];
  const ENHANCE_COLUMN_OPTIONS = ["id", "title", "type", "sortable", "searchable", "visible", "hidden", "priority", "width", "minWidth", "maxWidth", "flex", "pinned",
    "wrap", "alwaysVisible", "tooltip", "autoSize", "defaultContent", "section", "rowHeader"];
  // Options that are text keep the attribute as written: data-id="2024" is the id "2024", not a number.
  const ENHANCE_TEXT_OPTIONS = ["label", "noun", "searchText", "height", "id", "title", "tooltip", "defaultContent", "section"];

  /** Options from data-* attributes: kebab-case names in camelCase, JSON values parsed, anything else kept as text. */
  function enhanceAttributes(element, allowed) {
    const options = {};
    if (!element || !element.hasAttributes()) return options;
    for (const attribute of element.attributes) {
      if (!attribute.name.startsWith("data-")) continue;
      const name = attribute.name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (!allowed.includes(name)) continue;
      let value = attribute.value;
      if (!ENHANCE_TEXT_OPTIONS.includes(name)) try { value = JSON.parse(value); } catch (_) { value = attribute.value; }
      options[name] = value;
    }
    return options;
  }

  /** A cell's text with runs of white space collapsed, as a reader sees it. */
  function enhanceText(node) {
    const text = node.textContent;
    return /\s\s|[\t\n\r\f]/.test(text) ? text.replace(/\s+/g, " ").trim() : text.trim();
  }

  /** Header rows laid out with their spans: slots[row][column] is the cell that covers the slot. */
  function enhanceLayout(rows) {
    const slots = rows.map(() => []);
    rows.forEach((row, r) => {
      let c = 0;
      for (const cell of row.cells) {
        while (slots[r][c]) c++;
        const across = Math.min(Math.max(cell.colSpan || 1, 1), 1000), down = cell.rowSpan === 0 ? rows.length - r : Math.min(Math.max(cell.rowSpan || 1, 1), rows.length - r);
        for (let y = r; y < r + down; y++) for (let x = c; x < c + across; x++) slots[y][x] = cell;
        c += across;
      }
    });
    return slots;
  }

  /** One body cell: plain text in the common case, otherwise its text with the attributes and markup it carries. */
  function enhanceReadCell(cell) {
    const text = enhanceText(cell), markup = cell.firstElementChild ? cell : null;
    if (!markup && cell.tagName === "TD" && !cell.hasAttributes()) return text;
    const attribute = name => cell.getAttribute(name);
    return { text, order: attribute("data-order") ?? attribute("data-sort"), search: attribute("data-search") ?? attribute("data-filter"),
      tone: attribute("data-tone"), markup, header: cell.tagName === "TH" };
  }

  /** Reads a section's rows into values per column, carrying row spans down and leaving column spans empty after their cell. */
  function enhanceReadRows(rows, skip) {
    const read = [], carry = [];
    for (const row of rows) {
      if (row === skip) continue;
      const values = [];
      let c = 0;
      const carried = () => { while (carry[c] && carry[c].left > 0) { values[c] = carry[c].value; carry[c].left--; c++; } };
      for (const cell of row.cells) {
        carried();
        const value = enhanceReadCell(cell), across = Math.min(Math.max(cell.colSpan || 1, 1), 1000), down = Math.max(cell.rowSpan || 1, 1);
        for (let x = 0; x < across; x++) {
          values[c + x] = x ? "" : value;
          carry[c + x] = down > 1 ? { value: x ? "" : value, left: down - 1 } : null;
        }
        c += across;
      }
      for (let x = c; x < carry.length; x++) if (carry[x] && carry[x].left > 0) { values[x] = carry[x].value; carry[x].left--; }
      read.push({ element: row, values });
    }
    return read;
  }

  /** Reads a table: header columns with their groups and attribute options, body rows, footer rows, caption and options. */
  function enhanceReadTable(table) {
    const head = table.tHead ? [...table.tHead.rows] : [], bodies = [...table.tBodies];
    // Without header rows, a first body row made of header cells is the header. Row spans stay inside their body section.
    const first = bodies[0] && bodies[0].rows[0], fromBody = !head.length && first && first.cells.length && [...first.cells].every(cell => cell.tagName === "TH");
    if (fromBody) head.push(first);
    const slots = enhanceLayout(head), bottom = slots[slots.length - 1] || [], rows = bodies.flatMap(body => enhanceReadRows([...body.rows], fromBody ? first : null));
    const width = rows.reduce((widest, row) => Math.max(widest, row.values.length), Math.max(bottom.length, 1)), columns = [];
    let identity = false;
    for (let index = 0; index < width; index++) {
      const cell = bottom[index] || null, groups = [];
      for (let r = 0; r < slots.length - 1; r++) if (slots[r][index] && slots[r][index] !== cell && !groups.includes(slots[r][index])) groups.push(slots[r][index]);
      // Body header cells (<th scope="row">) mark the identity column; a grid has one, so the first such column is it.
      const rowHeader = !identity && rows.length > 0 && rows.every(row => row.values[index] && row.values[index].header);
      identity ||= rowHeader;
      columns.push({ title: cell ? enhanceText(cell) : "", cell, groups: groups.map(group => ({ cell: group, title: enhanceText(group) })),
        options: enhanceAttributes(cell, ENHANCE_COLUMN_OPTIONS), rowHeader });
    }
    const footer = table.tFoot ? enhanceReadRows([...table.tFoot.rows]).map(row => row.values.map(value => typeof value === "string" ? value : value.text)) : [];
    const caption = table.caption ? enhanceText(table.caption) : "";
    return { columns, rows, footer, caption, options: enhanceAttributes(table, ENHANCE_TABLE_OPTIONS) };
  }

  /** Header groups as levels of { title, columns }, the shape column groups take; the bottom row is not a group. */
  function enhanceHeaderGroups(read, ids) {
    const levels = [];
    read.columns.forEach((column, index) => column.groups.forEach((group, level) => {
      const row = levels[level] ||= [], last = row[row.length - 1];
      if (last && last.cell === group.cell) last.columns.push(ids[index]);
      else row.push({ cell: group.cell, title: group.title, columns: [ids[index]] });
    }));
    return levels.map(row => row.map(group => Object.freeze({ title: group.title, columns: Object.freeze(group.columns) })));
  }

  /**
   * Header groups as the grid's column groups ({ id, title, columns?, groups? }, nested by level): each group of a lower row
   * nests under the group above whose columns hold all of its own, and lists only the columns no nested group takes. Column
   * groups draw at most three levels, so a deeper header keeps the three rows nearest the columns.
   */
  function enhanceColumnGroups(levels) {
    const kept = levels.slice(-3);
    const nodes = kept.map((row, level) => row.map((group, index) => ({ id: "group-" + level + "-" + index, title: group.title, all: group.columns, groups: [] })));
    for (let level = nodes.length - 1; level > 0; level--) {
      for (const node of nodes[level]) nodes[level - 1].find(parent => node.all.every(id => parent.all.includes(id)))?.groups.push(node);
    }
    // A header cell without text groups nothing: its nested groups take its place.
    const writeAll = list => list.flatMap(node => node.title ? [write(node)] : writeAll(node.groups));
    const write = node => {
      const nested = new Set(node.groups.flatMap(group => group.all)), columns = node.all.filter(id => !nested.has(id)), groups = writeAll(node.groups);
      return { id: node.id, title: node.title, ...(columns.length ? { columns } : {}), ...(groups.length ? { groups } : {}) };
    };
    return writeAll(nodes[0] || []).filter(group => group.columns || group.groups);
  }

  /** The columns of a table: the header gives titles and attributes; script column options at the same index win. Header groups become column groups. */
  function enhanceTableColumns(read, specs) {
    return read.columns.map((column, index) =>
      Object.assign({ data: index, title: column.title || String(index + 1), rowHeader: column.rowHeader || undefined }, column.options, specs && specs[index] || {}));
  }

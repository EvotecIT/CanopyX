  // OfficeIMO refuses some valid grid data outright instead of degrading it: more than 64 badges on a cell, an XLSX column
  // wider than 255 characters, more hyperlinks than a worksheet or PDF holds, a link on XLSX text too long for one cell, and
  // a PDF link without visible text. The bridge trims such data to what the writer accepts and reports each trim as a
  // warning, so the export still completes. XLSX text over 32,767 characters is kept through the writer's overflow sheet
  // (the bridge selects oversizedText: "preserve"), which links the cell to its full text.
  const OFFICE_BADGES = 64, XLSX_CELL_TEXT = 32767, XLSX_WIDTH_PX = 1790, BADGE_SEPARATOR = " · ";
  const OFFICE_LINKS = Object.freeze({ xlsx: 65530, pdf: 100000 });
  // The text OfficeIMO writes for a cell: its captured text followed by its badge labels.
  function officeCellText(cell) {
    const labels = Array.isArray(cell.badges) ? cell.badges.map(badge => typeof badge === "string" ? badge : badge?.text)
      .filter(text => typeof text === "string" && text.trim()).map(text => text.trim()).join(BADGE_SEPARATOR) : "";
    const text = typeof cell.text === "string" ? cell.text : "";
    return labels ? text ? text + BADGE_SEPARATOR + labels : labels : text;
  }
  function officeLimits(format, report) {
    const budget = OFFICE_LINKS[format];
    let links = 0, first = null, bands = 1;
    function cell(rowId, columnId, input) {
      if (!input || typeof input !== "object") return input;
      let output = input;
      if (Array.isArray(input.badges) && input.badges.length > OFFICE_BADGES) {
        report({ code: "BADGES_TRUNCATED:" + (input.badges.length - OFFICE_BADGES), rowId, columnId });
        output = { ...input, badges: Object.freeze(input.badges.slice(0, OFFICE_BADGES)) };
      }
      // Excel keeps text over 32,767 characters through an internal link to an overflow sheet, which also counts as a link.
      const text = officeCellText(output);
      const long = format === "xlsx" && (text.length > XLSX_CELL_TEXT || typeof output.value === "string" && output.value.length > XLSX_CELL_TEXT);
      if (long) links++;
      if (output.link === undefined || budget === undefined) return output === input ? input : Object.freeze(output);
      // A PDF too wide for its page prints in horizontal bands and may repeat the first column in each, with one link
      // annotation a band. The band count is the writer's layout, so a first-column link is budgeted at the most bands
      // the columns allow: one for each other column.
      const cost = format === "pdf" && columnId === first ? bands : 1;
      const code = long ? "LINK_ON_LONG_TEXT" : format === "pdf" && !text.trim() ? "LINK_WITHOUT_TEXT" : links + cost > budget ? "LINKS_TRUNCATED:" + budget : "";
      if (!code) { links += cost; return output === input ? input : Object.freeze(output); }
      report(code === "LINKS_TRUNCATED:" + budget ? { code } : { code, rowId, columnId });
      const { link, ...rest } = output;
      return Object.freeze(rest);
    }
    return Object.freeze({
      request(request) {
        first = request.columns[0].id;
        bands = Math.max(1, request.columns.length - 1);
        if (format !== "xlsx" || !request.columns.some(column => column.width?.preferred > XLSX_WIDTH_PX)) return request;
        const clamp = value => Math.min(value, XLSX_WIDTH_PX);
        return Object.freeze({ ...request, columns: Object.freeze(request.columns.map(column => {
          if (!(column.width?.preferred > XLSX_WIDTH_PX)) return column;
          report({ code: "COLUMN_WIDTH_CLAMPED", columnId: column.id });
          return Object.freeze({ ...column, width: Object.freeze({ ...column.width, preferred: XLSX_WIDTH_PX, minimum: clamp(column.width.minimum),
            ...(column.width.maximum === undefined ? {} : { maximum: XLSX_WIDTH_PX }) }) });
        })) });
      },
      row(row) {
        if (!row?.cells || typeof row.cells !== "object") return row;
        let cells = null;
        for (const [id, value] of Object.entries(row.cells)) {
          const next = cell(row.id, id, value);
          if (next !== value) (cells ??= { ...row.cells })[id] = next;
        }
        return cells ? Object.freeze({ ...row, cells: Object.freeze(cells) }) : row;
      }
    });
  }

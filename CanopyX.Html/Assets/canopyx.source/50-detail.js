
  // ---------- tree grid: detail rows ----------
  const detailColumn = { kind: "text" };

  function detailCell(tag, cell, lang) {
    const element = h(tag);
    setText(element, cellText(cell, detailColumn, lang));
    if (isCellObject(cell)) {
      if (cell.tone) {
        element.className = "cx-tone-" + cell.tone;
      }
      if (cell.title) {
        element.title = cell.title;
      }
      (cell.badges || []).forEach((badge) => {
        const span = h("span", "cx-badge cx-tone-" + (badge.tone || "neutral"));
        setText(span, badge.text);
        if (badge.title) span.title = badge.title;
        element.appendChild(span);
      });
    }
    return element;
  }

  Object.assign(TreeGrid.prototype, {
    /** Fills a detail row with its table, property list, or trusted host markup; a host callback can take over. */
    renderDetail(node, element, plainHtml = false) {
      if (this.opts.renderDetail && this.opts.renderDetail(node, element) === true) {
        return;
      }
      const detail = node.detail;
      const body = h("div", "cx-detail-body");
      if (detail.type === "table") {
        const table = h("table", "cx-detail-table");
        if (detail.caption) {
          const caption = h("caption");
          setText(caption, detail.caption);
          table.appendChild(caption);
        }
        const head = h("thead");
        const headRow = h("tr");
        (detail.columns || []).forEach((title) => {
          const th = h("th");
          th.scope = "col";
          setText(th, title);
          headRow.appendChild(th);
        });
        head.appendChild(headRow);
        table.appendChild(head);
        const tbody = h("tbody");
        (detail.rows || []).forEach((row) => {
          const tr = h("tr");
          row.forEach((cell) => tr.appendChild(detailCell("td", cell, this.lang)));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);
      } else if (detail.type === "properties") {
        const list = h("dl", "cx-props");
        (detail.items || []).forEach((item) => {
          const term = h("dt");
          setText(term, item.name);
          list.appendChild(term);
          list.appendChild(detailCell("dd", item.value, this.lang));
        });
        body.appendChild(list);
      } else if (detail.type === "html") {
        if (plainHtml) setText(body, detail.html || "");
        else body.innerHTML = detail.html; // trusted host markup, see docs/data-protocol.md
      }
      element.appendChild(body);
    }
  });

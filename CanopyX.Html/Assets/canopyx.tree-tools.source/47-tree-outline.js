  // ---------- tree tools: the print outline and toOutline ----------
  // An indented table of the open rows, drawn with the cells' own painters or the host's renderers, like the tree's exports
  // a capture of what the reader sees. The table is built as elements: the print handler inserts it as it is, and toOutline
  // serializes it, so no markup is parsed (docs/security.md). The indent is set through the style object, which a strict
  // Content Security Policy allows, and serializes as an inline style for the email, print and Word copies of toOutline.
  Object.assign(TreeGrid.prototype, {
    outlineTable() {
      const cols = this.visibleColumns(), table = h("table", "cx-outline-table"), head = h("tr"), body = h("tbody");
      cols.forEach((column) => setText(head.appendChild(h("th")), column.title));
      table.appendChild(h("thead")).appendChild(head);
      table.appendChild(body);
      this.rows.forEach((w) => {
        if (w.status) {
          return;
        }
        const tr = body.appendChild(h("tr")), indent = (td) => { td.style.paddingLeft = ((w.level - 1) * 14 + 4) + "px"; return td; };
        if (w.h.detail) {
          // The print copy shows a detail's html as text (renderDetail's plain mode).
          const td = indent(tr.appendChild(h("td")));
          td.colSpan = cols.length;
          this.renderDetail(w.h, td, true);
          return;
        }
        cols.forEach((column, i) => {
          const index = this.columns.indexOf(column);
          const value = this.cellOf(w.h, column, index);
          const text = cellText(value, column, this.fmt);
          const td = tr.appendChild(h("td")), content = h("span");
          if (i === 0) indent(td);
          const slot = {};
          try {
            if (!column.render || column.render(w.h, content, new HostCellContext(slot, column.id, w.level, w.expanded, index)) !== true) {
              const badges = (i === 0 ? w.h.badges || [] : []).concat(isCellObject(value) ? value.badges || [] : []);
              content.appendChild(detailCell("span", Object.assign({}, isCellObject(value) ? value : {}, { text, badges }), this.fmt));
            }
            // A copy of what the renderer drew, taken before its cell lifetime ends and its cleanups run.
            td.appendChild(content.cloneNode(true));
          } finally { disposeHostSlot(slot); }
        });
      });
      return table;
    }
  });

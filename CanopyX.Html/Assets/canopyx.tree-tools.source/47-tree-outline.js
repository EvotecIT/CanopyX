  // ---------- tree tools: the print outline and toOutline ----------
  // An indented table of the open rows, drawn with the cells' own painters or the host's renderers, like the tree's exports
  // a capture of what the reader sees. The core's toOutline and its print handler call it once this part is installed.
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  Object.assign(TreeGrid.prototype, {
    outlineMarkup() {
      const cols = this.visibleColumns();
      const out = ["<table class=\"cx-outline-table\"><thead><tr>"];
      cols.forEach((column) => out.push("<th>" + escapeHtml(column.title) + "</th>"));
      out.push("</tr></thead><tbody>");
      this.rows.forEach((w) => {
        if (w.status) {
          return;
        }
        const pad = " style=\"padding-left:" + ((w.level - 1) * 14 + 4) + "px\"";
        if (w.h.detail) {
          const content = h("div");
          this.renderDetail(w.h, content, true);
          out.push("<tr><td" + pad + " colspan=\"" + cols.length + "\">" + content.innerHTML + "</td></tr>");
          return;
        }
        out.push("<tr>");
        cols.forEach((column, i) => {
          const index = this.columns.indexOf(column);
          const value = this.cellOf(w.h, column, index);
          const text = cellText(value, column, this.fmt);
          const content = h("span");
          const slot = {};
          try {
          if (!column.render || column.render(w.h, content, new HostCellContext(slot, column.id, w.level, w.expanded, index)) !== true) {
            const badges = (i === 0 ? w.h.badges || [] : []).concat(isCellObject(value) ? value.badges || [] : []);
            content.appendChild(detailCell("span", Object.assign({}, isCellObject(value) ? value : {}, { text, badges }), this.fmt));
          }
          out.push("<td" + (i === 0 ? pad : "") + ">" + content.outerHTML + "</td>");
          } finally { disposeHostSlot(slot); }
        });
        out.push("</tr>");
      });
      out.push("</tbody></table>");
      return out.join("");
    }
  });

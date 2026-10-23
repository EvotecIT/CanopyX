  // ---------- resource timeline: the print layout ----------
  // Printing a timeline cannot rely on virtual rows and a scrolled axis, so beforeprint writes a static copy: the resources the
  // tree shows (indented, at most 400), each with its events as bars placed by share of the span across the page width, the
  // span's header and the capacity of groups as numbers. It is shown only in print and removed afterwards.
  // Bars are placed by share of the lane; the lane is about TL_PRINT_LANE CSS pixels wide on a landscape page, which decides
  // whether a bar gets the minimum solid width and whether its title fits (about TL_PRINT_CHAR pixels a character at 10px).
  const TL_PRINT_ROWS = 400, TL_PRINT_LANE = 760, TL_PRINT_CHAR = 5.6;
  Object.assign(DataGrid.prototype, {
    tlPrint(on) {
      this.tlPrintView?.remove(); this.tlPrintView = null;
      if (!on || this.calView !== "timeline" || !this.tlTree || !this.tlAxis) return;
      const axis = this.tlAxis, tree = this.tlTree, view = this.tlPrintView = h("div", "cx-tl-print"), share = time => (axis.x(time) / axis.total * 100) + "%";
      view.setAttribute("aria-hidden", "true");
      const head = h("div", "cx-tl-print-row cx-tl-print-head"), corner = h("div", "cx-tl-print-name"), scale = h("div", "cx-tl-print-lane");
      setText(corner, this.tlSolo ? "" : this.cal.resources?.label || this.calLabels.calendarResources);
      for (const cell of this.tlHeader.lower) {
        const mark = h("span", "cx-tl-print-unit"); mark.style.insetInlineStart = (cell.x / axis.total * 100) + "%"; mark.style.width = (cell.width / axis.total * 100) + "%";
        setText(mark, cell.text); scale.appendChild(mark);
      }
      head.append(corner, scale); view.appendChild(head);
      for (const row of tree.rows.filter(item => !item.status).slice(0, TL_PRINT_ROWS)) {
        const line = h("div", "cx-tl-print-row"), name = h("div", "cx-tl-print-name"), lane = h("div", "cx-tl-print-lane"), group = this.tl.children.has(row.key);
        name.style.paddingInlineStart = (4 + (row.level - 1) * 12) + "px"; setText(name, this.tlSolo ? "" : this.calResourceName(row.key));
        if (group) {
          line.classList.add("cx-tl-print-group");
          this.tlHeat(row.key).forEach((value, index) => { if (!value) return; const unit = axis.units[index], mark = h("span", "cx-tl-print-heat");
            mark.style.insetInlineStart = (unit.x / axis.total * 100) + "%"; mark.style.width = (axis.width / axis.total * 100) + "%"; setText(mark, String(value)); lane.appendChild(mark); });
        } else for (const event of this.tlIndex.byResource.get(row.key) || []) {
          if (event.tlEnd <= axis.from || event.tlStart >= axis.to) continue;
          const bar = h("span", "cx-tl-print-bar");
          const from = Math.max(event.tlStart, axis.from), to = Math.min(event.tlEnd, axis.to), pixels = (axis.x(to) - axis.x(from)) / axis.total * TL_PRINT_LANE;
          bar.style.insetInlineStart = share(from); bar.style.width = "max(6px, calc(" + share(to) + " - " + share(from) + "))";
          if (event.tone) bar.style.setProperty("--cx-ev", toneVariable(event.tone, false, "var(--hfx-color-accent)"));
          // A short bar is solid; a title is printed only where it fits whole.
          if (pixels < 16) bar.classList.add("cx-tl-print-tiny");
          if (pixels >= event.title.length * TL_PRINT_CHAR + 8) setText(bar, event.title);
          bar.title = this.calEventName(event); lane.appendChild(bar);
        }
        line.append(name, lane); view.appendChild(line);
      }
      this.tlRoot.appendChild(view);
    }
  });

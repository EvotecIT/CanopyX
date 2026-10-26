  // ---------- calendar: the details popover and the hover card ----------
  // A calendar whose details are "popover" opens a small dialog beside an activated event instead of the record drawer: its
  // title, time, status, resource and description, as text. Escape, the close button or a press outside close it and give focus
  // back to the event. The hover card is the same content without focus: it shows after a short delay over an event on pointer
  // devices and hides when the pointer leaves, a drag starts or a key is pressed.
  const CAL_HOVER_DELAY = 600;

  Object.assign(DataGrid.prototype, {
    /** The details of an event as elements: title, time, status, resource and description (all text). */
    calDetailsContent(event, titleId) {
      const title = h("h3", "cx-cal-det-title"), when = h("p", "cx-cal-det-when"), parts = [title, when];
      if (titleId) title.id = titleId;
      setText(title, event.title); setText(when, this.calTimeText(event));
      const status = this.calStatusText(event), resource = this.calEventResources(event).map(id => this.calResourceName ? this.calResourceName(id) : id).join(", ");
      const fields = event.base?.external ? event.row.fields : null, sourceName = fields ? this.cal.sources.find(source => source.id === event.base.source)?.label : "";
      const facts = [status, resource, event.subtitle, fields?.location, sourceName].filter(Boolean);
      if (facts.length) { const line = h("p", "cx-cal-det-facts"); setText(line, facts.join(" · ")); parts.push(line); }
      const description = fields ? fields.description || "" : this.cal.description ? cellText(event.row.cells[this.cal.description.id], this.cal.description, this.fmt) : "";
      if (description) { const text = h("p", "cx-cal-det-desc"); setText(text, description); parts.push(text); }
      return parts;
    },
    /** Places a floating panel beside an anchor inside the calendar, kept within its frame. */
    calPlace(panel, anchor) {
      this.calRoot.appendChild(panel);
      const box = anchor.getBoundingClientRect(), frame = this.calRoot.getBoundingClientRect(), width = Math.min(320, frame.width - 16);
      panel.style.width = width + "px";
      const rtl = getComputedStyle(this.calRoot).direction === "rtl";
      const right = box.right - frame.left + 6, left = box.left - frame.left - width - 6;
      let x = rtl ? (left >= 8 ? left : right) : (right + width <= frame.width - 8 ? right : left);
      x = Math.max(8, Math.min(x, frame.width - width - 8));
      panel.style.left = x + "px";
      panel.style.top = Math.max(8, Math.min(box.top - frame.top, frame.height - panel.offsetHeight - 8)) + "px";
    },
    /** Opens the details popover of an event; focus moves into it and comes back to the anchor when it closes. */
    calShowDetails(event, anchor) {
      this.calCloseDetails(false); this.calHideHover();
      const panel = this.calDetails = h("div", "cx-cal-details"), close = gridButton("", () => this.calCloseDetails(true)), head = h("div", "cx-cal-det-top");
      const titleId = this.id + "-cal-det";
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", titleId);
      close.classList.add("cx-btn", "icon", "ghost", "cx-cal-det-close"); close.setAttribute("aria-label", this.calLabels.calendarClose); close.appendChild(gridIcon("close"));
      const [title, ...rest] = this.calDetailsContent(event, titleId);
      head.append(title, close); panel.append(head, ...rest);
      panel._calAnchor = anchor;
      this.calPlace(panel, anchor || this.calBody);
      const description = panel.querySelector(".cx-cal-det-desc");
      if (description && description.scrollHeight > description.clientHeight + 1) description.tabIndex = 0;
      panel.addEventListener("keydown", key => {
        if (key.key === "Escape") { key.preventDefault(); key.stopPropagation(); this.calCloseDetails(true); }
        // Tab stays in the popover: the close button, and a long description that scrolls.
        else if (key.key === "Tab") {
          key.preventDefault();
          const stops = [close, ...panel.querySelectorAll(".cx-cal-det-desc[tabindex]")], at = stops.indexOf(document.activeElement);
          stops[(at + (key.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
        }
      });
      this.calDetailsOutside = press => { if (!panel.contains(press.target) && press.target !== anchor) this.calCloseDetails(false); };
      document.addEventListener("pointerdown", this.calDetailsOutside, true);
      close.focus({ preventScroll: true });
      return panel;
    },
    calCloseDetails(restore) {
      const panel = this.calDetails;
      if (!panel) return;
      this.calDetails = null; document.removeEventListener("pointerdown", this.calDetailsOutside, true);
      panel.remove();
      if (restore && panel._calAnchor?.isConnected) panel._calAnchor.focus({ preventScroll: true });
    },

    /** Arms the hover card of the event under a pointer that hovers (not touch), unless a drag, a popover or a menu is open. */
    calHoverOver(pointer) {
      if (!this.cal.hover || pointer.pointerType === "touch" || this.calDrag || this.calMoving || this.calDetails || this.calMenu) return;
      const element = pointer.target.closest?.(".cx-cal-ev");
      if (!element?._calEvent || element === this.calHoverAnchor) return;
      this.calHideHover();
      this.calHoverAnchor = element;
      this.calHoverTimer = setTimeout(() => {
        if (this.destroyed || !element.isConnected || this.calDrag || this.calDetails) return;
        const card = this.calHover = h("div", "cx-cal-hover");
        card.setAttribute("aria-hidden", "true");
        card.append(...this.calDetailsContent(element._calEvent));
        this.calPlace(card, element);
      }, CAL_HOVER_DELAY);
    },
    calHoverOut(pointer) {
      if (this.calHoverAnchor && !this.calHoverAnchor.contains(pointer.relatedTarget)) this.calHideHover();
    },
    calHideHover() {
      clearTimeout(this.calHoverTimer); this.calHoverAnchor = null;
      this.calHover?.remove(); this.calHover = null;
    }
  });

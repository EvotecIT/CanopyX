  // ---------- calendar: event sources and their legend ----------
  // A calendar with sources shows a legend under its bar: one switch per source with its tone, pressed while its events show.
  // Switching one off hides its events in every view at once, without loading again; the choice stays while the calendar does.
  // When the switches do not fit on one line they fold into a menu with a checkbox per source.
  // Records name their source in the source column; an iCalendar source's events are its own.
  Object.assign(DataGrid.prototype, {
    calBuildLegend() {
      const sources = this.cal.sources, labels = this.calLabels;
      this.calHiddenSources = new Set(sources.filter(source => source.hidden).map(source => source.id));
      if (!sources.length) return null;
      // Chips that do not fit on one line fold into a menu of checkboxes (calFitLegend).
      const legend = this.calLegend = h("div", "cx-cal-legend"), chips = this.calLegendChips = h("div", "cx-cal-srcs"), menu = this.calLegendMenu = h("div", "cx-cal-src-menu");
      const fold = this.calLegendFold = h("button", "cx-btn cx-cal-src-fold");
      legend.setAttribute("role", "group"); legend.setAttribute("aria-label", labels.calendarSources);
      fold.type = "button"; fold.hidden = true; menu.hidden = true; menu.id = this.id + "-cal-srcs"; fold.setAttribute("aria-controls", menu.id); fold.setAttribute("aria-expanded", "false");
      menu.setAttribute("role", "group"); menu.setAttribute("aria-label", labels.calendarSources);
      const close = focus => { menu.hidden = true; fold.setAttribute("aria-expanded", "false"); if (focus) fold.focus(); };
      fold.addEventListener("click", () => { menu.hidden = !menu.hidden; fold.setAttribute("aria-expanded", String(!menu.hidden)); if (!menu.hidden) this.calPlaceLegendMenu(); menu.querySelector("input").focus(); });
      menu.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); close(true); } });
      for (const type of ["focusout", "pointerdown"]) document.addEventListener(type, event => { if (!legend.contains(event.relatedTarget ?? event.target)) close(false); }, { signal: this.lifetime.signal });
      for (const source of sources) {
        const button = h("button", "cx-chip cx-cal-src"), swatch = h("i", "cx-cal-src-swatch"), text = h("span");
        const item = h("label", "cx-cal-src-item"), check = h("input"), mark = h("i", "cx-cal-src-swatch"), name = h("span");
        button.type = "button"; button.dataset.cxSource = source.id; button.setAttribute("aria-pressed", String(!this.calHiddenSources.has(source.id)));
        check.type = "checkbox"; check.dataset.cxSourceCheck = source.id; check.checked = !this.calHiddenSources.has(source.id);
        for (const element of [button, item]) {
          if (source.tone) element.style.setProperty("--cx-ev", toneVariable(source.tone, false, "var(--hfx-color-accent)"));
          if (source.color) element.style.setProperty("--cx-ev", source.color);
        }
        swatch.setAttribute("aria-hidden", "true"); mark.setAttribute("aria-hidden", "true"); setText(text, source.label); setText(name, source.label);
        button.append(swatch, text); item.append(check, mark, name);
        button.addEventListener("click", () => this.calToggleSource(source.id));
        check.addEventListener("change", () => this.calToggleSource(source.id, check.checked));
        chips.appendChild(button); menu.appendChild(item);
      }
      legend.append(chips, fold, menu);
      this.calSyncLegend();
      return legend;
    },
    /** Folds the chips into the menu while they do not fit on one line, and unfolds them once they do. */
    calFitLegend() {
      const legend = this.calLegend;
      if (!legend?.clientWidth) return;
      const folded = legend.classList.contains("cx-cal-folded");
      if (!folded) this.calLegendNeed = this.calLegendChips.scrollWidth;
      // The chips get the legend's content width: its padding is not theirs.
      const style = getComputedStyle(legend), fold = legend.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) < this.calLegendNeed - 1;
      if (fold === folded) return;
      legend.classList.toggle("cx-cal-folded", fold); this.calLegendFold.hidden = !fold; this.calLegendChips.hidden = fold;
      if (!fold) { this.calLegendMenu.hidden = true; this.calLegendFold.setAttribute("aria-expanded", "false"); }
    },
    /** Opens the menu below the legend, or above it when there is more room there, no taller than the screen has room for. */
    calPlaceLegendMenu() {
      const menu = this.calLegendMenu, box = this.calLegend.getBoundingClientRect(), screen = window.visualViewport?.height ?? window.innerHeight;
      const below = screen - box.bottom, above = box.top, up = below < menu.scrollHeight && above > below;
      menu.classList.toggle("cx-cal-src-up", up);
      menu.style.setProperty("--cx-cal-menu-room", Math.max(0, Math.min(360, Math.floor((up ? above : below) - 8))) + "px");
    },
    calSyncLegend() {
      const total = this.cal.sources.length, shown = total - this.calHiddenSources.size;
      setText(this.calLegendFold, this.calLabels.calendarSources + " · " + fill(this.calLabels.calendarSourcesShown, { shown, total }));
    },
    /** Shows (visible true) or hides a source's events; omitted switches it. Returns whether they show. */
    setCalendarSource(id, visible) { return this.calToggleSource(id, visible); },
    calToggleSource(id, show) {
      const hidden = this.calHiddenSources, source = this.cal.sources.find(item => item.id === id);
      if (!source) throw new Error("CanopyX: the calendar has no source " + id + ".");
      const visible = show === undefined ? hidden.has(id) : !!show;
      if (visible) hidden.delete(id); else hidden.add(id);
      if (this.calLegend) {
        this.calLegend.querySelector('[data-cx-source="' + CSS.escape(id) + '"]').setAttribute("aria-pressed", String(visible));
        this.calLegend.querySelector('[data-cx-source-check="' + CSS.escape(id) + '"]').checked = visible;
        this.calSyncLegend();
      }
      // The timeline caches its lanes by version: a source switch repaints them too.
      this.calSourceVersion = (this.calSourceVersion || 0) + 1;
      if (this.calAllEvents) { this.calEvents = this.calShownEvents(this.calAllEvents); this.calPaint({ keep: true }); }
      this.emit("calendarSource", { id, visible });
      if (source.url) this.calReload({ keep: true });
      return visible;
    },
    /** The events of the sources switched on. */
    calShownEvents(events) {
      const hidden = this.calHiddenSources;
      return hidden?.size ? events.filter(event => !event.base.source || !hidden.has(event.base.source)) : events;
    }
  });

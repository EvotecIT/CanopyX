  // ---------- calendar: event sources and their legend ----------
  // A calendar with sources shows a legend under its bar: one switch per source with its tone, pressed while its events show.
  // Switching one off hides its events in every view at once, without loading again; the choice stays while the calendar does.
  // Records name their source in the source column; an iCalendar source's events are its own.
  Object.assign(DataGrid.prototype, {
    calBuildLegend() {
      const sources = this.cal.sources;
      this.calHiddenSources = new Set(sources.filter(source => source.hidden).map(source => source.id));
      if (!sources.length) return null;
      const legend = this.calLegend = h("div", "cx-cal-legend");
      legend.setAttribute("role", "group"); legend.setAttribute("aria-label", this.calLabels.calendarSources);
      for (const source of sources) {
        const button = h("button", "cx-chip cx-cal-src"), swatch = h("i", "cx-cal-src-swatch"), text = h("span");
        button.type = "button"; button.dataset.cxSource = source.id; button.setAttribute("aria-pressed", String(!this.calHiddenSources.has(source.id)));
        if (source.tone) button.style.setProperty("--cx-ev", toneVariable(source.tone, false, "var(--hfx-color-accent)"));
        if (source.color) button.style.setProperty("--cx-ev", source.color);
        swatch.setAttribute("aria-hidden", "true"); setText(text, source.label);
        button.append(swatch, text);
        button.addEventListener("click", () => this.calToggleSource(source.id));
        legend.appendChild(button);
      }
      return legend;
    },
    /** Shows (visible true) or hides a source's events; omitted switches it. Returns whether they show. */
    setCalendarSource(id, visible) { return this.calToggleSource(id, visible); },
    calToggleSource(id, show) {
      const hidden = this.calHiddenSources, source = this.cal.sources.find(item => item.id === id);
      if (!source) throw new Error("CanopyX: the calendar has no source " + id + ".");
      const visible = show === undefined ? hidden.has(id) : !!show;
      if (visible) hidden.delete(id); else hidden.add(id);
      this.calLegend?.querySelector('[data-cx-source="' + CSS.escape(id) + '"]')?.setAttribute("aria-pressed", String(visible));
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

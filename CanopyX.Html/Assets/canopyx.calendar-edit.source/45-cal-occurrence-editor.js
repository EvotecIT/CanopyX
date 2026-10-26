  // ---------- calendar: a form for one recurring occurrence ----------
  Object.assign(DataGrid.prototype, {
    /** Opens a title/time editor for one occurrence; all writes use the ordinary host-governed editing contract. */
    async editCalendarOccurrence(id) {
      const event = this.calEventTarget(id)?._calEvent || this.calEvents.find(item => item.id === id);
      if (!event?.recurring || !this.cal.series?.editable || !this.cal.recurrenceId?.editable || !this.calCanEdit(event, false)) return false;
      await this.loadEditing();
      calWrapEditRecord();
      const decision = this.calEditSnapshot(event), current = this.calEditCurrent(event, decision);
      if (!current) return false;
      this.calOccurrenceForm(current, decision);
      return true;
    },
    calOccurrenceForm(event, decision) {
      this.calCloseOccurrence(false); this.calCloseDetails(false); this.calHideHover();
      const panel = this.calOccurrenceEditor = h("form", "cx-cal-create cx-cal-occurrence-editor"), heading = h("h3", "cx-cal-create-h");
      const labels = this.calLabels, titleId = this.id + "-cal-occurrence", fields = new Map();
      heading.id = titleId; setText(heading, labels.calendarEditOccurrence);
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", titleId);
      panel.appendChild(heading);
      const when = h("p", "cx-cal-det-when"); when.id = titleId + "-scope";
      setText(when, fill(labels.calendarOccurrenceScope, { date: this.calFmt.day({ weekday: "short", day: "numeric", month: "short" }, event.sd), title: event.title }));
      panel.setAttribute("aria-describedby", when.id); panel.appendChild(when);
      const resources = this.calEventResources(event);
      if (resources.length > 1) { const line = h("p", "cx-cal-det-when"); setText(line, resources.map(id => this.calResourceName?.(id) || id).join(", ")); panel.appendChild(line); }
      const wall = time => {
        if (event.allDay) return calDayText(Math.floor(time / CAL_DAY));
        const minutes = this.calZone.parts(time).minutes, pad = value => String(value).padStart(2, "0");
        return calDayText(this.calZone.day(time)) + "T" + pad(Math.floor(minutes / 60)) + ":" + pad(minutes % 60);
      };
      const addField = (name, text, value, type, column) => {
        const label = h("label", "cx-cal-create-l"), input = h("input", "cx-cal-create-input");
        input.id = titleId + "-" + name; input.name = name; input.type = type; input.value = value; input.required = true;
        input.disabled = !column?.editable || !this.canEditCell(event.row, column.id);
        if (type === "text") input.maxLength = 1000; else if (type === "datetime-local") input.step = "60";
        label.htmlFor = input.id; setText(label, text); fields.set(name, input); panel.append(label, input);
      };
      addField("title", labels.calendarEventTitle, event.title, "text", this.cal.title);
      addField("start", this.cal.start.title, wall(event.start), event.allDay ? "date" : "datetime-local", this.cal.start);
      if (this.cal.end) addField("end", this.cal.end.title, wall(event.end), event.allDay ? "date" : "datetime-local", this.cal.end);
      // datetime-local normalizes its value and cannot retain a repeated hour's offset. Untouched endpoints keep their instants.
      const original = new Map([...fields].map(([name, input]) => [name, input.value]));
      const message = h("p", "cx-cal-occurrence-error"); message.setAttribute("role", "status"); message.hidden = true;
      const actions = h("div", "cx-cal-create-actions"), cancel = h("button", "cx-btn ghost"), save = h("button", "cx-btn cx-cal-create-add");
      cancel.type = "button"; save.type = "submit"; setText(cancel, labels.calendarCancel); setText(save, this.edit.labels.gridEditSave);
      cancel.addEventListener("click", () => this.calCloseOccurrence(true));
      const remove = h("button", "cx-btn ghost cx-cal-occurrence-remove"); remove.type = "button"; setText(remove, labels.calendarRemoveOccurrence);
      remove.disabled = !this.cal.exceptions?.editable || !this.canEditCell(event.row, this.cal.exceptions.id);
      remove.addEventListener("click", async () => {
        save.disabled = remove.disabled = true;
        try {
          const current = this.calEditCurrent(event, decision);
          if (!current) { this.calRefuseDecision(); this.calCloseOccurrence(true); return; }
          if (await this.calRemoveOccurrence(current)) this.calCloseOccurrence(true);
          else { setText(message, this.calNoticeElement.textContent || this.edit.labels.gridEditNotSaved); message.hidden = false; }
        } catch (error) { this.emit("error", { error }); setText(message, this.edit.labels.gridEditNotSaved); message.hidden = false; }
        finally { save.disabled = remove.disabled = false; }
      });
      actions.append(remove, cancel, save); panel.append(message, actions);
      panel._calAnchor = this.calEventTarget(event.id);
      this.calPlace(panel, panel._calAnchor || this.calBody);
      if (this.calPhone) { panel.classList.add("cx-cal-occurrence-sheet"); panel.style.removeProperty("width"); panel.style.removeProperty("left"); panel.style.removeProperty("top"); }
      else {
        const box = panel.getBoundingClientRect(), frame = this.calRoot.getBoundingClientRect();
        let top = box.top;
        for (const card of this.calBody.querySelectorAll(".cx-cal-ev")) {
          const other = card.getBoundingClientRect();
          if (card.dataset.cxEvent !== event.id && other.left < box.right && other.right > box.left && other.bottom > top && other.top < top + box.height)
            top = Math.max(top, other.bottom + 6);
        }
        if (top + box.height <= frame.bottom - 8) panel.style.top = (top - frame.top) + "px";
      }
      panel.addEventListener("keydown", key => {
        if (key.key === "Escape") { key.preventDefault(); key.stopPropagation(); this.calCloseOccurrence(true); }
        if (key.key === "Tab") {
          const stops = [...panel.querySelectorAll("input:not(:disabled),button:not(:disabled)")], at = stops.indexOf(document.activeElement);
          key.preventDefault(); stops[(at + (key.shiftKey ? stops.length - 1 : 1)) % stops.length]?.focus();
        }
      });
      panel.addEventListener("submit", async submit => {
        submit.preventDefault(); save.disabled = remove.disabled = true;
        try {
          const current = this.calEditCurrent(event, decision);
          if (!current) { this.calRefuseDecision(); this.calCloseOccurrence(true); return; }
          const read = name => {
            const value = fields.get(name)?.value, day = this.calKit.calParseDay(value?.slice(0, 10));
            if (value === original.get(name)) return event[name];
            if (event.allDay) return day * CAL_DAY;
            const parts = /^\d{4}-\d\d-\d\dT(\d\d):(\d\d)(?::(\d\d(?:\.\d+)?))?$/.exec(value || "");
            return parts ? this.calZone.instant(day, Number(parts[1]) * 60 + Number(parts[2])) + Number(parts[3] || 0) * 1000 : NaN;
          };
          const proposal = { start: read("start"), end: fields.has("end") ? read("end") : read("start"), allDay: event.allDay, resource: event.resource };
          if (!Number.isFinite(proposal.start) || !Number.isFinite(proposal.end) || proposal.end < proposal.start) { setText(message, labels.calendarOutsideRange); message.hidden = false; return; }
          if (!this.emit("occurrenceChange", { id: event.key, occurrence: calIso(event.start), start: calIso(proposal.start), end: calIso(proposal.end), resource: event.resource })) return;
          const plan = this.calOccurrencePlan(current, proposal, "this"), title = fields.get("title");
          if (!title.disabled) plan.cells[this.cal.title.id] = title.value;
          if (await this.calApplyThis(current, proposal, plan, decision)) this.calCloseOccurrence(true);
          else { setText(message, this.calNoticeElement.textContent || this.edit.labels.gridEditNotSaved); message.hidden = false; }
        } catch (error) { this.emit("error", { error }); setText(message, this.edit.labels.gridEditNotSaved); message.hidden = false; }
        finally { save.disabled = false; remove.disabled = !this.cal.exceptions?.editable || !this.canEditCell(event.row, this.cal.exceptions.id); }
      });
      [...fields.values()].find(input => !input.disabled)?.focus({ preventScroll: true });
    },
    /** Excludes one master occurrence through the existing cell validation, undo and host writer. */
    async calRemoveOccurrence(event) {
      const column = this.cal.exceptions, record = this.editRecord(event.key), spec = column && this.edit.specs.get(column.id);
      if (!spec || !this.canEditCell(record, column.id)) return false;
      const previous = String(cellValue(record.cells[column.id]) || "").trim();
      if (previous.split(/[\s,;]+/).filter(Boolean).length >= 1000) return false;
      const value = previous ? previous + "," + calIso(event.start) : calIso(event.start);
      if (!this.editApply(event.key, spec, value, "calendar", record)) return false;
      const checked = await this.editValidateRow(event.key);
      if (!checked.valid) { this.calInvalidInsert({ id: event.key, errors: checked.errors }); return false; }
      this.calVersion++; this.calCache?.clear();
      if (this.cal.editable.commit === "manual") { this.calReload({ keep: true }); return true; }
      return this.calCommit([event.key], event.title);
    },
    calCloseOccurrence(restore) {
      const panel = this.calOccurrenceEditor;
      if (!panel) return;
      this.calOccurrenceEditor = null; panel.remove();
      if (restore) { if (panel._calAnchor?.isConnected) panel._calAnchor.focus({ preventScroll: true }); else this.calRestoreFocus(true); }
    }
  });

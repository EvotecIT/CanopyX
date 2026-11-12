  // ---------- calendar shared screens: faces and merged events ----------
  // A source or a resource with a face draws it in front of its events in every view and in its legend switch, so whose plan
  // it is shows before the title can be read; the face is decoration and the accessible names keep their meaning. With merge,
  // copies of one event in several sources (the same title, start, end, all-day flag and location) draw once, with every
  // owner's face in source order, and the event's accessible name adds who shares it. The first owner's copy is the one that
  // opens and exports; linked views see the records of every copy.
  const CAL_SCREEN_BASE = { shown: DataGrid.prototype.calShownEvents, element: DataGrid.prototype.calEventElement, name: DataGrid.prototype.calEventName,
    details: DataGrid.prototype.calDetailsContent, events: DataGrid.prototype.getCalendarEvents, public: DataGrid.prototype.calPublicEvent,
    highlights: DataGrid.prototype.calMarkHighlights, legend: DataGrid.prototype.calBuildLegend, link: DataGrid.prototype.calEmitLink };
  const CAL_FACES_SHOWN = 4;

  /** One face as decoration: the avatar (its initials, else the label's first letter, when the image fails), the initials or the icon. */
  function calFaceElement(face, label, color) {
    const element = h("span", "cx-cal-face"), fallback = () => face.initials || face.icon || [...label.trim()][0] || "";
    element.setAttribute("aria-hidden", "true");
    if (color) element.style.setProperty("--cx-face", color);
    if (face.avatar) {
      const image = h("img");
      image.alt = ""; image.decoding = "async"; image.draggable = false;
      image.addEventListener("error", () => { image.remove(); setText(element, fallback()); }, { once: true });
      image.src = face.avatar; element.appendChild(image);
    } else { setText(element, fallback()); if (!face.initials) element.classList.add("cx-cal-face-icon"); }
    return element;
  }

  Object.assign(DataGrid.prototype, {
    /** The colour a source draws with: its colour, else its tone, else none (the event's own). */
    calSourceColor(source) { return source.color || (source.tone ? toneVariable(source.tone, false, "var(--hfx-color-accent)") : null); },
    /** The faces in front of an event: every owner of a merged event, else its source's, else its resource's. */
    calFacesOf(event) {
      const cal = this.cal, sources = cal.sources;
      if (event.owners) return event.owners.map(id => sources.find(source => source.id === id)).map(source => ({ face: source.face || {}, label: source.label, color: this.calSourceColor(source) }));
      const source = event.base?.source != null ? sources.find(item => item.id === event.base.source) : null;
      if (source?.face) return [{ face: source.face, label: source.label, color: this.calSourceColor(source) }];
      const resource = cal.faces?.size ? this.calEventResources(event).find(id => cal.faces.has(id)) : null;
      return resource != null ? [{ face: cal.faces.get(resource), label: this.calResourceName?.(resource) || resource, color: null }] : [];
    },
    calShownEvents(events) {
      const shown = CAL_SCREEN_BASE.shown.call(this, events), merge = this.cal.merge;
      if (!merge) return shown;
      const order = new Map(this.cal.sources.map((source, index) => [source.id, index])), groups = new Map(), out = [];
      for (const event of shown) {
        const source = event.base.source;
        if (event.background || !order.has(source)) { out.push(event); continue; }
        const key = JSON.stringify([event.title.trim().toLocaleLowerCase(), event.start, event.end, event.allDay, event.base.location.toLocaleLowerCase()]), list = groups.get(key) || groups.set(key, []).get(key);
        // Two copies in one source are two events of that source: each joins a group its source is not in yet.
        const group = list.find(members => !members.some(member => member.base.source === source));
        if (group) { group.push(event); continue; }
        const members = [event]; out.push(members); list.push(members);
      }
      return out.map(item => {
        if (!Array.isArray(item)) return item;
        if (item.length === 1) return item[0];
        const members = item.sort((a, b) => order.get(a.base.source) - order.get(b.base.source)), first = members[0];
        return { ...first, owners: members.map(member => member.base.source), members, ...merge.tone ? { tone: merge.tone, color: null } : {} };
      });
    },
    calEventElement(event, kind, day) {
      const element = CAL_SCREEN_BASE.element.call(this, event, kind, day);
      if (!this.cal.dayNotes) return element;
      if (event.owners) {
        element.classList.add("cx-cal-merged"); if (this.cal.merge.tone) element.dataset.cxShared = "true";
        if (event.members.some(member => !member.base.external && this.linkHighlight?.has(member.key))) element.dataset.cxLinked = "true";
      }
      // A host template that owns the content draws its own faces (calPublicEvent names the owners).
      const faces = element.querySelector(":scope > .cx-cal-ev-title") ? this.calFacesOf(event) : [];
      if (faces.length) {
        const group = h("span", "cx-cal-faces");
        if (faces.length > 1) group.dataset.cxMore = "+" + (faces.length - 1);
        group.setAttribute("aria-hidden", "true");
        for (const item of faces.slice(0, faces.length > CAL_FACES_SHOWN ? CAL_FACES_SHOWN - 1 : CAL_FACES_SHOWN)) group.append(calFaceElement(item.face, item.label, item.color), " ");
        if (faces.length > CAL_FACES_SHOWN) { const more = h("span", "cx-cal-face cx-cal-face-more"); setText(more, "+" + (faces.length - CAL_FACES_SHOWN + 1)); group.appendChild(more); }
        element.prepend(group, " "); element.classList.add("cx-cal-faced");
      }
      this.calMarkPast(element);
      return element;
    },
    calEventName(event) {
      const name = CAL_SCREEN_BASE.name.call(this, event);
      if (!event.owners) return name;
      const names = event.owners.map(id => this.cal.sources.find(source => source.id === id).label).join(", ");
      return name + ", " + fill(this.calLabels.calendarSharedBy, { names });
    },
    calPublicEvent(event) {
      const plain = CAL_SCREEN_BASE.public.call(this, event);
      return event.owners ? gridFreeze({ ...plain, owners: event.owners }) : plain;
    },
    getCalendarEvents() {
      const list = CAL_SCREEN_BASE.events.call(this), events = this.calEvents;
      return list.some((item, index) => events[index]?.owners) ? gridFreeze(list.map((item, index) => events[index].owners ? gridFreeze({ ...item, owners: events[index].owners }) : item)) : list;
    },
    /** The details add each owner (face and name) and the location of a record. */
    calDetailsContent(event, titleId) {
      const parts = CAL_SCREEN_BASE.details.call(this, event, titleId), faces = this.cal.dayNotes ? this.calFacesOf(event) : [];
      // Every owner of a merged event, else the source's or the resource's face, with its name.
      if (faces.length) {
        const owners = h("p", "cx-cal-det-owners");
        for (const { face, label, color } of faces) { const item = h("span", "cx-cal-det-owner"), text = h("span"); setText(text, label); item.append(calFaceElement(face, label, color), text); owners.appendChild(item); }
        parts.splice(2, 0, owners);
      }
      if (!event.base?.external && event.base?.location) { const where = h("p", "cx-cal-det-facts"); setText(where, event.base.location); parts.splice(2, 0, where); }
      return parts;
    },
    calMarkHighlights() {
      CAL_SCREEN_BASE.highlights.call(this);
      const keys = this.linkHighlight;
      if (keys?.size) for (const element of this.calBody.querySelectorAll(".cx-cal-merged"))
        if (element._calEvent.members.some(member => !member.base.external && keys.has(member.key))) element.dataset.cxLinked = "true";
    },
    calEmitLink(action, events, label, selection) { return CAL_SCREEN_BASE.link.call(this, action, events.flatMap(event => event.members || [event]), label, selection); },
    calBuildLegend() {
      const legend = CAL_SCREEN_BASE.legend.call(this);
      if (legend && this.cal.dayNotes) for (const source of this.cal.sources) if (source.face) {
        const id = CSS.escape(source.id), swatches = [legend.querySelector('[data-cx-source="' + id + '"] > .cx-cal-src-swatch'), legend.querySelector('[data-cx-source-check="' + id + '"]').nextElementSibling];
        for (const swatch of swatches) swatch.replaceWith(calFaceElement(source.face, source.label, this.calSourceColor(source)));
      }
      return legend;
    }
  });

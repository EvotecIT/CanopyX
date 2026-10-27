  // ---------- resource timeline: lanes, events, shading, capacity and aggregates ----------
  // Only the lanes of the rows the tree shows exist, each with the events and gridcells inside the visible width plus a margin,
  // so 5,000 resources and 100,000 events paint as fast as twenty. A lane stacks overlapping events in up to four sub-rows.
  // A group's lane shows its capacity instead: the most events at once among its resources in each unit, toned by the
  // capacity thresholds. Business hours (hour zoom), unavailable time and background ranges shade the lanes behind events.
  const TL_MARGIN = 480, TL_STACK = 4, TL_MIN_BAR = 8, TL_SOLID_BAR = 16;

  Object.assign(DataGrid.prototype, {
    /** Events by resource, sorted by start, with their sub-rows; background events apart. */
    tlIndexEvents() {
      const byResource = new Map(), backgrounds = new Map();
      for (const event of this.calEvents) { const span = this.calDisplaySpan(event); event.tlStart = span.start; event.tlEnd = span.end; }
      if (this.tlSolo) return this.tlIndexSolo(backgrounds);
      for (const event of this.calEvents) {
        const target = event.background ? backgrounds : byResource, resources = this.calEventResources(event);
        for (const key of resources.length ? resources : [""]) {
          if (!target.has(key)) target.set(key, []);
          target.get(key).push({ ...event, resource: key || null });
        }
      }
      for (const list of byResource.values()) {
        list.sort((a, b) => a.tlStart - b.tlStart || b.tlEnd - a.tlEnd);
        const ends = [];
        for (const event of list) {
          let lane = ends.findIndex(end => end <= event.tlStart);
          if (lane < 0) { lane = ends.length; ends.push(0); }
          ends[lane] = Math.max(event.tlEnd, event.tlStart + 1); event.tlLane = lane;
        }
        list.lanes = Math.max(1, ends.length);
      }
      this.tl.stats = null;
      return { byResource, backgrounds };
    },
    /** Without resources: each row is a lane of events that do not overlap, filled first come first served. */
    tlIndexSolo(backgrounds) {
      const byResource = new Map(), ends = [], tree = this.tlTree, events = this.calEvents.filter(event => !event.background).sort((a, b) => a.tlStart - b.tlStart || b.tlEnd - a.tlEnd);
      for (const event of this.calEvents) if (event.background) { if (!backgrounds.has("")) backgrounds.set("", []); backgrounds.get("").push(event); }
      for (const event of events) {
        let lane = ends.findIndex(end => end <= event.tlStart);
        if (lane < 0) { lane = ends.length; ends.push(0); }
        ends[lane] = Math.max(event.tlEnd, event.tlStart + 1);
        const key = "lane-" + lane; event.tlLane = 0; event.tlRow = key;
        if (!byResource.has(key)) { const list = []; list.lanes = 1; byResource.set(key, list); }
        byResource.get(key).push(event);
      }
      const count = Math.max(1, ends.length);
      tree.rows = Array.from({ length: count }, (_, index) => ({ key: "lane-" + index, level: 1, status: null, h: { label: String(index + 1) } }));
      tree.tops = Array.from({ length: count + 1 }, (_, index) => index * tree.rowH);
      for (const row of tree.rows) this.tl.names.set(row.key, row.h.label);
      tree.version++;
      this.tl.stats = null;
      return { byResource, backgrounds };
    },
    tlVisibleRows(margin) {
      const tree = this.tlTree, tops = tree.tops, count = tree.rows.length, main = this.tlMain;
      if (!count) return { first: 0, last: -1 };
      const top = main.scrollTop, bottom = top + main.clientHeight, find = y => { let low = 0, high = count - 1; while (low < high) { const mid = (low + high + 1) >> 1; if (tops[mid] <= y) low = mid; else high = mid - 1; } return low; };
      return { first: Math.max(0, find(top) - margin), last: Math.min(count - 1, find(bottom) + margin) };
    },
    tlScheduleLanes() {
      if (this.tlFrame) return;
      this.tlFrame = requestAnimationFrame(() => { this.tlFrame = 0; if (!this.destroyed) this.tlPaintLanes(); });
    },

    tlPaintLanes() {
      const tree = this.tlTree, axis = this.tlAxis, canvas = this.tlCanvas;
      if (!tree || !axis || this.calView !== "timeline" || !canvas.isConnected) return;
      const rows = tree.rows, tops = tree.tops, total = tops[rows.length] || 0, main = this.tlMain;
      canvas.style.height = total + "px"; canvas.setAttribute("aria-rowcount", String(rows.length));
      const visible = this.tlVisibleRows(3), bucket = Math.floor(this.tlScrollX() / TL_MARGIN), left = (bucket - 1) * TL_MARGIN, right = (bucket + 2) * TL_MARGIN + main.clientWidth;
      const lanes = this.tlLanes ||= new Map(), keep = new Set(), signature = [this.calEpoch, this.calVersion, this.calSourceVersion || 0, axis.zoom, axis.from, axis.width, bucket, this.linkHighlight?.size || 0, this.calSelection?.resource ?? ""].join("|");
      for (let i = visible.first; i <= visible.last; i++) {
        const row = rows[i], key = row.status ? "status:" + i : row.key;
        keep.add(key);
        let lane = lanes.get(key);
        if (!lane) { lane = h("div", "cx-tl-lane"); lane.setAttribute("role", "row"); lanes.set(key, lane); }
        const height = (tops[i + 1] ?? total) - tops[i];
        lane.style.top = tops[i] + "px"; lane.style.height = height + "px"; lane.setAttribute("aria-rowindex", String(i + 1));
        if (lane._sig !== signature + "|" + height || lane._row !== row) { lane._sig = signature + "|" + height; lane._row = row; this.tlPaintLane(lane, row, height, left, right); }
        if (lane.parentNode !== canvas) canvas.appendChild(lane);
      }
      for (const [key, lane] of lanes) if (!keep.has(key)) { if (lane.contains(document.activeElement)) continue; lane.remove(); lanes.delete(key); }
      this.tlPaintCanvas(left, right, total);
      this.calMarkSelection();
      if (this.calRoot.contains(document.activeElement) && !this.calBody.contains(document.activeElement)) return;
      if (!canvas.querySelector('[tabindex="0"]')) this.calRestoreFocus(false);
    },

    /** One lane: gridcells for the units in view, then shading, then the events (or a group's capacity). */
    tlPaintLane(lane, row, height, left, right) {
      lane.replaceChildren();
      if (row.status) { lane.removeAttribute("aria-label"); return; }
      const axis = this.tlAxis, id = row.key, group = this.tl.children.has(id), events = group ? [] : this.tlIndex.byResource.get(id) || [];
      lane.classList.toggle("cx-tl-group", group);
      lane.dataset.cxResource = id;
      const name = this.calResourceName(id), count = group ? this.tlStats(id).count : events.length;
      lane.setAttribute("aria-label", fill(this.calLabels.calendarLane, { resource: name, events: calCount(this, this.calLabels.calendarEvents, count) }));
      const cells = [];
      axis.units.forEach((unit, index) => {
        if (unit.x + axis.width <= left || unit.x > right) return;
        const cell = h("div", "cx-tl-cell"); cell.setAttribute("role", "gridcell"); cell.tabIndex = -1;
        cell.dataset.cxDay = String(unit.first); cell.dataset.cxUnit = String(index); cell.dataset.cxResource = id;
        if (!this.calInValid({ firstDay: unit.first, lastDay: unit.last })) { cell.classList.add("cx-cal-invalid"); cell.setAttribute("aria-disabled", "true"); }
        cell.style.insetInlineStart = unit.x + "px"; cell.style.width = axis.width + "px";
        cell.setAttribute("aria-label", name + ", " + this.tlUnitLabel(unit));
        cells.push(cell); lane.appendChild(cell);
      });
      if (group) { this.tlPaintHeat(lane, id, left, right); return; }
      this.tlPaintShade(lane, id, left, right);
      const stack = Math.min(TL_STACK, events.lanes || 1), inner = height - 6, bar = Math.max(6, inner / stack - (stack > 1 ? 2 : 0));
      const firstVisible = cells.length ? Number(cells[0].dataset.cxUnit) : 0;
      // The start of the next event in the same sub-row, so a widened short bar never covers its neighbour.
      const nextInRow = new Map(), after = new Map();
      for (let i = events.length - 1; i >= 0; i--) { const row = Math.min(events[i].tlLane, stack - 1); nextInRow.set(events[i], after.get(row)); after.set(row, events[i].tlStart); }
      for (const event of events) {
        if (event.tlEnd < axis.from || event.tlStart >= axis.to) continue;
        const x1 = axis.x(event.tlStart), x2 = event.tlEnd > event.tlStart ? axis.x(event.tlEnd) : x1;
        if (x2 < left || x1 > right) continue;
        // A short event keeps a solid bar of TL_MIN_BAR pixels (its times stay in its name and tooltip); one too short even to
        // span a pixel is drawn as a marker.
        const span = x2 - x1, point = event.marker || span < 1;
        const element = this.calEventElement(event, "lane"), slot = Math.min(event.tlLane, stack - 1), room = nextInRow.get(event) === undefined ? Infinity : axis.x(nextInRow.get(event)) - x1 - 1, width = point ? 0 : Math.max(Math.min(span, 2), Math.min(Math.max(TL_MIN_BAR, span), room));
        const unit = Math.max(firstVisible, axis.unitOf(event.tlStart)), cell = cells.find(item => Number(item.dataset.cxUnit) === unit) || cells[0];
        const offset = cell ? Number.parseFloat(cell.style.insetInlineStart) : 0;
        element.style.insetInlineStart = (x1 - offset) + "px"; element.style.width = width + "px"; element.style.top = (3 + slot * (inner / stack)) + "px"; element.style.height = bar + "px";
        if (bar < 16) element.classList.add("cx-tl-thin");
        if (point) element.classList.add("cx-tl-point");
        // Bars too narrow to read as a filled shape with an edge are solid.
        else if (span < TL_SOLID_BAR) { element.classList.add("cx-tl-tiny"); element.title = this.calEventName(event); }
        // Past the hour zoom points sit too close for their names; the name stays in the accessible name and the tooltip.
        if (point && (axis.zoom !== "hour" || !event.marker)) { element.classList.add("cx-tl-bare"); element.title = this.calEventName(event); }
        if (width < 40) element.classList.add("cx-tl-narrow");
        if (event.tlStart < axis.from) element.classList.add("cx-cal-cont-start");
        if (event.tlEnd > axis.to) element.classList.add("cx-cal-cont-end");
        (cell || lane).appendChild(element);
      }
    },
    tlUnitLabel(unit) {
      const lower = this.tlHeader?.lower.find(cell => cell.unit === unit);
      return lower ? lower.label : this.calFmt.longDay(unit.first);
    },

    /** Shading inside a lane: the resource's off hours (hour zoom), its unavailable time and its background ranges. */
    tlPaintShade(lane, id, left, right) {
      const axis = this.tlAxis, add = (start, end, cls, label, tone) => {
        const x1 = axis.x(start), x2 = axis.x(end);
        if (x2 <= x1 || x2 < left || x1 > right) return;
        const block = h("div", "cx-tl-shade " + cls); block.setAttribute("aria-hidden", "true");
        block.style.insetInlineStart = x1 + "px"; block.style.width = (x2 - x1) + "px";
        if (tone) block.style.setProperty("--cx-bg-tone", toneVariable(tone, false, "var(--hfx-color-status-info-fg)"));
        if (label && x2 - x1 > 60) { const text = h("span"); setText(text, label); block.appendChild(text); }
        lane.appendChild(block);
      };
      // Business hours shade each day the hour zoom shows (a custom span shows several).
      if (axis.zoom === "hour") for (let day = axis.units[0].first; day <= axis.units[axis.units.length - 1].last; day++) {
        const hours = this.calHoursFor(id, calDow(day)) ?? (this.cal.working ? (this.cal.working.days.has(calDow(day)) ? [this.cal.working] : []) : null);
        if (hours) { let at = 0; for (const span of hours.slice().sort((a, b) => a.start - b.start)) { add(this.calZone.instant(day, at), this.calZone.instant(day, span.start), "cx-tl-off"); at = Math.max(at, span.end); } add(this.calZone.instant(day, at), this.calZone.instant(day, 1440), "cx-tl-off"); }
      }
      for (const range of this.calRanges) if (range.resource === id) add(range.start, range.end, range.kind === "unavailable" ? "cx-tl-unavailable" : "cx-tl-bg", range.label, range.kind === "unavailable" ? null : range.tone);
      for (const event of this.tlIndex.backgrounds.get(id) || []) add(event.tlStart, event.tlEnd, "cx-tl-bg", event.title, event.tone || "info");
    },
    /** Shading across every lane: weekend days (day zoom), background ranges for every resource and the now line. */
    tlPaintCanvas(left, right, total) {
      const axis = this.tlAxis, layer = this.tlLayer ||= h("div", "cx-tl-layer");
      layer.setAttribute("aria-hidden", "true"); layer.style.height = total + "px";
      const blocks = [];
      for (const cell of this.tlHeader.lower) if (cell.weekend && cell.x + cell.width >= left && cell.x <= right) { const block = h("div", "cx-tl-weekend-col"); block.style.insetInlineStart = cell.x + "px"; block.style.width = cell.width + "px"; blocks.push(block); }
      const global = [...this.calRanges.filter(range => range.resource == null), ...(this.tlIndex.backgrounds.get("") || []).map(event => ({ start: event.tlStart, end: event.tlEnd, label: event.title, tone: event.tone || "info", kind: "background" }))];
      for (const range of global) {
        const x1 = axis.x(range.start), x2 = axis.x(range.end);
        if (x2 <= x1 || x2 < left || x1 > right) continue;
        const block = h("div", "cx-tl-range" + (range.kind === "unavailable" ? " cx-tl-unavailable" : "")); block.style.insetInlineStart = x1 + "px"; block.style.width = (x2 - x1) + "px";
        if (range.kind !== "unavailable") block.style.setProperty("--cx-bg-tone", toneVariable(range.tone, false, "var(--hfx-color-status-info-fg)"));
        block.title = range.label; blocks.push(block);
      }
      const now = Date.now();
      if (this.cal.now && now >= axis.from && now < axis.to) { const line = h("div", "cx-tl-now"); line.style.insetInlineStart = axis.x(now) + "px"; line.title = this.calLabels.calendarNow + " " + this.calFmt.time(now); blocks.push(line); }
      layer.replaceChildren(...blocks);
      if (layer.parentNode !== this.tlCanvas) this.tlCanvas.prepend(layer);
      // Ranges for every resource are named in a third header row, which the tree's header matches in height.
      const labels = this.tlRangeLabels ||= h("div", "cx-tl-range-labels"), named = global.filter(range => axis.x(range.end) - axis.x(range.start) > 50);
      labels.replaceChildren(...named.map(range => { const label = h("span", "cx-tl-range-label"); label.style.insetInlineStart = axis.x(range.start) + "px"; label.style.width = (axis.x(range.end) - axis.x(range.start)) + "px"; setText(label, range.label); label.title = range.label; return label; }));
      if (labels.parentNode !== this.tlHead) this.tlHead.appendChild(labels);
      if (this.tlHead.classList.contains("cx-tl-has-ranges") !== named.length > 0) {
        this.tlHead.classList.toggle("cx-tl-has-ranges", named.length > 0);
        this.tlRoot.style.setProperty("--cx-tl-head-h", named.length ? "78px" : "57px");
        this.tlTree.scheduleRender();
      }
    },
    calTickTimeline() { if (this.calView === "timeline") this.tlPaintCanvas(this.tlScrollX() - TL_MARGIN, this.tlScrollX() + this.tlMain.clientWidth + TL_MARGIN, this.tlTree.tops[this.tlTree.rows.length] || 0); },

    /** A group's capacity: per unit, the most events at once among its resources, toned by the thresholds. */
    tlPaintHeat(lane, id, left, right) {
      const axis = this.tlAxis, heat = this.tlHeat(id), thresholds = this.cal.capacity?.thresholds || [], most = Math.max(1, ...heat);
      heat.forEach((value, index) => {
        const unit = axis.units[index];
        if (!value || unit.x + axis.width < left || unit.x > right) return;
        const block = h("div", "cx-tl-heat"), tone = thresholds.reduce((found, item) => value >= item.at ? item.tone : found, null);
        block.style.insetInlineStart = unit.x + "px"; block.style.width = axis.width + "px";
        block.style.setProperty("--cx-heat", String(Math.min(1, value / most)));
        if (tone) { block.dataset.cxTone = tone; block.style.setProperty("--cx-bg-tone", toneVariable(tone, false, "var(--hfx-color-accent)")); }
        block.setAttribute("aria-hidden", "true"); block.title = fill(this.calLabels.calendarCapacityAt, { count: numberFormat(this.lang).format(value) });
        if (axis.width >= 28) setText(block, numberFormat(this.lang).format(value));
        lane.appendChild(block);
      });
      lane.setAttribute("aria-label", lane.getAttribute("aria-label") + ", " + this.calLabels.calendarCapacity + " " + fill(this.calLabels.calendarCapacityAt, { count: numberFormat(this.lang).format(Math.max(0, ...heat)) }));
    },
    tlHeat(id) {
      if (this.tl.heat.has(id)) return this.tl.heat.get(id);
      const axis = this.tlAxis, units = axis.units, points = [], out = new Array(units.length).fill(0);
      for (const leaf of [id, ...this.tlDescendants(id)]) for (const event of this.tlIndex.byResource.get(leaf) || []) {
        if (event.tlEnd <= axis.from || event.tlStart >= axis.to) continue;
        points.push([Math.max(event.tlStart, axis.from), 1], [Math.max(event.tlEnd, event.tlStart + 1), -1]);
      }
      points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let level = 0, unit = 0;
      for (let i = 0; i < points.length; i++) {
        level += points[i][1];
        const from = points[i][0], to = i + 1 < points.length ? points[i + 1][0] : from;
        if (to <= from || level <= 0) continue;
        while (unit < units.length - 1 && units[unit].end <= from) unit++;
        for (let at = unit; at < units.length && units[at].start < to; at++) out[at] = Math.max(out[at], level);
      }
      this.tl.heat.set(id, out);
      return out;
    },
    /** Event count, busy time (merged intervals) and the events that overlap another, for a resource and its descendants. */
    tlStats(id) {
      const cache = this.tl.stats ||= new Map();
      if (cache.has(id)) return cache.get(id);
      const axis = this.tlAxis, stats = { count: 0, busy: 0, overlaps: 0 };
      let end = -Infinity, lastEnd = -Infinity, lastIndex = -1;
      const overlapped = new Set(), list = (this.tlIndex.byResource.get(id) || []).filter(event => event.tlEnd > axis.from && event.tlStart < axis.to);
      list.forEach((event, index) => {
        const from = Math.max(event.tlStart, axis.from), to = Math.min(event.tlEnd, axis.to);
        if (to > end) { stats.busy += to - Math.max(from, end); end = to; }
        if (event.tlStart < lastEnd) { overlapped.add(index); overlapped.add(lastIndex); }
        if (event.tlEnd > lastEnd) { lastEnd = event.tlEnd; lastIndex = index; }
      });
      stats.count = list.length; stats.overlaps = overlapped.size;
      for (const child of this.tl.children.get(id) || []) { const inner = this.tlStats(child); stats.count += inner.count; stats.busy += inner.busy; stats.overlaps += inner.overlaps; }
      cache.set(id, stats);
      return stats;
    },
    tlAggregateText(id, kind) {
      if (!this.tlIndex) return "";
      const stats = this.tlStats(id), format = numberFormat(this.lang);
      if (kind === "busy") return format.format(Math.round(stats.busy / CAL_HOUR * 10) / 10) + " h";
      return format.format(kind === "overlap" ? stats.overlaps : stats.count);
    }
  });

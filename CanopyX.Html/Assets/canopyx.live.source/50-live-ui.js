  // ---------- live data: the prompt, flashing cells and announcements ----------
  // The prompt sits in the toolbar (over the rows when the toolbar is off), so showing it moves nothing: "Order changed" with
  // Re-sort when kept rows are out of their sorted places, "New data" with Refresh when a cursor grid's source has a newer
  // revision. Changed cells flash briefly when the view or host asks for it (flash), as a fading tint, or, with reduced
  // motion, as a still outline for the same time. What a change means for the reader is announced politely in one message
  // (the prompt, a removed open record, then the counts); added and removed rows are counted at most once every two
  // seconds, with the counts since the last announcement.
  const LIVE_ANNOUNCE_MS = 2000;
  Object.assign(DataGrid.prototype, {
    liveSay(text) { if (this.live && text) { setText(this.live, ""); setText(this.live, text); } },
    /** Adds a sentence to the change's announcement, spoken when the change ends (liveSpeak). */
    liveNote(text) { (this.liveNotes ||= []).push(text); },
    liveSpeak() { const notes = this.liveNotes; this.liveNotes = null; if (notes?.length) this.liveSay(notes.join(" ")); },
    liveSyncPrompt() {
      const cursor = !!this.livePending?.cursor, show = !!(this.liveOrder?.dirty && this.liveOrder.shape === gridResultShape(this.acceptedQuery) || this.livePending || this.liveMoved);
      if (!show) {
        if (this.liveBar && !this.liveBar.hidden) {
          // A prompt that leaves while it has focus hands focus to the grid.
          if (this.liveBar.contains(document.activeElement)) (this.rendered.get(this.focused) || this.grid).focus({ preventScroll: true });
          this.liveBar.hidden = true;
        }
        return;
      }
      if (!this.liveBar) {
        const bar = this.liveBar = h("div", "cx-live-bar"), text = this.liveBarText = h("span", "cx-live-bar-text"), button = this.liveBarButton = gridButton("", () => {
          const focus = bar.contains(document.activeElement);
          this.resort().then(() => { if (focus && !this.canvas.contains(document.activeElement)) (this.rendered.get(this.focused) || this.grid).focus({ preventScroll: true }); })
            .catch(error => this.emit("error", { error }));
        });
        text.id = this.id + "-live-text"; button.setAttribute("aria-describedby", text.id);
        bar.append(gridIcon(null, '<path d="M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3"/>'), text, button);
        // In the toolbar, beside the grid's other state, it covers no rows; a grid without a toolbar shows it over the rows.
        if (!this.toolbar.hidden && this.spacer?.parentNode === this.toolbar) this.spacer.after(bar);
        else { bar.classList.add("cx-live-float"); this.host.classList.add("cx-live-grid"); this.grid.before(bar); }
        this.lifetime.signal.addEventListener("abort", () => { bar.remove(); this.host.classList.remove("cx-live-grid"); }, { once: true });
      }
      const wasHidden = this.liveBar.hidden || this.liveBarCursor !== cursor;
      setText(this.liveBarText, cursor ? this.labels.gridLiveNewData : this.labels.gridLiveOrderChanged);
      setText(this.liveBarButton, cursor ? this.labels.gridLiveRefresh : this.labels.gridLiveResort);
      this.liveBarButton.title = cursor ? "" : this.labels.gridLiveOrderHint;
      this.liveBarCursor = cursor;
      if (this.liveBar.classList.contains("cx-live-float")) this.liveBar.style.top = this.grid.offsetTop + this.head.offsetHeight + 6 + "px";
      this.liveBar.hidden = false;
      if (wasHidden) this.liveNote(cursor ? this.labels.gridLiveNewData : this.labels.gridLiveOrderChanged + ". " + this.labels.gridLiveOrderHint);
    },
    /** Marks the changed cells of rows by id (a Set of columns, or "*" for the whole row) for the flash duration. */
    liveFlash(changed) {
      const duration = this.liveOpts?.flashMs;
      if (!duration || !changed.size) return;
      const now = performance.now(), flashes = this.liveFlashes ||= new Map();
      for (const [id, columns] of changed) {
        const existing = flashes.get(id), merged = columns === "*" || existing?.columns === "*" ? "*" : new Set([...(existing?.columns || []), ...columns]);
        if (merged !== "*" && !merged.size) continue;
        flashes.set(id, { columns: merged, start: now, until: now + duration });
      }
      clearTimeout(this.liveFlashTimer);
      this.liveFlashTimer = setTimeout(() => this.liveFlashExpire(), duration + 20);
      this.version++; this.scheduleRender();
    },
    liveFlashExpire() {
      if (this.destroyed || !this.liveFlashes) return;
      const now = performance.now();
      for (const [id, flash] of this.liveFlashes) if (flash.until <= now) this.liveFlashes.delete(id);
      if (this.liveFlashes.size) this.liveFlashTimer = setTimeout(() => this.liveFlashExpire(), Math.max(20, Math.min(...[...this.liveFlashes.values()].map(flash => flash.until)) - now + 20));
      this.version++; this.scheduleRender();
    },
    /** Counts added and removed rows for the announcement: in this change's message, or once the two-second pause ends. */
    liveAnnounce(result) {
      if (!this.liveOpts?.announce || !result.added.length && !result.removed.length) return;
      const counts = this.liveCounts ||= { added: 0, updated: 0, removed: 0 };
      counts.added += result.added.length; counts.updated += result.updated.length; counts.removed += result.removed.length;
      if (this.liveAnnounceTimer) return;
      if (!this.liveSpoke || performance.now() - this.liveSpoke >= LIVE_ANNOUNCE_MS) { this.liveNote(this.liveCountText()); this.liveCoolDown(); }
      else this.liveAnnounceTimer = setTimeout(() => { this.liveAnnounceTimer = 0; this.liveSay(this.liveCountText()); this.liveCoolDown(); }, LIVE_ANNOUNCE_MS - (performance.now() - this.liveSpoke));
    },
    liveCountText() {
      const numbers = new Intl.NumberFormat(this.lang), counts = this.liveCounts;
      this.liveCounts = null;
      return counts ? fill(this.labels.gridLiveChanged, { added: numbers.format(counts.added), updated: numbers.format(counts.updated), removed: numbers.format(counts.removed) }) : "";
    },
    /** After an announcement, counts that arrive within two seconds are spoken together when the pause ends. */
    liveCoolDown() {
      this.liveSpoke = performance.now();
      this.liveAnnounceTimer = setTimeout(() => {
        this.liveAnnounceTimer = 0;
        if (this.liveCounts && !this.destroyed) { this.liveSay(this.liveCountText()); this.liveCoolDown(); }
      }, LIVE_ANNOUNCE_MS);
    }
  });

  // Painting marks the flashing cells of a row and clears the marks a recycled row carried. A mark keeps its animation
  // through repaints; only a new flash (or another row in the element) restarts it.
  const LIVE_FILL = DataGrid.prototype.fillRow;
  DataGrid.prototype.fillRow = function (element, row) {
    LIVE_FILL.call(this, element, row);
    const flash = this.liveFlashes?.size && !row.status && row.key ? this.liveFlashes.get(row.key) : null, mark = flash ? row.key + "@" + flash.start : null;
    if (element._cxFlash && element._cxFlashMark === mark && element._cxFlashLayout === element._layout) return;
    if (element._cxFlash) { for (const cell of element._cxFlash) { cell.classList.remove("cx-live-flash"); cell.style.removeProperty("animation-delay"); } element._cxFlash = null; element._cxFlashMark = null; }
    if (!flash || !element._cells) return;
    const now = performance.now();
    if (flash.until <= now) return;
    const marked = [];
    element._cells.forEach((slot, index) => {
      const column = this.cols[index];
      if (!slot || !column || flash.columns !== "*" && !flash.columns.has(column.id)) return;
      slot.cell.classList.add("cx-live-flash"); slot.cell.style.animationDelay = Math.round(flash.start - now) + "ms"; marked.push(slot.cell);
    });
    if (marked.length) { element._cxFlash = marked; element._cxFlashMark = mark; element._cxFlashLayout = element._layout; }
  };

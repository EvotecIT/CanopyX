  // ---------- calendar: the resource timeline comes with its own part ----------
  // A calendar with resources loads the timeline part (canopyx-timeline.js) when it starts: the resource timeline view, the
  // resource tree beside it, resource columns in day and week views, capacity and business hours per resource. Until it is in,
  // these answer as a calendar without resources would.
  Object.assign(DataGrid.prototype, {
    calLoadTimeline() {
      if (!this.cal.resources) return Promise.resolve();
      return this.calTimelineLoad ||= loadPart(DataGrid.prototype.parts.timeline).then(() => this.destroyed || this.startTimeline())
        .catch(error => { this.calTimelineLoad = null; this.emit("error", { error }); });
    },
    calTimelineRange(date) { const first = calWeekStart(date, this.cal.firstDay); return { firstDay: first, lastDay: first + 6 }; },
    calTimelineStep(date, direction) { return date + 7 * direction; },
    calPaintTimeline() { this.calBody.replaceChildren(); }
  });
  // A hidden table never scrolls to a record: the record panel opens it beside the calendar instead.
  const CAL_FOCUS_RESULT = DataGrid.prototype.focusResult;
  DataGrid.prototype.focusResult = function (...args) { return this.cal ? Promise.resolve() : CAL_FOCUS_RESULT.apply(this, args); };

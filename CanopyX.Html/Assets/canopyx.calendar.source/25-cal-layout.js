  // ---------- calendar: placing events (lanes of day rows, columns of overlapping times) ----------
  // Day rows (a month week, the all-day row) give each event the lowest lane free on every day it covers, longer events first,
  // so a multi-day bar keeps one lane across its days. Time columns (week and day views) group events that overlap into
  // clusters; each event takes the first column whose last event has ended, and widens over the free columns to its right.

  /** Lanes for events over the days first..last (day numbers): [{ event, lane, from, to }] with from/to clipped to the row. */
  function calLanes(events, first, last, dayIndex) {
    const busy = [], placed = [];
    const sorted = events.slice().sort((a, b) => a.sd - b.sd || (b.ed - b.sd) - (a.ed - a.sd) || (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || a.start - b.start || (a.id < b.id ? -1 : 1));
    for (const event of sorted) {
      const from = Math.max(event.sd, first), to = Math.min(event.ed, last);
      const cells = [];
      for (let day = from; day <= to; day++) if (dayIndex(day) >= 0) cells.push(dayIndex(day));
      if (!cells.length) continue;
      let lane = 0;
      while (cells.some(cell => busy[cell]?.[lane])) lane++;
      for (const cell of cells) (busy[cell] ||= [])[lane] = true;
      placed.push({ event, lane, from: cells[0], to: cells[cells.length - 1], days: cells.length });
    }
    return placed;
  }

  /**
   * Columns for timed segments of one day: each { event, top, bottom } (minutes) gets col and cols (its cluster's column count)
   * and span (columns it may widen over). Segments are sorted by start, then the longest first.
   */
  function calColumns(segments) {
    segments.sort((a, b) => a.top - b.top || (b.bottom - b.top) - (a.bottom - a.top) || (a.event.id < b.event.id ? -1 : 1));
    let cluster = [], columns = [], clusterEnd = -Infinity;
    const finish = () => {
      for (const item of cluster) {
        item.cols = columns.length;
        let span = 1;
        for (let next = item.col + 1; next < columns.length; next++) {
          if (columns[next].some(other => other.top < item.bottom && other.bottom > item.top)) break;
          span++;
        }
        item.span = span;
      }
      cluster = []; columns = []; clusterEnd = -Infinity;
    };
    for (const item of segments) {
      // Zero-length markers take a minimum visual length so their labels never overlap a neighbour's.
      const end = Math.max(item.bottom, item.top + item.min);
      if (item.top >= clusterEnd) finish();
      let col = columns.findIndex(list => list[list.length - 1].visualEnd <= item.top);
      if (col < 0) { col = columns.length; columns.push([]); }
      item.col = col; item.visualEnd = end; columns[col].push(item); cluster.push(item);
      clusterEnd = Math.max(clusterEnd, end);
    }
    finish();
    return segments;
  }

  /** The timed segments of the events on a day, clipped to its visible minutes; an event over midnight gives one per day. */
  function calSegments(view, events, day, minMinutes, maxMinutes) {
    const zone = view.calZone, start = zone.start(day), out = [];
    for (const event of events) {
      if (event.background || calInAllDayRow(event) || event.sd > day || event.ed < day) continue;
      const top = event.sd < day ? 0 : zone.parts(event.start).minutes, bottom = event.ed > day ? 1440 : event.end > event.start ? zone.parts(event.end).minutes || 1440 : top;
      if (bottom < minMinutes || top >= maxMinutes && !(top === maxMinutes && event.marker)) continue;
      out.push({ event, top: Math.max(top, minMinutes), bottom: Math.min(Math.max(bottom, top), maxMinutes), min: view.calMinSegment, clippedTop: top < minMinutes || event.sd < day,
        clippedBottom: bottom > maxMinutes || event.ed > day, dayStart: start });
    }
    return calColumns(out);
  }
  /** All-day events, and timed events of a day or longer, sit in the all-day row of week and day views. */
  function calInAllDayRow(event) { return event.allDay || event.end - event.start >= CAL_DAY; }

  // ---------- facet panel: ranges with histograms ----------
  // A range facet draws the distribution of its column over the other facets' result as equal-width bars (CanopyX's own
  // drawing; the bars inside the chosen range use the accent), with From and To fields below. The fields are the keyboard
  // path and apply on change; a click on a bar chooses its span, Shift+click extends the range. Dates use the grid's time
  // zone and whole days. A hosted grid draws the histogram from its value list when that list is complete, and otherwise
  // keeps the fields with a note.
  function facetRangeBody(panel, facet, body) {
    const grid = panel.grid, column = facet.def, date = column.kind === "datetime", numbers = numberFormat(grid.lang);
    const chart = h("div", "cx-facet-hist"), axis = h("p", "cx-facet-axis"), low = h("span"), high = h("span"), fields = h("div", "cx-facet-range"), note = h("p", "cx-facet-note");
    const field = (text, edge) => {
      const label = h("label", "cx-facet-field"), input = h("input", "cx-input");
      input.type = date ? "date" : "number"; if (!date) input.step = "any";
      label.append(document.createTextNode(text), input);
      input.addEventListener("change", () => submit(edge));
      input.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); submit(edge); } });
      return { label, input };
    };
    const from = field(grid.labels.gridFacetFrom, "low"), to = field(grid.labels.gridFacetTo, "high");
    chart.setAttribute("role", "img"); chart.setAttribute("aria-label", fill(grid.labels.gridFacetHistogram, { column: facet.label }));
    axis.append(low, high); axis.setAttribute("aria-hidden", "true"); fields.append(from.label, to.label); note.hidden = true; note.setAttribute("role", "status");
    body.append(chart, axis, fields, note);
    const state = { counts: null, bins: [] };
    // Values are numbers (dates as UTC milliseconds); the query holds numbers and ISO dates.
    const toInput = value => {
      if (value == null) return "";
      if (!date) return String(value);
      const day = new Date(value), pad = part => String(part).padStart(2, "0");
      return grid.local ? day.getFullYear() + "-" + pad(day.getMonth() + 1) + "-" + pad(day.getDate()) : day.toISOString().slice(0, 10);
    };
    const fromInput = (text, edge) => {
      if (text === "") return null;
      if (!date) { const value = Number(text); return Number.isFinite(value) ? value : undefined; }
      const [year, month, day] = text.split("-").map(Number), end = edge === "high";
      const time = grid.local ? new Date(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0).getTime() : Date.UTC(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
      return Number.isFinite(time) ? time : undefined;
    };
    const wire = value => value == null ? null : date ? new Date(value).toISOString() : value;
    const current = () => {
      const selection = panel.selection(facet);
      return { low: selection.low == null ? null : date ? Date.parse(selection.low) : selection.low, high: selection.high == null ? null : date ? Date.parse(selection.high) : selection.high,
        open: !!selection.open, locked: !!selection.locked };
    };
    // A bar covers [start, end) and the last one also its end, the maximum. As a choice, a number bar ends before the next
    // bar's start (an exclusive bound); a date bar ends on the last whole millisecond before it; the last bar ends on the maximum.
    const binChoice = index => {
      const bin = state.bins[index], last = index === state.bins.length - 1;
      if (date) return { low: Math.ceil(bin.start), high: last ? bin.end : Math.ceil(bin.end) - 1, open: false };
      return { low: bin.start, high: bin.end, open: !last };
    };
    function submit(edge) {
      const low = fromInput(from.input.value, "low"), high = fromInput(to.input.value, "high");
      if (low === undefined || high === undefined) { setText(note, grid.labels.gridFacetInvalid); note.hidden = false; return; }
      if (low !== null && high !== null && low > high) { setText(note, grid.labels.gridFacetReversed); note.hidden = false; (edge === "low" ? from : to).input.focus(); return; }
      note.hidden = true;
      panel.apply(facet, { low: wire(low), high: wire(high), open: false });
    }
    let anchor = null;
    chart.addEventListener("click", event => {
      const bar = event.target.closest(".cx-facet-bar"), range = current();
      if (!bar || range.locked) return;
      const index = Number(bar.getAttribute("data-cx-bin")), extend = event.shiftKey && anchor !== null && anchor < state.bins.length;
      const first = binChoice(extend ? Math.min(anchor, index) : index), last = binChoice(extend ? Math.max(anchor, index) : index);
      if (!extend) anchor = index;
      if (!extend && range.low === first.low && range.high === first.high && range.open === first.open) { panel.apply(facet, { low: null, high: null }); return; }
      panel.apply(facet, { low: wire(first.low), high: wire(last.high), open: last.open });
    });
    const label = value => date ? new Intl.DateTimeFormat(grid.lang, { dateStyle: "medium", timeZone: grid.local ? undefined : "UTC" }).format(value) : numbers.format(value);
    function draw() {
      const counts = state.counts, range = current();
      if (!from.input.matches(":focus")) from.input.value = toInput(range.low);
      if (!to.input.matches(":focus")) to.input.value = toInput(range.high);
      from.input.disabled = to.input.disabled = range.locked;
      if (!counts) return;
      const pairs = counts.values ? null : counts.buckets;
      let min = Infinity, max = -Infinity;
      for (const value of counts.values || []) { if (value < min) min = value; if (value > max) max = value; }
      for (const pair of pairs || []) { if (pair.value < min) min = pair.value; if (pair.value > max) max = pair.value; }
      const drawable = counts.complete && min <= max;
      chart.hidden = axis.hidden = !drawable;
      if (!counts.complete) { setText(note, grid.labels.gridFacetNoChart); note.hidden = false; } else if (note.textContent === grid.labels.gridFacetNoChart) note.hidden = true;
      if (!drawable) { state.bins = []; chart.replaceChildren(); return; }
      const count = min === max ? 1 : facet.bins, width = min === max ? 1 : (max - min) / count, tallies = new Array(count).fill(0);
      const place = value => Math.min(count - 1, Math.floor((value - min) / width));
      for (const value of counts.values || []) tallies[place(value)]++;
      for (const pair of pairs || []) tallies[place(pair.value)] += pair.count;
      const highest = Math.max(1, ...tallies);
      state.bins = tallies.map((tally, index) => ({ start: min + index * width, end: index === count - 1 ? max : min + (index + 1) * width, count: tally }));
      chart.replaceChildren(...state.bins.map((bin, index) => {
        const last = index === count - 1, bar = h("span", "cx-facet-bar");
        const inside = (range.low == null || (last ? bin.end >= range.low : bin.end > range.low)) && (range.high == null || (range.open ? bin.start < range.high : bin.start <= range.high));
        bar.setAttribute("data-cx-bin", String(index)); bar.style.height = Math.max(bin.count ? 6 : 0, Math.round(bin.count / highest * 100)) + "%";
        bar.classList.toggle("cx-facet-in", inside && (range.low != null || range.high != null));
        bar.title = fill(grid.labels.gridFacetBin, { from: label(bin.start), to: label(bin.end), count: numbers.format(bin.count) });
        return bar;
      }));
      setText(low, label(min)); setText(high, label(max));
    }
    return { draw, search: () => "", update(counts) { state.counts = counts; draw(); } };
  }

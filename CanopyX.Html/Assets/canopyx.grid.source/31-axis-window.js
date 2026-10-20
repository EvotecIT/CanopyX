  // ---------- one axis of a two-dimensional viewport: item offsets and the window of mounted items ----------
  // Views that window rows and columns share it (the matrix part; flat grids measured that mounted cells dominate their cost
  // past about 100 columns, tests/browser/bench/columns-benchmark.mjs, and can window their columns with it). Items have
  // one fixed size or a size each; offsets are prefix sums in a Float64Array. A window is the items that meet the visible
  // span plus an overscan in pixels, so a fast scroll paints whole items rather than blank space.
  class AxisWindow {
    constructor() { this.count = 0; this.uniform = 0; this.offsets = null; this.total = 0; }
    /** Sets the items: a count with one size, or an array of sizes. */
    reset(sizes, count) {
      if (typeof sizes === "number") {
        this.count = count; this.uniform = sizes; this.offsets = null; this.total = count * sizes;
      } else {
        const offsets = new Float64Array(sizes.length + 1);
        for (let index = 0; index < sizes.length; index++) offsets[index + 1] = offsets[index] + sizes[index];
        this.count = sizes.length; this.uniform = 0; this.offsets = offsets; this.total = offsets[sizes.length];
      }
      return this;
    }
    offset(index) { return this.offsets ? this.offsets[Math.max(0, Math.min(this.count, index))] : Math.max(0, Math.min(this.count, index)) * this.uniform; }
    size(index) { return this.offsets ? this.offsets[index + 1] - this.offsets[index] : this.uniform; }
    /** The index of the item at a position (the last item past the end, -1 when there are none). */
    at(position) {
      if (!this.count) return -1;
      if (!this.offsets) return Math.max(0, Math.min(this.count - 1, Math.floor(position / this.uniform)));
      let low = 0, high = this.count - 1;
      while (low < high) { const middle = (low + high + 1) >> 1; if (this.offsets[middle] <= position) low = middle; else high = middle - 1; }
      return low;
    }
    /** The first and last items meeting [start, start + length) widened by overscan pixels; last is -1 when empty. */
    window(start, length, overscan = 0) {
      if (!this.count || length <= 0) return { first: 0, last: -1 };
      return { first: this.at(Math.max(0, start - overscan)), last: this.at(Math.max(0, start + length + overscan - 0.5)) };
    }
  }

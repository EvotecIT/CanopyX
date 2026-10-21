  // ---------- changes: the line and word comparison (the same as CanopyTextDiffAlgorithm in C#) ----------
  // A common prefix and suffix are set aside and the middle is compared with Myers' algorithm; within each change the removed
  // items come before the added ones. A middle that needs more than DIFF_MAX_EDITS edits is one replacement, so unrelated texts stay
  // cheap. tests/fixtures/diff-cases.json holds the cases both implementations must agree on.
  const DIFF_MAX_EDITS = 2000, DIFF_MAX_WORD_EDITS = 200, DIFF_MAX_TOKENS = 1000;
  function diffReplace(script, n, m, from) {
    for (let i = 0; i < n; i++) script.push(["-", from + i, -1]);
    for (let j = 0; j < m; j++) script.push(["+", -1, from + j]);
  }
  /** Myers' greedy comparison of a[offset..offset+n) with b[offset..offset+m), or null past the edit limit. */
  function diffMyers(a, b, offset, n, m, maxEdits) {
    const limit = Math.min(n + m, maxEdits), v = new Int32Array(2 * limit + 3), zero = limit + 1, trace = [];
    let found = -1;
    for (let d = 0; d <= limit && found < 0; d++) {
      trace.push(d > 0 ? v.slice(zero - (d - 1), zero + d) : new Int32Array(0));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || k !== d && v[zero + k - 1] < v[zero + k + 1] ? v[zero + k + 1] : v[zero + k - 1] + 1, y = x - k;
        while (x < n && y < m && a[offset + x] === b[offset + y]) { x++; y++; }
        v[zero + k] = x;
        if (x >= n && y >= m) { found = d; break; }
      }
    }
    if (found < 0) return null;
    const reversed = [];
    let px = n, py = m;
    for (let d = found; d > 0; d--) {
      const previous = trace[d], get = key => previous[key + d - 1], k = px - py;
      const prevK = k === -d || k !== d && get(k - 1) < get(k + 1) ? k + 1 : k - 1, prevX = get(prevK), prevY = prevX - prevK;
      while (px > prevX && py > prevY) { reversed.push(["=", offset + px - 1, offset + py - 1]); px--; py--; }
      reversed.push(px === prevX ? ["+", -1, offset + py - 1] : ["-", offset + px - 1, -1]);
      px = prevX; py = prevY;
    }
    while (px > 0 && py > 0) { reversed.push(["=", offset + px - 1, offset + py - 1]); px--; py--; }
    return reversed.reverse();
  }
  /** The edit script of two sequences of strings, or null when a word comparison passes its limit. */
  function diffScript(a, b, maxEdits) {
    const n = a.length, m = b.length;
    let prefix = 0, suffix = 0;
    while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
    while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;
    const script = [];
    for (let i = 0; i < prefix; i++) script.push(["=", i, i]);
    const bigN = n - prefix - suffix, bigM = m - prefix - suffix;
    if (!bigN || !bigM) diffReplace(script, bigN, bigM, prefix);
    else {
      const middle = diffMyers(a, b, prefix, bigN, bigM, maxEdits);
      if (middle) script.push(...middle);
      else if (maxEdits < DIFF_MAX_EDITS) return null;
      else diffReplace(script, bigN, bigM, prefix);
    }
    for (let i = 0; i < suffix; i++) script.push(["=", n - suffix + i, m - suffix + i]);
    // Within each run of changes the removed items come first, then the added ones.
    const ordered = [], added = [];
    for (const entry of script) {
      if (entry[0] === "=") { ordered.push(...added, entry); added.length = 0; }
      else if (entry[0] === "-") ordered.push(entry);
      else added.push(entry);
    }
    ordered.push(...added);
    return ordered;
  }
  /** Hunks of two line lists with context unchanged lines around each change: changes closer than twice the context share one. */
  function diffHunks(left, right, context) {
    const script = diffScript(left, right, DIFF_MAX_EDITS), changes = [], hunks = [];
    script.forEach((entry, index) => { if (entry[0] !== "=") changes.push(index); });
    for (let at = 0; at < changes.length;) {
      let last = changes[at];
      const first = last;
      while (at + 1 < changes.length && changes[at + 1] - last - 1 <= 2 * context) last = changes[++at];
      at++;
      const from = Math.max(0, first - context), to = Math.min(script.length - 1, last + context);
      let before = 1, after = 1;
      for (let i = 0; i < from; i++) { if (script[i][0] !== "+") before++; if (script[i][0] !== "-") after++; }
      const lines = [];
      for (let i = from; i <= to; i++) {
        const [op, b, a] = script[i];
        lines.push({ kind: op, text: op === "+" ? right[a] : left[b] });
      }
      hunks.push({ before, after, lines });
    }
    return hunks;
  }
  const DIFF_TOKENS = /[\p{L}\p{N}_]+|[\t-\r\u0085\u2028\u2029\p{Zs}]+|[^\p{L}\p{N}_\t-\r\u0085\u2028\u2029\p{Zs}]/gu;
  /** The [start, end) ranges that differ between a removed line and the added line after it, or null when they share too little. */
  function diffWords(before, after) {
    const left = before.match(DIFF_TOKENS) || [], right = after.match(DIFF_TOKENS) || [];
    if (left.length > DIFF_MAX_TOKENS || right.length > DIFF_MAX_TOKENS) return null;
    const script = diffScript(left, right, DIFF_MAX_WORD_EDITS);
    if (!script) return null;
    const removed = [], added = [], extend = (ranges, start, end) => { const last = ranges[ranges.length - 1]; if (last && last[1] === start) last[1] = end; else ranges.push([start, end]); };
    let same = 0, beforeAt = 0, afterAt = 0;
    for (const [op, b, a] of script) {
      if (op === "=") { same += left[b].length; beforeAt += left[b].length; afterAt += right[a].length; }
      else if (op === "-") { extend(removed, beforeAt, beforeAt + left[b].length); beforeAt += left[b].length; }
      else { extend(added, afterAt, afterAt + right[a].length); afterAt += right[a].length; }
    }
    const longest = Math.max(before.length, after.length);
    return !longest || same * 100 < longest * 35 ? null : { before: removed, after: added };
  }

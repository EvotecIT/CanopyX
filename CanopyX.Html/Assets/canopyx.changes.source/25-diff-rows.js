  // ---------- changes: the rows a diff shows (as CanopyDiffRows builds them in C#) ----------
  // Lines carry their numbers; unchanged runs longer than the context fold into gaps that keep their lines, so a gap opens in
  // place. The unchanged lines before, between and after the hunks are gaps too, which open when the diff has its texts. Each
  // removed line is paired with the added line that takes its place, and the pair's word marks are worked out on first paint.
  function diffLine(kind, text, b, a) { return { t: "line", kind, text, b, a, partner: null, marks: undefined }; }
  /** A gap of count unchanged lines from before line b and after line a; its lines come from the earlier text when there is one. */
  function diffGap(count, b, a, left, lines) {
    if (!lines && left) { lines = []; for (let i = 0; i < count; i++) lines.push(diffLine("=", left[b - 1 + i], b + i, a + i)); }
    return { t: "gap", count, b, a, lines: lines || null };
  }
  /** Folds the unchanged runs of a hunk's lines: a leading run keeps its last lines, a trailing run its first, a run between changes both ends. */
  function diffFold(lines, rows, context) {
    for (let i = 0; i < lines.length;) {
      if (lines[i].kind !== "=") { rows.push(lines[i++]); continue; }
      const start = i;
      while (i < lines.length && lines[i].kind === "=") i++;
      const length = i - start, keepStart = start === 0 ? 0 : context, keepEnd = i === lines.length ? 0 : context;
      if (length <= keepStart + keepEnd + 1) { rows.push(...lines.slice(start, i)); continue; }
      rows.push(...lines.slice(start, start + keepStart));
      const hidden = lines.slice(start + keepStart, i - keepEnd);
      rows.push(diffGap(hidden.length, hidden[0].b, hidden[0].a, null, hidden));
      rows.push(...lines.slice(i - keepEnd, i));
    }
  }
  /** The inline rows of a diff and its counts of added and removed lines. */
  function diffRows(doc, hunks) {
    const rows = [];
    let nextBefore = 1, nextAfter = 1, added = 0, removed = 0;
    for (const hunk of hunks) {
      if (hunk.before > nextBefore) rows.push(diffGap(hunk.before - nextBefore, nextBefore, nextAfter, doc.left));
      const lines = [];
      let b = hunk.before, a = hunk.after;
      for (const line of hunk.lines) {
        lines.push(diffLine(line.kind, line.text, line.kind !== "+" ? b++ : null, line.kind !== "-" ? a++ : null));
        if (line.kind === "+") added++; else if (line.kind === "-") removed++;
      }
      // Each removed line pairs with the added line in the same place of the change that follows it.
      for (let i = 0; i < lines.length;) {
        if (lines[i].kind === "=") { i++; continue; }
        const from = i;
        while (i < lines.length && lines[i].kind === "-") i++;
        const middle = i;
        while (i < lines.length && lines[i].kind === "+") i++;
        for (let k = 0; k < Math.min(middle - from, i - middle); k++) { lines[from + k].partner = lines[middle + k]; lines[middle + k].partner = lines[from + k]; }
      }
      diffFold(lines, rows, doc.context);
      nextBefore = b; nextAfter = a;
    }
    if (doc.left && hunks.length && doc.left.length >= nextBefore) rows.push(diffGap(doc.left.length - nextBefore + 1, nextBefore, nextAfter, doc.left));
    return { rows, added, removed };
  }
  /** The marks of a line and its partner, worked out once for both. */
  function diffMarks(row) {
    if (row.marks === undefined) {
      const words = row.partner ? (row.kind === "-" ? diffWords(row.text, row.partner.text) : diffWords(row.partner.text, row.text)) : null;
      row.marks = words ? (row.kind === "-" ? words.before : words.after) : null;
      if (row.partner) row.partner.marks = words ? (row.kind === "-" ? words.after : words.before) : null;
    }
    return row.marks;
  }
  /** Side-by-side rows: unchanged lines on both sides, each removed line beside the added line that takes its place, gaps across both. */
  function diffPairs(rows) {
    const pairs = [];
    for (let i = 0; i < rows.length;) {
      const row = rows[i];
      if (row.t === "gap" || row.kind === "=") { pairs.push({ t: row.t === "gap" ? "gap" : "pair", gap: row.t === "gap" ? row : null, left: row.t === "gap" ? null : row, right: row.t === "gap" ? null : row }); i++; continue; }
      const removed = [], added = [];
      while (i < rows.length && rows[i].t === "line" && rows[i].kind === "-") removed.push(rows[i++]);
      while (i < rows.length && rows[i].t === "line" && rows[i].kind === "+") added.push(rows[i++]);
      for (let k = 0; k < Math.max(removed.length, added.length); k++) pairs.push({ t: "pair", gap: null, left: removed[k] || null, right: added[k] || null });
    }
    return pairs;
  }
  /** Whether a display row shows a change, for change navigation. */
  function diffChanged(row) { return row.t === "line" ? row.kind !== "=" : row.t === "pair" && (row.left !== row.right); }
  /** The unified diff of the hunks: "--- a/…", "+++ b/…" and "@@ -12,7 +12,8 @@" sections, as CanopyTextDiff.ToUnifiedDiff writes it. */
  function diffUnified(doc, hunks) {
    if (doc.unified !== null) return doc.unified;
    const beforeOpen = !!doc.before && !/[\r\n]$/.test(doc.before), afterOpen = !!doc.after && !/[\r\n]$/.test(doc.after);
    const last = hunks[hunks.length - 1], left = doc.left, right = doc.right;
    // Include a changed EOF terminator in an unchanged suffix without altering the document or the displayed hunks.
    if (left?.length && right?.length && beforeOpen !== afterOpen && left[left.length - 1] === right[right.length - 1] && (!last ||
      last.before + last.lines.filter(line => line.kind !== "+").length <= left.length && last.after + last.lines.filter(line => line.kind !== "-").length <= right.length))
      hunks = hunks.concat([{ before: left.length, after: right.length, lines: [{ kind: "=", text: left[left.length - 1] }] }]);
    if (!hunks.length) return "";
    const name = doc.path || doc.label, range = (start, count) => (count === 0 ? start - 1 : start) + (count === 1 ? "" : "," + count);
    let text = "--- a/" + (doc.previousPath || name) + "\n+++ b/" + name + "\n";
    const write = (kind, line, open) => { text += kind + line + "\n"; if (open) text += "\\ No newline at end of file\n"; };
    for (const hunk of hunks) {
      const before = hunk.lines.filter(line => line.kind !== "+").length, after = hunk.lines.filter(line => line.kind !== "-").length;
      text += "@@ -" + range(hunk.before, before) + " +" + range(hunk.after, after) + " @@\n";
      let b = hunk.before, a = hunk.after;
      for (const line of hunk.lines) {
        const openBefore = line.kind !== "+" && beforeOpen && b === left.length, openAfter = line.kind !== "-" && afterOpen && a === right.length;
        if (line.kind === "=" && openBefore !== openAfter) { write("-", line.text, openBefore); write("+", line.text, openAfter); }
        else write(line.kind === "=" ? " " : line.kind, line.text, openBefore || openAfter);
        if (line.kind !== "+") b++;
        if (line.kind !== "-") a++;
      }
    }
    return text;
  }

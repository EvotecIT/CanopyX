  // ---------- changes: the three documents (docs/changes.md), read once and strictly ----------
  // A diff, a change list and a propagation view fail as a whole on an unknown property, a bad id, an out-of-order hunk or a line
  // that does not match its text, as CanopyTextDiff, CanopyChangeList and CanopyPropagation do in C#.
  const changeObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  function changeKeys(value, keys, what) {
    if (!changeObject(value)) changeFail(what + " must be an object");
    for (const key of Object.keys(value)) if (!keys.includes(key)) changeFail(what + " has the unknown property '" + key + "'");
    return value;
  }
  function changeText(value, what, max, optional) {
    if (value === undefined && optional) return null;
    if (typeof value !== "string" || !/\S/.test(value) || value.length > max) changeFail(what + " must be visible text of at most " + max + " characters");
    return value;
  }
  function changeLine(value, what, max) {
    if (value === undefined) return null;
    if (typeof value !== "string" || value.length > max || /[\r\n]/.test(value)) changeFail(what + " must be one line of at most " + max + " characters");
    return value;
  }
  function changeId(value, what, max = 256) {
    if (typeof value !== "string" || !value.length || value.length > max || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) changeFail(what + " must be a nonempty id of at most " + max + " characters");
    return value;
  }
  function changeTone(value, what) {
    if (value === undefined) return null;
    if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(value) || /-bg$/.test(value)) changeFail(what + " has an invalid tone");
    return value;
  }
  function changeFlag(value, what) {
    if (value !== undefined && typeof value !== "boolean") changeFail(what + " takes true or false");
    return value === true;
  }
  function changeInteger(value, what, min, max, fallback) {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < min || value > max) changeFail(what + " is a whole number from " + min + " to " + max);
    return value;
  }
  /** An ISO 8601 date and time as milliseconds; a time without a zone is UTC, as in C#. */
  function changeTime(value, what) {
    if (value === undefined) return null;
    const time = typeof value === "string" && value.includes("T") ? Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value + "Z") : NaN;
    if (!Number.isFinite(time)) changeFail(what + " needs an ISO 8601 date and time");
    return time;
  }
  function changeEnum(value, names, what, fallback) {
    if (value === undefined) return fallback;
    if (!names.includes(value)) changeFail(what + " has an unknown value");
    return value;
  }
  function changeList(value, what, max) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > max) changeFail(what + " is a list of at most " + max + " items");
    return value;
  }
  /** A count text: {count} in the text, or in every plural form of a complete list that ends with an other form. */
  function changePluralText(text) {
    if (!text.startsWith("[")) return text.includes("{count}");
    const forms = [...text.matchAll(/\[(zero|one|two|few|many|other)\]([^[]*)/g)];
    return forms.reduce((sum, form) => sum + form[0].length, 0) === text.length && forms.some(form => form[1] === "other") && forms.every(form => form[2].includes("{count}"));
  }
  function changeEnvelope(input, type, keys) {
    const doc = changeKeys(input, ["protocol", "type", ...keys], "the document");
    if (doc.protocol !== PROTOCOL || doc.type !== type) changeFail("it needs protocol " + PROTOCOL + " and type \"" + type + "\"");
    return doc;
  }
  /** Splits a text into lines at CRLF, LF or CR; a final line break ends the last line. */
  function changeSplit(text) {
    const lines = text.split(/\r\n|\n|\r/);
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  const DIFF_KEYS = ["id", "label", "path", "previousPath", "content", "message", "beforeTitle", "afterTitle", "before", "after", "hunks", "context", "layout", "notes", "truncated", "unified", "labels"];
  const DIFF_MAX_LINES = 200000, DIFF_MAX_LINE = 20000, DIFF_MAX_TEXT = 2000000, DIFF_CLIENT_LINES = 5000;
  /** A diff's properties: the envelope's in a diff document, an item's diff in a change list. */
  function diffBody(input, what) {
    const doc = changeKeys(input, what === "the document" ? ["protocol", "type", ...DIFF_KEYS] : DIFF_KEYS, what);
    const content = changeEnum(doc.content, ["binary", "unavailable", "identical"], "content", "text");
    const before = doc.before === undefined ? null : doc.before, after = doc.after === undefined ? null : doc.after;
    for (const text of [before, after]) if (text !== null && (typeof text !== "string" || text.length > DIFF_MAX_TEXT)) changeFail("a diff text is text of at most " + DIFF_MAX_TEXT + " characters");
    if ((before === null) !== (after === null)) changeFail("a diff has both texts or neither");
    const hunks = changeList(doc.hunks, "hunks", DIFF_MAX_LINES).map(entry => {
      const hunk = changeKeys(entry, ["before", "after", "lines"], "a hunk");
      const lines = changeList(hunk.lines, "a hunk's lines", DIFF_MAX_LINES).map(line => {
        if (typeof line !== "string" || !/^[ +-]/.test(line) || line.length > DIFF_MAX_LINE + 1 || /[\r\n]/.test(line)) changeFail("a diff line is one line that starts with \" \", \"-\" or \"+\"");
        return { kind: line[0] === " " ? "=" : line[0], text: line.slice(1) };
      });
      return { before: changeInteger(hunk.before, "a hunk's before", 1, 2147483647), after: changeInteger(hunk.after, "a hunk's after", 1, 2147483647), lines };
    });
    if (content !== "text" && (hunks.length || before !== null)) changeFail("a diff without text content has no hunks and no texts");
    if (content === "text" && !hunks.length && before === null) changeFail("a text diff needs hunks or both texts");
    const left = before === null ? null : changeSplit(before), right = after === null ? null : changeSplit(after);
    let nextBefore = 1, nextAfter = 1, total = 0;
    for (const hunk of hunks) {
      if (!hunk.lines.length || hunk.before < nextBefore || hunk.after < nextAfter || hunk.before - nextBefore !== hunk.after - nextAfter) changeFail("diff hunks are in order, do not overlap and leave as many unchanged lines on both sides");
      let b = hunk.before, a = hunk.after;
      for (const line of hunk.lines) {
        if (line.kind !== "+" && left && left[b - 1] !== line.text || line.kind !== "-" && right && right[a - 1] !== line.text) changeFail("a hunk's line does not match its text");
        if (line.kind !== "+") b++;
        if (line.kind !== "-") a++;
      }
      total += hunk.lines.length;
      if (total > DIFF_MAX_LINES) changeFail("a diff holds at most " + DIFF_MAX_LINES + " lines");
      nextBefore = b; nextAfter = a;
    }
    if (left && right && hunks.length && left.length - nextBefore !== right.length - nextAfter) changeFail("the diff's hunks do not account for every difference between its texts");
    const notes = changeList(doc.notes, "notes", 16).map(entry => { const note = changeKeys(entry, ["text", "tone"], "a note"); return Object.freeze({ text: changeText(note.text, "a note", 500), tone: changeTone(note.tone, "a note") }); });
    if (doc.unified !== undefined && (typeof doc.unified !== "string" || doc.unified.length > 2 * DIFF_MAX_TEXT)) changeFail("the unified diff is too long");
    return Object.freeze({ id: changeId(doc.id, "the diff id"), label: changeText(doc.label, "the diff label", 200), path: changeLine(doc.path, "the path", 2048), previousPath: changeLine(doc.previousPath, "the previous path", 2048),
      content, message: changeText(doc.message, "the message", 1000, true), beforeTitle: changeText(doc.beforeTitle, "the before title", 200, true), afterTitle: changeText(doc.afterTitle, "the after title", 200, true),
      before, after, left, right, hunks, context: changeInteger(doc.context, "context", 0, 20, 3), layout: changeEnum(doc.layout, ["inline", "split"], "layout", "auto"), notes,
      truncated: changeFlag(doc.truncated, "truncated"), unified: doc.unified ?? null, labels: doc.labels });
  }
  function diffDocument(input) {
    changeEnvelope(input, "diff", DIFF_KEYS);
    return diffBody(input, "the document");
  }

  // Patterns entered by readers run on the UI thread. One variable repetition, anchored at the start, and no groups,
  // alternation or backreferences keep matching bounded by the input length and the fixed (at most 256 unit) suffix.
  // Editing and formatting use the same grammar; C# authoring validates it with CanopyPattern.
  function boundedPattern(source, exact = true, whole = false) {
    const bad = () => { throw new Error("CanopyX: pattern requires literals, character classes and at most one variable repetition anchored at the start; groups, alternatives and backreferences are unsupported."); };
    if (typeof source !== "string" || source.length > 256) bad();
    let width = 0, variable = 0;
    for (let i = 0; i < source.length;) {
      const unit = source[i++];
      if (unit === "^" && i === 1 || unit === "$" && i === source.length) continue;
      if (unit === "\\") {
        const escape = source[i++];
        if (!escape || !/^[dDsSwWbBnrtfv\\.^$*+?{}\[\]()|/]$/.test(escape)) bad();
      } else if (unit === "[") {
        let closed = false;
        while (i < source.length) {
          const c = source[i++];
          if (c === "\\") { const escape = source[i++]; if (!escape || !/^[dDsSwWbnrtfv\\.^$*+?{}\[\]()|/-]$/.test(escape)) bad(); }
          else if (c === "]") { closed = true; break; }
        }
        if (!closed) bad();
      } else if ("()|^$*+?{}]".includes(unit)) bad();
      let count = 1;
      if (i < source.length && "*+?".includes(source[i])) { variable++; i++; }
      else if (source[i] === "{") {
        const match = /^\{(\d+)(?:,(\d*))?\}/.exec(source.slice(i));
        if (!match) bad();
        const low = Number(match[1]), high = match[2] === undefined ? low : match[2] === "" ? Infinity : Number(match[2]);
        if (low > 256 || high < low || high !== Infinity && high > 256) bad();
        if (low !== high) variable++;
        count = low === high ? low : 1; i += match[0].length;
      }
      width += count;
      if (width > 256 || variable > 1) bad();
    }
    if (variable && !whole && source[0] !== "^") bad();
    return new RegExp(whole ? "^(?:" + source + ")$" : source, exact ? "u" : "iu");
  }
  // Wildcards permit any number of stars. Greedy retry at the last star avoids RegExp's exponential backtracking.
  function wildcardMatch(pattern, value, exact) {
    if (!exact) { pattern = pattern.toLowerCase(); value = value.toLowerCase(); }
    let p = 0, v = 0, star = -1, retry = 0;
    while (v < value.length) {
      if (p < pattern.length && (pattern[p] === "?" || pattern[p] === value[v])) { p++; v++; }
      else if (pattern[p] === "*") { star = p++; retry = v; }
      else if (star >= 0) { p = star + 1; v = ++retry; }
      else return false;
    }
    while (pattern[p] === "*") p++;
    return p === pattern.length;
  }

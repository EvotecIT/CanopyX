
  // ---------- search text folding (shared rules with the C# bundle writer, see docs/data-protocol.md) ----------
  // The table is the C# writer's complete frozen table (Build/Sync-Assets.ps1 compacts its runs); ASCII keeps a fast path.
  const EXTRA_FOLD_PAIRS = "__CANOPYX_FOLD_PAIRS__";
  const EXTRA_LOWERCASE = new Map();
  const extraBytes = atob(EXTRA_FOLD_PAIRS);
  let extraOffset = 0;
  const extraWord = () => extraBytes.charCodeAt(extraOffset++) | (extraBytes.charCodeAt(extraOffset++) << 8);
  while (extraOffset < extraBytes.length) {
    let from = extraWord(), to, count = 1, step = 1;
    if (from === 0xFFFF) { from = extraWord(); to = extraWord(); count = extraWord(); step = extraWord(); }
    else to = extraWord();
    for (let i = 0; i < count; i++) EXTRA_LOWERCASE.set(from + i * step, to + i * step);
  }
  function foldCode(c) {
    if (c < 0x80) {
      return c >= 65 && c <= 90 ? c + 32 : c;
    }
    return EXTRA_LOWERCASE.get(c) || c;
  }

  function foldUnit(unit) {
    return String.fromCharCode(foldCode(unit.charCodeAt(0)));
  }

  function isSeparator(code) {
    return code < 128 && !((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122));
  }

  function foldText(text) {
    const source = String(text == null ? "" : text);
    let out = "";
    for (let i = 0; i < source.length; i++) {
      out += foldUnit(source.charAt(i));
    }
    return out;
  }

  /** Splits text into folded words. */
  function words(text) {
    const folded = foldText(text);
    const out = [];
    let current = "";
    for (let i = 0; i < folded.length; i++) {
      if (isSeparator(folded.charCodeAt(i))) {
        if (current) {
          out.push(current);
          current = "";
        }
      } else {
        current += folded.charAt(i);
      }
    }
    if (current) {
      out.push(current);
    }
    return out;
  }

  function matchesWords(labelWords, queryWords) {
    return queryWords.every((q) => labelWords.some((w) => w.startsWith(q)));
  }

  /** Trims only protocol separators; all non-ASCII code units remain word characters. */
  function trimSeparators(text) {
    let start = 0, end = text.length;
    while (start < end && isSeparator(text.charCodeAt(start))) start++;
    while (end > start && isSeparator(text.charCodeAt(end - 1))) end--;
    return text.slice(start, end);
  }

  /** Rank of a label against a folded, trimmed query: 0 when equal, 1 when the label starts with it, 2 otherwise. */
  function rankLabel(label, foldedQuery) {
    const l = trimSeparators(foldText(label));
    return l === foldedQuery ? 0 : l.startsWith(foldedQuery) ? 1 : 2;
  }

  /** Encodes a folded prefix as a shard key: a-z and 0-9 stay, other code units become _ plus four hex digits. */
  function shardKey(prefix) {
    let out = "";
    for (let i = 0; i < prefix.length; i++) {
      const code = prefix.charCodeAt(i);
      out += (code >= 97 && code <= 122) || (code >= 48 && code <= 57) ? prefix.charAt(i) : "_" + ("000" + code.toString(16)).slice(-4);
    }
    return out;
  }

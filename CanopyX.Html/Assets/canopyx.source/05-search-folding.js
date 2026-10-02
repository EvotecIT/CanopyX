
  // ---------- search text folding (shared rules with the C# bundle writer, see docs/data-protocol.md) ----------
  // Common ranges use direct rules. The remaining one-unit pairs come from the C# writer's frozen table.
  const EXTRA_FOLD_PAIRS = "__CANOPYX_FOLD_PAIRS__";
  const EXTRA_LOWERCASE = new Map();
  const extraBytes = atob(EXTRA_FOLD_PAIRS);
  for (let i = 0; i < extraBytes.length; i += 4) {
    EXTRA_LOWERCASE.set(extraBytes.charCodeAt(i) | (extraBytes.charCodeAt(i + 1) << 8),
      extraBytes.charCodeAt(i + 2) | (extraBytes.charCodeAt(i + 3) << 8));
  }
  const GREEK_ACCENTED = { 0x0386: 0x03AC, 0x0388: 0x03AD, 0x0389: 0x03AE, 0x038A: 0x03AF, 0x038C: 0x03CC, 0x038E: 0x03CD, 0x038F: 0x03CE };

  function foldCode(c) {
    if (c < 0x80) {
      return c >= 65 && c <= 90 ? c + 32 : c;
    }
    if (c >= 0xC0 && c <= 0xDE && c !== 0xD7) {
      return c + 0x20;
    }
    if (c >= 0x0100 && c <= 0x017F) {
      if ((c <= 0x012F || (c >= 0x0132 && c <= 0x0137) || (c >= 0x014A && c <= 0x0177)) && c % 2 === 0) {
        return c + 1;
      }
      if (((c >= 0x0139 && c <= 0x0148) || (c >= 0x0179 && c <= 0x017E)) && c % 2 === 1) {
        return c + 1;
      }
      return c === 0x0178 ? 0x00FF : c;
    }
    if ((c >= 0x0391 && c <= 0x03A9 && c !== 0x03A2) || (c >= 0x0410 && c <= 0x042F)) {
      return c + 0x20;
    }
    if (c >= 0x0400 && c <= 0x040F) {
      return c + 0x50;
    }
    if (c >= 0x0531 && c <= 0x0556) {
      return c + 0x30;
    }
    if (GREEK_ACCENTED[c]) return GREEK_ACCENTED[c];
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

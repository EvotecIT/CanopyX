/*
 * CanopyX browser runtime: a virtualized tree grid over the canopyx/1 data protocol. No dependencies.
 * Assembled from CanopyX.Html/Assets/canopyx.source/*.js by Build/Sync-Assets.ps1; edit the parts, not canopyx.js.
 */
(function (global) {
  "use strict";

  // A second copy of the runtime on the same page would take over the sidecar queue from the first; keep the first.
  if (global.CanopyX) {
    return;
  }

  const PROTOCOL = "canopyx/1";
  const OVERSCAN = 8;
  const TYPEAHEAD_MS = 600;
  const INDENT = 18;
  const COUNTS_BATCH = 50;
  const SHARD_CACHE = 24;
  const SEARCH_CANDIDATES = 5;
  const SHARD_BATCH = 4;
  const MAX_COLUMN_WIDTH = 2147483647;
  const activeGrids = new WeakMap();
  let instanceSeq = 0;

  /** Creates an element with an optional class name. */
  function h(tag, className) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    return element;
  }

  /** Sets text safely; every host string goes through textContent, never innerHTML. */
  function setText(element, value) {
    element.textContent = value == null ? "" : String(value);
  }

  function safeId(value) {
    return String(value).replace(/[^A-Za-z0-9_-]/g, "_");
  }

  /** Throws unless a document has the expected protocol, type, and required envelope fields. */
  function checkDocument(doc, type) {
    if (!doc || typeof doc !== "object") {
      throw new Error("CanopyX: expected a " + type + " document, got " + typeof doc);
    }
    if (doc.protocol !== PROTOCOL) {
      throw new Error("CanopyX: unsupported protocol '" + doc.protocol + "' (this runtime reads " + PROTOCOL + ")");
    }
    if (doc.type !== type) {
      throw new Error("CanopyX: expected a " + type + " document, got '" + doc.type + "'");
    }
    if (type === "search") {
      if (!Array.isArray(doc.hits)) throw new Error("CanopyX: search hits must be an array.");
      if (typeof doc.truncated !== "boolean") throw new Error("CanopyX: search truncated must be a boolean.");
    }
    if (type === "counts" && !Array.isArray(doc.items)) throw new Error("CanopyX: counts items must be an array.");
    return doc;
  }

  /** URL-bound identifiers must be nonempty and contain complete UTF-16 surrogate pairs. */
  function requireIdentifier(value, name) {
    if (typeof value !== "string" || !/^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])+$/.test(value)) {
      throw new Error("CanopyX: " + name + " must be a nonempty, well-formed Unicode identifier");
    }
  }

  /** Verifies wire page ownership and required structural counters. */
  function checkPage(doc, node) {
    checkDocument(doc, "page");
    if (!Array.isArray(doc.items)) throw new Error("CanopyX: page items must be an array.");
    if (!Number.isInteger(doc.offset) || doc.offset < 0) throw new Error("CanopyX: page offset must be a nonnegative integer.");
    if (doc.next != null) requireIdentifier(doc.next, "page continuation");
    const parent = node ? node.id : null;
    if (doc.parent !== parent) throw new Error("CanopyX: page parent does not match the requested node.");
    return doc;
  }

  // ---------- cells ----------
  function isCellObject(cell) {
    return cell !== null && typeof cell === "object";
  }

  function cellValue(cell) {
    return isCellObject(cell) ? (cell.value === undefined ? null : cell.value) : (cell === undefined ? null : cell);
  }

  const numberFormats = new Map();
  function numberFormat(lang) {
    const key = lang || "";
    let format = numberFormats.get(key);
    if (!format) {
      try {
        format = new Intl.NumberFormat(lang || undefined, { maximumFractionDigits: 3 });
      } catch (e) {
        format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
      }
      numberFormats.set(key, format);
    }
    return format;
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function formatDate(value) {
    const time = Date.parse(value);
    if (isNaN(time)) {
      return String(value);
    }
    const d = new Date(time);
    return String(d.getUTCFullYear()).padStart(4, "0") + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + " UTC";
  }

  /** Formats a value without display text, following the protocol's default formatting table. */
  function formatValue(value, kind, lang) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    if (typeof value === "number" && kind === "number") {
      return numberFormat(lang).format(value);
    }
    if (typeof value === "string" && kind === "datetime") {
      return formatDate(value);
    }
    return String(value);
  }

  function cellText(cell, column, lang) {
    if (isCellObject(cell) && typeof cell.text === "string") {
      return cell.text;
    }
    return formatValue(cellValue(cell), column.kind, lang);
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  /** Sort key: numbers (and parsed dates, booleans) rank 0, strings rank 1, empty rank 2. */
  function sortKey(cell, column) {
    let value = cellValue(cell);
    if ((value === null || value === "") && isCellObject(cell) && typeof cell.text === "string" && cell.text !== "") {
      value = cell.text;
    }
    if (value === null || value === "") {
      return { rank: 2, value: 0 };
    }
    if (typeof value === "boolean") {
      return { rank: 0, value: value ? 1 : 0 };
    }
    if (typeof value === "number") {
      return { rank: 0, value: value };
    }
    if (column.kind === "datetime") {
      const time = Date.parse(value);
      if (!isNaN(time)) {
        return { rank: 0, value: time };
      }
    }
    return { rank: 1, value: String(value) };
  }

  function compareKeys(a, b, direction) {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    if (a.rank === 2) {
      return 0;
    }
    const order = a.rank === 0 ? (a.value < b.value ? -1 : a.value > b.value ? 1 : 0) : collator.compare(a.value, b.value);
    return order * direction;
  }

  // ---------- search text folding (shared rules with the C# bundle writer, see docs/data-protocol.md) ----------
  // A fixed table instead of toLowerCase(), whose data differs between browsers and from .NET: ASCII, Latin-1,
  // Latin Extended-A, basic Greek, and basic Cyrillic capitals fold to small letters; everything else stays.
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
    return GREEK_ACCENTED[c] || c;
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

  function rankLabel(label, query) {
    const l = foldText(label);
    const q = trimSeparators(foldText(query));
    return l === q ? 0 : l.startsWith(q) ? 1 : 2;
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

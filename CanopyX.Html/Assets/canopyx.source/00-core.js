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
  const ENTRY_CACHE = 32;
  const ENTRY_BATCH = 8;
  const SEARCH_CANDIDATES = 5;
  const MAX_PROTOCOL_INTEGER = 2147483647;
  const MAX_COLUMN_WIDTH = MAX_PROTOCOL_INTEGER;
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

  function validStructuralCount(value) {
    return Number.isInteger(value) && value >= 0 && value <= MAX_PROTOCOL_INTEGER;
  }

  function requireFlags(flags, name) {
    if (!Array.isArray(flags) || flags.some((flag) => typeof flag !== "string" || !flag.length)) {
      throw new Error("CanopyX: " + name + " must be an array of nonempty strings.");
    }
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
      validateSearchResult(doc);
      if (typeof doc.truncated !== "boolean") throw new Error("CanopyX: search truncated must be a boolean.");
      if (Object.prototype.hasOwnProperty.call(doc, "total") && !validStructuralCount(doc.total)) {
        throw new Error("CanopyX: search total must be a nonnegative 32-bit integer.");
      }
    }
    if (type === "counts") {
      if (!Array.isArray(doc.items)) throw new Error("CanopyX: counts items must be an array.");
      const ids = new Set();
      for (const item of doc.items) {
        requireIdentifier(item && item.id, "counts node ID");
        if (ids.has(item.id)) throw new Error("CanopyX: duplicate counts node ID '" + item.id + "'.");
        ids.add(item.id);
        if (Object.prototype.hasOwnProperty.call(item, "childCount") && !validStructuralCount(item.childCount)) {
          throw new Error("CanopyX: counts childCount must be a nonnegative 32-bit integer.");
        }
        if (Object.prototype.hasOwnProperty.call(item, "cells") &&
            (!item.cells || typeof item.cells !== "object" || Array.isArray(item.cells))) {
          throw new Error("CanopyX: counts cells must be an object.");
        }
        if (Object.prototype.hasOwnProperty.call(item, "flags")) requireFlags(item.flags, "counts flags");
      }
    }
    return doc;
  }

  /** URL-bound identifiers must be nonempty and contain complete UTF-16 surrogate pairs. */
  function requireIdentifier(value, name) {
    if (typeof value !== "string" || !/^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])+$/.test(value)) {
      throw new Error("CanopyX: " + name + " must be a nonempty, well-formed Unicode identifier");
    }
  }

  /** Search paths must be complete, unambiguous node-id paths before they reach navigation. */
  function validateSearchHit(hit) {
    if (!hit || typeof hit !== "object" || !Array.isArray(hit.path) || !hit.path.length || typeof hit.label !== "string") {
      throw new Error("CanopyX: search hit needs an ID path and string label.");
    }
    const ids = new Set();
    for (const id of hit.path) {
      requireIdentifier(id, "search hit path ID");
      if (ids.has(id)) throw new Error("CanopyX: search hit path repeats node ID '" + id + "'.");
      ids.add(id);
    }
    if ((Object.prototype.hasOwnProperty.call(hit, "kind") && typeof hit.kind !== "string") ||
        (Object.prototype.hasOwnProperty.call(hit, "context") && typeof hit.context !== "string")) {
      throw new Error("CanopyX: search hit kind and context must be strings.");
    }
  }

  /** Built-in and host-provided search results share the same hit boundary before navigation. */
  function validateSearchResult(result) {
    if (!result || !Array.isArray(result.hits)) throw new Error("CanopyX: search hits must be an array.");
    result.hits.forEach(validateSearchHit);
    return result;
  }

  /** Verifies wire page ownership and required structural counters. */
  function checkPage(doc, node) {
    checkDocument(doc, "page");
    if (!Array.isArray(doc.items)) throw new Error("CanopyX: page items must be an array.");
    if (!validStructuralCount(doc.offset)) throw new Error("CanopyX: page offset must be a nonnegative 32-bit integer.");
    if (Object.prototype.hasOwnProperty.call(doc, "total") && !validStructuralCount(doc.total)) {
      throw new Error("CanopyX: page total must be a nonnegative 32-bit integer.");
    }
    if (!Object.prototype.hasOwnProperty.call(doc, "next")) throw new Error("CanopyX: page continuation is required.");
    if (doc.next !== null) requireIdentifier(doc.next, "page continuation");
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

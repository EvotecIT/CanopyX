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
  const PACK_CACHE = 6;
  const DATE_CACHE = 4096;
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

  // A date is parsed and formatted once for both time zones; rows are painted again and again while scrolling.
  const dateTexts = new Map();

  /** [UTC text, local text] of an ISO date, each as yyyy-MM-dd HH:mm; null when the value is not a date. */
  function dateText(value) {
    let texts = dateTexts.get(value);
    if (texts === undefined) {
      const time = Date.parse(value);
      const d = new Date(time);
      texts = isNaN(time) ? null : [
        String(d.getUTCFullYear()).padStart(4, "0") + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()),
        String(d.getFullYear()).padStart(4, "0") + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes())];
      if (dateTexts.size >= DATE_CACHE) dateTexts.clear();
      dateTexts.set(value, texts);
    }
    return texts;
  }

  /** In UTC with the suffix "UTC", or in the reader's own time zone without a suffix. */
  function formatDate(value, local) {
    const texts = dateText(value);
    return texts ? (local ? texts[1] : texts[0] + " UTC") : String(value);
  }

  /** The same moment in the other time zone, as the tooltip of a date the runtime formatted; null for any other cell. */
  function otherZone(cell, column, local) {
    const value = cellValue(cell);
    if (column.kind !== "datetime" || typeof value !== "string" || (isCellObject(cell) && typeof cell.text === "string")) {
      return null;
    }
    const texts = dateText(value);
    return texts ? (local ? texts[0] + " UTC" : texts[1] + " local time") : null;
  }

  /** Formats a value without display text, following the protocol's default formatting table. */
  function formatValue(value, kind, lang, local) {
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
      return formatDate(value, local);
    }
    return String(value);
  }

  function cellText(cell, column, lang, local) {
    if (isCellObject(cell) && typeof cell.text === "string") {
      return cell.text;
    }
    return formatValue(cellValue(cell), column.kind, lang, local);
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

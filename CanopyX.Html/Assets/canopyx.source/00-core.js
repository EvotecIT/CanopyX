/* CanopyX: canopyx/2. */
/*
 * CanopyX browser runtime: a virtualized tree grid over the canopyx/2 data protocol. No dependencies.
 * Assembled from CanopyX.Html/Assets/canopyx.source/*.js by Build/Sync-Assets.ps1; edit the parts, not canopyx.js.
 */
(function (global) {
  "use strict";

  // A second copy of the runtime on the same page would take over the sidecar queue from the first; keep the first.
  if (global.CanopyX) {
    return;
  }

  const PROTOCOL = "canopyx/2";
  const OVERSCAN = 8;
  const TYPEAHEAD_MS = 600;
  const INDENT = 18;
  const COUNTS_BATCH = 50;
  const SHARD_CACHE = 24;
  const ENTRY_CACHE = 32;
  const ENTRY_BATCH = 8;
  const PACK_CACHE = 6;
  const PACK_CACHE_BYTES = 2 * 1024 * 1024;
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

  /** A removable chip keeps its text shrinkable and its removal mark visible. */
  function filterChipContent(button, text) {
    const label = h("span", "cx-chip-label"), remove = h("span", "cx-chip-remove");
    setText(label, text); setText(remove, " ×"); remove.setAttribute("aria-hidden", "true");
    button.classList.add("cx-filter-chip"); button.replaceChildren(label, remove);
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
    if (Object.hasOwn(doc, "revision")) requireIdentifier(doc.revision, "dataset revision");
    if (type === "search") {
      validateSearchResult(doc);
      if (typeof doc.truncated !== "boolean") throw new Error("CanopyX: search truncated must be a boolean.");
      if (Object.hasOwn(doc, "total") && !validStructuralCount(doc.total)) {
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
        if (Object.hasOwn(item, "childCount") && !validStructuralCount(item.childCount)) {
          throw new Error("CanopyX: counts childCount must be a nonnegative 32-bit integer.");
        }
        if (Object.hasOwn(item, "cells") &&
            (!item.cells || typeof item.cells !== "object" || Array.isArray(item.cells))) {
          throw new Error("CanopyX: counts cells must be an object.");
        }
        if (Object.hasOwn(item, "flags")) requireFlags(item.flags, "counts flags");
      }
    }
    return doc;
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
    if ((Object.hasOwn(hit, "kind") && typeof hit.kind !== "string") ||
        (Object.hasOwn(hit, "context") && typeof hit.context !== "string")) {
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
    if (Object.hasOwn(doc, "total") && !validStructuralCount(doc.total)) {
      throw new Error("CanopyX: page total must be a nonnegative 32-bit integer.");
    }
    if (!Object.hasOwn(doc, "next")) throw new Error("CanopyX: page continuation is required.");
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

  // ---------- tones ----------
  // The stylesheet has colours for six tones. Any other tone is the host's: its colours come from the theme's
  // --cx-tone-<name> (text) and --cx-tone-<name>-bg (badge background), through two properties set on the element.
  const NO_TONE = { cls: "", host: null };
  const tones = new Map();

  /** The class names of a tone (with a leading space) and, for a host tone, its name; a malformed tone has neither. */
  function toneOf(name) {
    let tone = typeof name === "string" ? tones.get(name) : NO_TONE;
    if (!tone) {
      // A name ending in -bg would read its text colour from the badge background of another tone.
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(name) || name.endsWith("-bg")) {
        return NO_TONE;
      }
      const host = !/^(neutral|info|success|warning|danger|muted)$/.test(name);
      tone = { cls: " cx-tone-" + name + (host ? " cx-toned" : ""), host: host ? name : null };
      if (tones.size < 256) tones.set(name, tone);
    }
    return tone;
  }

  /** Gives an element the classes of a tone after its base classes, and points it at the theme colours of a host tone. */
  function applyTone(element, base, tone) {
    element.className = base + tone.cls;
    toneColors(element, tone);
  }

  function toneColors(element, tone) {
    if ((element._tone || null) === tone.host) {
      return;
    }
    element._tone = tone.host;
    if (tone.host) {
      element.style.setProperty("--cx-t", "var(--cx-tone-" + tone.host + ")");
      element.style.setProperty("--cx-t-bg", "var(--cx-tone-" + tone.host + "-bg)");
    } else {
      element.style.removeProperty("--cx-t");
      element.style.removeProperty("--cx-t-bg");
    }
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
      if (numberFormats.size >= 16) numberFormats.delete(numberFormats.keys().next().value);
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

  /**
   * What formatting a grid's cells needs: the page language, the time zone, and the labels, with the date labels
   * split around {time} once, because dates are formatted again on every paint.
   */
  function formatting(lang, local, labels) {
    const split = (template) => { const at = template.indexOf("{time}"); return [template.slice(0, at), template.slice(at + 6)]; };
    return { lang, local, labels, utc: split(labels.utcTime), other: split(labels.localTime) };
  }

  /** In UTC, marked as UTC by the label, or in the reader's own time zone without a mark. */
  function formatDate(value, fmt) {
    const texts = dateText(value);
    return texts ? (fmt.local ? texts[1] : fmt.utc[0] + texts[0] + fmt.utc[1]) : String(value);
  }

  /** The same moment in the other time zone, as the tooltip of a date the runtime formatted; null for any other cell. */
  function otherZone(cell, column, fmt) {
    const value = cellValue(cell);
    if (column.kind !== "datetime" || typeof value !== "string" || (isCellObject(cell) && typeof cell.text === "string")) {
      return null;
    }
    const texts = dateText(value);
    return texts ? (fmt.local ? fmt.utc[0] + texts[0] + fmt.utc[1] : fmt.other[0] + texts[1] + fmt.other[1]) : null;
  }

  /** Formats a value without display text, following the protocol's default formatting table. */
  function formatValue(value, kind, fmt) {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "boolean") {
      return value ? fmt.labels.yes : fmt.labels.no;
    }
    if (typeof value === "number" && kind === "number") {
      return numberFormat(fmt.lang).format(value);
    }
    if (typeof value === "string" && kind === "datetime") {
      return formatDate(value, fmt);
    }
    return String(value);
  }

  function cellText(cell, column, fmt) {
    if (isCellObject(cell) && typeof cell.text === "string") {
      return cell.text;
    }
    return formatValue(cellValue(cell), column.kind, fmt);
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  /**
   * Sort key: numbers (and parsed dates, booleans) rank 0, strings rank 1, empty rank 2. A cell's sort field (text or a
   * number) replaces its value for sorting only; search and filters keep reading the value.
   */
  function sortKey(cell, column) {
    // Trees read a sort key that is text or a finite number and ignore any other (flat grids reject it).
    let value = isCellObject(cell) && (typeof cell.sort === "string" || Number.isFinite(cell.sort)) ? cell.sort : cellValue(cell);
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
      return { rank: 0, value };
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

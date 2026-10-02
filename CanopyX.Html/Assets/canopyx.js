/*
 * CanopyX browser runtime: a virtualized tree grid over the canopyx/2 data protocol. No dependencies.
 * Assembled from CanopyX.Html/Assets/canopyx.source/*.js by Build/Sync-Assets.ps1; edit the parts, not canopyx.js.
 */
(function (global) {
  "use strict";

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
  const DATE_CACHE = 4096;
  const SEARCH_CANDIDATES = 5;
  const MAX_PROTOCOL_INTEGER = 2147483647;
  const MAX_COLUMN_WIDTH = MAX_PROTOCOL_INTEGER;
  const activeGrids = new WeakMap();
  let instanceSeq = 0;

  function h(tag, className) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    return element;
  }

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

  function validateSearchResult(result) {
    if (!result || !Array.isArray(result.hits)) throw new Error("CanopyX: search hits must be an array.");
    result.hits.forEach(validateSearchHit);
    return result;
  }

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

  function isCellObject(cell) {
    return cell !== null && typeof cell === "object";
  }

  function cellValue(cell) {
    return isCellObject(cell) ? (cell.value === undefined ? null : cell.value) : (cell === undefined ? null : cell);
  }

  const NO_TONE = { cls: "", host: null };
  const tones = new Map();

  function toneOf(name) {
    let tone = typeof name === "string" ? tones.get(name) : NO_TONE;
    if (!tone) {
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(name) || name.endsWith("-bg")) {
        return NO_TONE;
      }
      const host = !/^(neutral|info|success|warning|danger|muted)$/.test(name);
      tone = { cls: " cx-tone-" + name + (host ? " cx-toned" : ""), host: host ? name : null };
      if (tones.size < 256) tones.set(name, tone);
    }
    return tone;
  }

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
      numberFormats.set(key, format);
    }
    return format;
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  const dateTexts = new Map();

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

  const DEFAULT_LABELS = Object.freeze({
    searchPlaceholder: "Search", searchResults: "Search results", searchResultCount: "{count} results",
    searchResultCountOfTotal: "{count} of {total} results", searchResultCountOfMany: "{count} of many results",
    searchNoResults: "No results", searchTooShort: "Type at least {min} characters",
    searchWordTooShort: "Type a word of at least {min} characters", searchFailed: "Search failed: {error}",
    columns: "Columns", visibleColumns: "Visible columns", resizeColumn: "Resize {column}", columnWidth: "{width} pixels",
    loading: "Loading…", loadError: "Could not load: {error} (Enter to retry)",
    showMore: "Show more ({loaded} of {total} loaded)", showMoreUnknownTotal: "Show more ({loaded} loaded)",
    pageLoaded: "{loaded} of {total} loaded", itemsLoaded: "{count} items", yes: "Yes", no: "No",
    utcTime: "{time} UTC", localTime: "{time} local time", mountError: "This view could not be displayed: {error}"
  });

  function labelsFor(...sources) {
    const labels = Object.assign({}, DEFAULT_LABELS);
    for (const source of sources) {
      if (source == null) continue;
      if (typeof source !== "object" || Array.isArray(source)) throw new Error("CanopyX: labels must be an object of strings.");
      Object.keys(source).forEach((name) => {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_LABELS, name)) throw new Error("CanopyX: there is no label '" + name + "'.");
        if (typeof source[name] !== "string" || !/\S/.test(source[name])) throw new Error("CanopyX: label '" + name + "' must be a string with visible text.");
        if ((name === "utcTime" || name === "localTime") && source[name].indexOf("{time}") < 0) throw new Error("CanopyX: label '" + name + "' must hold {time}.");
        labels[name] = source[name];
      });
    }
    return Object.freeze(labels);
  }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, name) => (values && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match));
  }

  function formatting(lang, local, labels) {
    const split = (template) => { const at = template.indexOf("{time}"); return [template.slice(0, at), template.slice(at + 6)]; };
    return { lang: lang, local: local, labels: labels, utc: split(labels.utcTime), other: split(labels.localTime) };
  }

  function formatDate(value, fmt) {
    const texts = dateText(value);
    return texts ? (fmt.local ? texts[1] : fmt.utc[0] + texts[0] + fmt.utc[1]) : String(value);
  }

  function otherZone(cell, column, fmt) {
    const value = cellValue(cell);
    if (column.kind !== "datetime" || typeof value !== "string" || (isCellObject(cell) && typeof cell.text === "string")) {
      return null;
    }
    const texts = dateText(value);
    return texts ? (fmt.local ? fmt.utc[0] + texts[0] + fmt.utc[1] : fmt.other[0] + texts[1] + fmt.other[1]) : null;
  }

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

  const EXTRA_FOLD_PAIRS = "QQBhAEIAYgBDAGMARABkAEUAZQBGAGYARwBnAEgAaABJAGkASgBqAEsAawBMAGwATQBtAE4AbgBPAG8AUABwAFEAcQBSAHIAUwBzAFQAdABVAHUAVgB2AFcAdwBYAHgAWQB5AFoAegDAAOAAwQDhAMIA4gDDAOMAxADkAMUA5QDGAOYAxwDnAMgA6ADJAOkAygDqAMsA6wDMAOwAzQDtAM4A7gDPAO8A0ADwANEA8QDSAPIA0wDzANQA9ADVAPUA1gD2ANgA+ADZAPkA2gD6ANsA+wDcAPwA3QD9AN4A/gAAAQEBAgEDAQQBBQEGAQcBCAEJAQoBCwEMAQ0BDgEPARABEQESARMBFAEVARYBFwEYARkBGgEbARwBHQEeAR8BIAEhASIBIwEkASUBJgEnASgBKQEqASsBLAEtAS4BLwEyATMBNAE1ATYBNwE5AToBOwE8AT0BPgE/AUABQQFCAUMBRAFFAUYBRwFIAUoBSwFMAU0BTgFPAVABUQFSAVMBVAFVAVYBVwFYAVkBWgFbAVwBXQFeAV8BYAFhAWIBYwFkAWUBZgFnAWgBaQFqAWsBbAFtAW4BbwFwAXEBcgFzAXQBdQF2AXcBeAH/AHkBegF7AXwBfQF+AYEBUwKCAYMBhAGFAYYBVAKHAYgBiQFWAooBVwKLAYwBjgHdAY8BWQKQAVsCkQGSAZMBYAKUAWMClgFpApcBaAKYAZkBnAFvAp0BcgKfAXUCoAGhAaIBowGkAaUBpgGAAqcBqAGpAYMCrAGtAa4BiAKvAbABsQGKArIBiwKzAbQBtQG2AbcBkgK4AbkBvAG9AcQBxgHFAcYBxwHJAcgByQHKAcwBywHMAc0BzgHPAdAB0QHSAdMB1AHVAdYB1wHYAdkB2gHbAdwB3gHfAeAB4QHiAeMB5AHlAeYB5wHoAekB6gHrAewB7QHuAe8B8QHzAfIB8wH0AfUB9gGVAfcBvwH4AfkB+gH7AfwB/QH+Af8BAAIBAgICAwIEAgUCBgIHAggCCQIKAgsCDAINAg4CDwIQAhECEgITAhQCFQIWAhcCGAIZAhoCGwIcAh0CHgIfAiACngEiAiMCJAIlAiYCJwIoAikCKgIrAiwCLQIuAi8CMAIxAjICMwI6AmUsOwI8Aj0CmgE+AmYsQQJCAkMCgAFEAokCRQKMAkYCRwJIAkkCSgJLAkwCTQJOAk8CcANxA3IDcwN2A3cDfwPzA4YDrAOIA60DiQOuA4oDrwOMA8wDjgPNA48DzgORA7EDkgOyA5MDswOUA7QDlQO1A5YDtgOXA7cDmAO4A5kDuQOaA7oDmwO7A5wDvAOdA70DngO+A58DvwOgA8ADoQPBA6MDwwOkA8QDpQPFA6YDxgOnA8cDqAPIA6kDyQOqA8oDqwPLA88D1wPYA9kD2gPbA9wD3QPeA98D4APhA+ID4wPkA+UD5gPnA+gD6QPqA+sD7APtA+4D7wP0A7gD9wP4A/kD8gP6A/sD/QN7A/4DfAP/A30DAARQBAEEUQQCBFIEAwRTBAQEVAQFBFUEBgRWBAcEVwQIBFgECQRZBAoEWgQLBFsEDARcBA0EXQQOBF4EDwRfBBAEMAQRBDEEEgQyBBMEMwQUBDQEFQQ1BBYENgQXBDcEGAQ4BBkEOQQaBDoEGwQ7BBwEPAQdBD0EHgQ+BB8EPwQgBEAEIQRBBCIEQgQjBEMEJAREBCUERQQmBEYEJwRHBCgESAQpBEkEKgRKBCsESwQsBEwELQRNBC4ETgQvBE8EYARhBGIEYwRkBGUEZgRnBGgEaQRqBGsEbARtBG4EbwRwBHEEcgRzBHQEdQR2BHcEeAR5BHoEewR8BH0EfgR/BIAEgQSKBIsEjASNBI4EjwSQBJEEkgSTBJQElQSWBJcEmASZBJoEmwScBJ0EngSfBKAEoQSiBKMEpASlBKYEpwSoBKkEqgSrBKwErQSuBK8EsASxBLIEswS0BLUEtgS3BLgEuQS6BLsEvAS9BL4EvwTABM8EwQTCBMMExATFBMYExwTIBMkEygTLBMwEzQTOBNAE0QTSBNME1ATVBNYE1wTYBNkE2gTbBNwE3QTeBN8E4AThBOIE4wTkBOUE5gTnBOgE6QTqBOsE7ATtBO4E7wTwBPEE8gTzBPQE9QT2BPcE+AT5BPoE+wT8BP0E/gT/BAAFAQUCBQMFBAUFBQYFBwUIBQkFCgULBQwFDQUOBQ8FEAURBRIFEwUUBRUFFgUXBRgFGQUaBRsFHAUdBR4FHwUgBSEFIgUjBSQFJQUmBScFKAUpBSoFKwUsBS0FLgUvBTEFYQUyBWIFMwVjBTQFZAU1BWUFNgVmBTcFZwU4BWgFOQVpBToFagU7BWsFPAVsBT0FbQU+BW4FPwVvBUAFcAVBBXEFQgVyBUMFcwVEBXQFRQV1BUYFdgVHBXcFSAV4BUkFeQVKBXoFSwV7BUwFfAVNBX0FTgV+BU8FfwVQBYAFUQWBBVIFggVTBYMFVAWEBVUFhQVWBYYFoBAALaEQAS2iEAItoxADLaQQBC2lEAUtphAGLacQBy2oEAgtqRAJLaoQCi2rEAstrBAMLa0QDS2uEA4trxAPLbAQEC2xEBEtshASLbMQEy20EBQttRAVLbYQFi23EBctuBAYLbkQGS26EBotuxAbLbwQHC29EB0tvhAeLb8QHy3AECAtwRAhLcIQIi3DECMtxBAkLcUQJS3HECctzRAtLaATcKuhE3GrohNyq6MTc6ukE3SrpRN1q6YTdqunE3erqBN4q6kTeauqE3qrqxN7q6wTfKutE32rrhN+q68Tf6uwE4CrsROBq7ITgquzE4OrtBOEq7UThau2E4artxOHq7gTiKu5E4mruhOKq7sTi6u8E4yrvRONq74Tjqu/E4+rwBOQq8ETkavCE5KrwxOTq8QTlKvFE5WrxhOWq8cTl6vIE5iryROZq8oTmqvLE5urzBOcq80TnavOE56rzxOfq9AToKvRE6Gr0hOiq9MTo6vUE6Sr1ROlq9YTpqvXE6er2BOoq9kTqavaE6qr2xOrq9wTrKvdE62r3hOuq98Tr6vgE7Cr4ROxq+ITsqvjE7Or5BO0q+UTtavmE7ar5xO3q+gTuKvpE7mr6hO6q+sTu6vsE7yr7RO9q+4TvqvvE7+r8BP4E/ET+RPyE/oT8xP7E/QT/BP1E/0TiRyKHJAc0BCRHNEQkhzSEJMc0xCUHNQQlRzVEJYc1hCXHNcQmBzYEJkc2RCaHNoQmxzbEJwc3BCdHN0QnhzeEJ8c3xCgHOAQoRzhEKIc4hCjHOMQpBzkEKUc5RCmHOYQpxznEKgc6BCpHOkQqhzqEKsc6xCsHOwQrRztEK4c7hCvHO8QsBzwELEc8RCyHPIQsxzzELQc9BC1HPUQthz2ELcc9xC4HPgQuRz5ELoc+hC9HP0Qvhz+EL8c/xAAHgEeAh4DHgQeBR4GHgceCB4JHgoeCx4MHg0eDh4PHhAeER4SHhMeFB4VHhYeFx4YHhkeGh4bHhweHR4eHh8eIB4hHiIeIx4kHiUeJh4nHigeKR4qHiseLB4tHi4eLx4wHjEeMh4zHjQeNR42HjceOB45HjoeOx48Hj0ePh4/HkAeQR5CHkMeRB5FHkYeRx5IHkkeSh5LHkweTR5OHk8eUB5RHlIeUx5UHlUeVh5XHlgeWR5aHlseXB5dHl4eXx5gHmEeYh5jHmQeZR5mHmceaB5pHmoeax5sHm0ebh5vHnAecR5yHnMedB51HnYedx54Hnkeeh57HnwefR5+Hn8egB6BHoIegx6EHoUehh6HHogeiR6KHosejB6NHo4ejx6QHpEekh6THpQelR6eHt8AoB6hHqIeox6kHqUeph6nHqgeqR6qHqserB6tHq4erx6wHrEesh6zHrQetR62HrceuB65Hroeux68Hr0evh6/HsAewR7CHsMexB7FHsYexx7IHskeyh7LHswezR7OHs8e0B7RHtIe0x7UHtUe1h7XHtge2R7aHtse3B7dHt4e3x7gHuEe4h7jHuQe5R7mHuce6B7pHuoe6x7sHu0e7h7vHvAe8R7yHvMe9B71HvYe9x74Hvke+h77Hvwe/R7+Hv8eCB8AHwkfAR8KHwIfCx8DHwwfBB8NHwUfDh8GHw8fBx8YHxAfGR8RHxofEh8bHxMfHB8UHx0fFR8oHyAfKR8hHyofIh8rHyMfLB8kHy0fJR8uHyYfLx8nHzgfMB85HzEfOh8yHzsfMx88HzQfPR81Hz4fNh8/HzcfSB9AH0kfQR9KH0IfSx9DH0wfRB9NH0UfWR9RH1sfUx9dH1UfXx9XH2gfYB9pH2Efah9iH2sfYx9sH2QfbR9lH24fZh9vH2cfiB+AH4kfgR+KH4Ifix+DH4wfhB+NH4Ufjh+GH48fhx+YH5AfmR+RH5ofkh+bH5MfnB+UH50flR+eH5Yfnx+XH6gfoB+pH6Efqh+iH6sfox+sH6QfrR+lH64fph+vH6cfuB+wH7kfsR+6H3Afux9xH7wfsx/IH3IfyR9zH8ofdB/LH3UfzB/DH9gf0B/ZH9Ef2h92H9sfdx/oH+Af6R/hH+ofeh/rH3sf7B/lH/gfeB/5H3kf+h98H/sffR/8H/MfJiHJAyohawArIeUAMiFOIWAhcCFhIXEhYiFyIWMhcyFkIXQhZSF1IWYhdiFnIXchaCF4IWkheSFqIXohayF7IWwhfCFtIX0hbiF+IW8hfyGDIYQhtiTQJLck0SS4JNIkuSTTJLok1CS7JNUkvCTWJL0k1yS+JNgkvyTZJMAk2iTBJNskwiTcJMMk3STEJN4kxSTfJMYk4CTHJOEkyCTiJMkk4yTKJOQkyyTlJMwk5iTNJOckziToJM8k6SQALDAsASwxLAIsMiwDLDMsBCw0LAUsNSwGLDYsByw3LAgsOCwJLDksCiw6LAssOywMLDwsDSw9LA4sPiwPLD8sECxALBEsQSwSLEIsEyxDLBQsRCwVLEUsFixGLBcsRywYLEgsGSxJLBosSiwbLEssHCxMLB0sTSweLE4sHyxPLCAsUCwhLFEsIixSLCMsUywkLFQsJSxVLCYsViwnLFcsKCxYLCksWSwqLFosKyxbLCwsXCwtLF0sLixeLC8sXyxgLGEsYixrAmMsfR1kLH0CZyxoLGksaixrLGwsbSxRAm4scQJvLFACcCxSAnIscyx1LHYsfiw/An8sQAKALIEsgiyDLIQshSyGLIcsiCyJLIosiyyMLI0sjiyPLJAskSySLJMslCyVLJYslyyYLJksmiybLJwsnSyeLJ8soCyhLKIsoyykLKUspiynLKgsqSyqLKssrCytLK4sryywLLEssiyzLLQstSy2LLcsuCy5LLosuyy8LL0sviy/LMAswSzCLMMsxCzFLMYsxyzILMksyizLLMwszSzOLM8s0CzRLNIs0yzULNUs1izXLNgs2SzaLNss3CzdLN4s3yzgLOEs4izjLOss7CztLO4s8izzLECmQaZCpkOmRKZFpkamR6ZIpkmmSqZLpkymTaZOpk+mUKZRplKmU6ZUplWmVqZXplimWaZaplumXKZdpl6mX6ZgpmGmYqZjpmSmZaZmpmemaKZppmqma6Zspm2mgKaBpoKmg6aEpoWmhqaHpoimiaaKpoumjKaNpo6mj6aQppGmkqaTppSmlaaWppemmKaZppqmm6YipyOnJKclpyanJ6copymnKqcrpyynLacupy+nMqczpzSnNac2pzenOKc5pzqnO6c8pz2nPqc/p0CnQadCp0OnRKdFp0anR6dIp0mnSqdLp0ynTadOp0+nUKdRp1KnU6dUp1WnVqdXp1inWadap1unXKddp16nX6dgp2GnYqdjp2SnZadmp2enaKdpp2qna6dsp22nbqdvp3mneqd7p3ynfad5HX6nf6eAp4GngqeDp4SnhaeGp4eni6eMp42nZQKQp5GnkqeTp5anl6eYp5mnmqebp5ynnaeep5+noKehp6Kno6ekp6Wnpqenp6inqaeqp2YCq6dcAqynYQKtp2wCrqdqArCnngKxp4cCsqedArOnU6u0p7Wntqe3p7inuae6p7unvKe9p76nv6fAp8GnwqfDp8SnlKfFp4ICxqeOHcenyKfJp8qny6dkAsynzafQp9Gn1qfXp9in2afap9un3KebAfWn9qch/0H/Iv9C/yP/Q/8k/0T/Jf9F/yb/Rv8n/0f/KP9I/yn/Sf8q/0r/K/9L/yz/TP8t/03/Lv9O/y//T/8w/1D/Mf9R/zL/Uv8z/1P/NP9U/zX/Vf82/1b/N/9X/zj/WP85/1n/Ov9a/w==";
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

  function trimSeparators(text) {
    let start = 0, end = text.length;
    while (start < end && isSeparator(text.charCodeAt(start))) start++;
    while (end > start && isSeparator(text.charCodeAt(end - 1))) end--;
    return text.slice(start, end);
  }

  function rankLabel(label, foldedQuery) {
    const l = trimSeparators(foldText(label));
    return l === foldedQuery ? 0 : l.startsWith(foldedQuery) ? 1 : 2;
  }

  function shardKey(prefix) {
    let out = "";
    for (let i = 0; i < prefix.length; i++) {
      const code = prefix.charCodeAt(i);
      out += (code >= 97 && code <= 122) || (code >= 48 && code <= 57) ? prefix.charAt(i) : "_" + ("000" + code.toString(16)).slice(-4);
    }
    return out;
  }

  const sidecarDocs = new Map();
  const sidecarWaiters = new Map();

  function sidecarKey(view, ref) {
    return JSON.stringify([view, ref]);
  }

  function acceptSidecar(entry) {
    if (!Array.isArray(entry) || entry.length !== 3) {
      return;
    }
    const key = sidecarKey(entry[0], entry[1]);
    const waiter = sidecarWaiters.get(key);
    if (waiter) {
      sidecarWaiters.delete(key);
      waiter.resolve(entry[2]);
    } else {
      sidecarDocs.set(key, entry[2]);
    }
  }

  const sidecarQueue = global.CanopyXSidecar = global.CanopyXSidecar || [];
  sidecarQueue.forEach(acceptSidecar);
  sidecarQueue.length = 0;
  sidecarQueue.push = function () {
    for (let i = 0; i < arguments.length; i++) {
      acceptSidecar(arguments[i]);
    }
    return 0;
  };

  function loadSidecar(base, view, ref) {
    if (ref.split("/").some((part) => part === "." || part === "..")) {
      return Promise.reject(new Error("Sidecar reference cannot contain a dot path component: " + ref));
    }
    const key = sidecarKey(view, ref);
    if (sidecarDocs.has(key)) {
      const doc = sidecarDocs.get(key);
      sidecarDocs.delete(key);
      return Promise.resolve(doc);
    }
    const pending = sidecarWaiters.get(key);
    if (pending) {
      return pending.promise;
    }
    const waiter = {};
    waiter.promise = new Promise((resolve, reject) => {
      waiter.resolve = resolve;
      waiter.reject = reject;
    });
    sidecarWaiters.set(key, waiter);
    const script = document.createElement("script");
    script.src = base + ref.split("/").map(encodeURIComponent).join("/") + ".js";
    script.async = true;
    script.onload = () => {
      script.remove();
      if (sidecarWaiters.get(key) === waiter) {
        sidecarWaiters.delete(key);
        waiter.reject(new Error("Sidecar file did not register its data: " + ref));
      }
    };
    script.onerror = () => {
      script.remove();
      if (sidecarWaiters.get(key) === waiter) {
        sidecarWaiters.delete(key);
        waiter.reject(new Error("Sidecar file is missing: " + ref));
      }
    };
    document.head.appendChild(script);
    return waiter.promise;
  }


  function badIndex(what) {
    return new Error("CanopyX: search " + what + " does not match the manifest or is malformed.");
  }

  function isCount(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function checkSearchIndex(index) {
    if (!index || !isCount(index.entryCount) || !Array.isArray(index.entryFiles) || !Array.isArray(index.kinds) ||
        !index.shards || typeof index.shards !== "object" || (index.entryCount > 0) !== (index.entryFiles.length > 0) ||
        index.kinds.some((kind) => typeof kind !== "string") || index.entryFiles.some((first, i) =>
          !isCount(first) || first >= index.entryCount || (i ? first <= index.entryFiles[i - 1] : first))) {
      throw badIndex("index");
    }
    if (index.entryPacks === undefined && index.shardPacks === undefined) return;
    const keys = Object.keys(index.shards).sort();
    if (!Array.isArray(index.entryPacks) || !Array.isArray(index.shardPacks) ||
        (index.entryFiles.length > 0) !== (index.entryPacks.length > 0) || (keys.length > 0) !== (index.shardPacks.length > 0) ||
        index.entryPacks.some((first, i) => !isCount(first) || first >= index.entryFiles.length || (i ? first <= index.entryPacks[i - 1] : first)) ||
        index.shardPacks.some((key, i) => typeof key !== "string" || !Object.prototype.hasOwnProperty.call(index.shards, key) || (i ? key <= index.shardPacks[i - 1] : key !== keys[0]))) {
      throw badIndex("index packs");
    }
  }

  function resolveShards(shards, keys, word) {
    const bases = keys.filter((key) => !/\.\d+$/.test(key));
    const parts = (selected) => selected.flatMap((key) => [key].concat(keys.filter((part) => part.startsWith(key + "."))
      .sort((a, b) => Number(a.slice(a.lastIndexOf(".") + 1)) - Number(b.slice(b.lastIndexOf(".") + 1)))));
    for (let length = Math.min(2, word.length); length <= word.length; length++) {
      const key = shardKey(word.slice(0, length));
      if (Object.prototype.hasOwnProperty.call(shards, key)) return parts([key]);
      const deeper = bases.filter((k) => k.length > key.length && k.startsWith(key));
      if (!deeper.length) return [];
      if (length === word.length) return parts(deeper);
    }
    return [];
  }

  function recentCache(limit, loadDoc) {
    const cache = new Map();
    const get = (key) => {
      let pending = cache.get(key);
      if (pending) {
        cache.delete(key);
      } else {
        pending = loadDoc(key);
        pending.catch(() => cache.get(key) === pending && cache.delete(key));
      }
      cache.set(key, pending);
      if (cache.size > limit) cache.delete(cache.keys().next().value);
      return pending;
    };
    get.clear = () => cache.clear();
    return get;
  }

  function checkShard(doc, key, count, entryCount) {
    checkDocument(doc, "searchShard");
    if (doc.key !== key) throw badIndex("shard key");
    if (!Array.isArray(doc.words) || !Array.isArray(doc.postings) || doc.words.length !== doc.postings.length) throw badIndex("shard");
    let total = 0;
    doc.postings.forEach((list, i) => {
      if (typeof doc.words[i] !== "string" || !Array.isArray(list) || !isCount(list[0])) throw badIndex("shard");
      let last = list[0];
      for (let j = 1; j < list.length; j++) {
        if (!Number.isInteger(list[j]) || !list[j]) throw badIndex("shard");
        last += Math.abs(list[j]);
        total += list[j] < 0 ? -list[j] - 1 : 0;
      }
      total += list.length;
      if (last >= entryCount) throw badIndex("shard");
    });
    if (total !== count) throw badIndex("shard posting count");
    return doc;
  }

  function mergePostings(lists) {
    const out = [];
    let ascending = true;
    for (const list of lists) {
      let value = 0;
      list.forEach((step, i) => {
        for (let n = i && step < 0 ? -step : 1; n > 0; n--) {
          value = i ? value + (step < 0 ? 1 : step) : step;
          if (out.length && value <= out[out.length - 1]) ascending = false;
          out.push(value);
        }
      });
    }
    if (ascending) return out;
    out.sort((a, b) => a - b);
    return out.filter((value, i) => !i || value !== out[i - 1]);
  }

  function intersectPostings(a, b) {
    let j = 0;
    return a.filter((value) => {
      while (j < b.length && b[j] < value) j++;
      return b[j] === value;
    });
  }

  function labelToken(folded) {
    let hash = 2166136261;
    for (let i = 0; i < folded.length; i++) {
      hash = Math.imul(hash ^ folded.charCodeAt(i), 16777619);
    }
    return "\u0000" + ("0000000" + (hash >>> 0).toString(16)).slice(-8);
  }

  function entryReference(value) {
    return value === undefined || value === null || isIdentifier(value);
  }

  function entryFile(doc, first, count) {
    checkDocument(doc, "searchEntries");
    if (doc.first !== first || !Array.isArray(doc.stem) || !Array.isArray(doc.entries) || doc.entries.length !== count) throw badIndex("entry file");
    const stem = new Map(doc.stem.map((item) => (Array.isArray(item) ? [item[0], item.slice(1)] : [])));
    const records = new Map();
    const raw = (n) => {
      const item = n >= first && n < first + count ? doc.entries[n - first] : stem.get(n);
      if (!Array.isArray(item) || item.length < 5 || item.length > 8 || !Number.isInteger(item[0]) || item[0] < -1 || item[0] >= n ||
          !isCount(item[1]) || typeof item[2] !== "string" || !isCount(item[3]) || typeof item[4] !== "string" ||
          (item[5] != null && !isCount(item[5])) || !entryReference(item[6]) || !(item[7] === undefined || isIdentifier(item[7]))) {
        throw badIndex("entry " + n);
      }
      return item;
    };
    return (n) => {
      const pending = [];
      for (let k = n; k >= 0 && !records.has(k); k = raw(k)[0]) pending.push(k);
      while (pending.length) {
        const number = pending.pop();
        const item = raw(number);
        const parent = item[0] < 0 ? null : records.get(item[0]);
        const base = parent ? parent.id : "";
        if (item[1] + item[3] > base.length) throw badIndex("entry " + number);
        records.set(number, { parent: parent, id: base.slice(0, item[1]) + item[2] + base.slice(base.length - item[3]), label: item[4],
          kind: item[5] == null ? undefined : item[5], ref: item[6] || null, at: item[7] || null });
      }
      return records.get(n);
    };
  }

  function entryHit(record, kinds) {
    const path = [];
    for (let r = record; r; r = r.parent) path.unshift(r.id);
    const hit = { path: path, label: record.label };
    if (record.kind !== undefined) {
      if (record.kind >= kinds.length) throw badIndex("entry kind");
      hit.kind = kinds[record.kind];
    }
    const parent = record.parent;
    if (parent) hit.context = parent.parent ? parent.parent.label + " / " + parent.label : parent.label;
    validateSearchHit(hit);
    return hit;
  }

  function entryFileOf(starts, n) {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= n) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  function sidecarSearch(load, manifest, hints) {
    const index = async () => (await manifest()).search;
    const loadPack = recentCache(PACK_CACHE, async (number) => {
      const doc = checkDocument(await load("q/" + number), "pack");
      if (!Array.isArray(doc.pages)) throw badIndex("pack");
      return doc.pages;
    });
    const sortedKeys = new WeakMap();
    const packed = async (pack, slot) => {
      const text = (await loadPack(pack))[slot];
      if (typeof text !== "string") throw badIndex("pack");
      return JSON.parse(text);
    };
    const loadIndexDoc = async (search, kind, name) => {
      if (!search.entryPacks) return load(kind === "e" ? "e/" + name : "s/k-" + name);
      if (kind === "e") {
        const pack = entryFileOf(search.entryPacks, name);
        return packed(pack, name - search.entryPacks[pack]);
      }
      let keys = sortedKeys.get(search);
      if (!keys) sortedKeys.set(search, keys = Object.keys(search.shards).sort());
      let pack = 0;
      while (pack + 1 < search.shardPacks.length && search.shardPacks[pack + 1] <= name) pack++;
      return packed(search.entryPacks.length + pack, keys.indexOf(name) - keys.indexOf(search.shardPacks[pack]));
    };
    const loadShard = recentCache(SHARD_CACHE, async (key) => {
      const search = await index();
      return checkShard(await loadIndexDoc(search, "s", key), key, search.shards[key], search.entryCount);
    });
    const loadEntries = recentCache(ENTRY_CACHE, async (file) => {
      const search = await index();
      const first = search.entryFiles[file];
      const end = file + 1 < search.entryFiles.length ? search.entryFiles[file + 1] : search.entryCount;
      return entryFile(await loadIndexDoc(search, "e", file), first, end - first);
    });

    async function postingsOf(search, keys, word) {
      const lists = [];
      for (const shard of await Promise.all(resolveShards(search.shards, keys, word).map(loadShard))) {
        shard.words.forEach((indexed, i) => indexed.startsWith(word) && lists.push(shard.postings[i]));
      }
      return mergePostings(lists);
    }

    async function run(query, queryWords, limit, sequence) {
      const search = await index();
      if (!search) {
        return { hits: [], total: 0, truncated: false };
      }
      const keyWords = queryWords.filter((word, i) => queryWords.indexOf(word) === i &&
        !queryWords.some((other) => other.length > word.length && other.startsWith(word)));
      const keys = Object.keys(search.shards);
      const folded = trimSeparators(foldText(query));
      const [exact, lists] = await Promise.all([postingsOf(search, keys, labelToken(folded)),
        Promise.all(keyWords.map((word) => postingsOf(search, keys, word)))]);
      const candidates = lists.sort((a, b) => a.length - b.length).reduce(intersectPostings);
      const order = exact.concat(candidates);
      const wanted = limit * SEARCH_CANDIDATES;
      const taken = new Set();
      const hits = [];
      const records = new Map();
      let next = 0;
      while (next < order.length && hits.length < limit) {
        const files = [];
        let end = next;
        for (; end < order.length && hits.length + end - next < wanted; end++) {
          const file = entryFileOf(search.entryFiles, order[end]);
          if (files.indexOf(file) < 0) {
            if (files.length >= ENTRY_BATCH && hits.length + end - next >= limit) break;
            files.push(file);
          }
        }
        const loaded = await Promise.all(files.map(loadEntries));
        for (; next < end; next++) {
          const number = order[next];
          if (taken.has(number)) continue;
          const record = loaded[files.indexOf(entryFileOf(search.entryFiles, number))](number);
          if (next >= exact.length || trimSeparators(foldText(record.label)) === folded) {
            taken.add(number);
            const hit = entryHit(record, search.kinds);
            records.set(hit, record);
            hits.push(hit);
          }
        }
      }
      const ranked = rankHits(hits, query, limit);
      ranked.total = candidates.length;
      ranked.truncated = candidates.length > ranked.hits.length;
      if (sequence === latest) {
        hints.clear();
        ranked.hits.forEach((hit) => { for (let r = records.get(hit); r; r = r.parent) hints.set(r.id, r); });
      }
      return ranked;
    }

    let latest = 0;
    return (query, limit) => {
      const queryWords = words(query);
      if (!queryWords.length) {
        return Promise.resolve({ hits: [], total: 0, truncated: false });
      }
      if (!queryWords.some((word) => word.length >= 2)) {
        const error = new Error("CanopyX: sidecar search needs a word of at least two UTF-16 units.");
        error.code = "too-short";
        return Promise.reject(error);
      }
      return run(query, queryWords, limit, ++latest).catch((err) => {
        loadShard.clear();
        loadEntries.clear();
        loadPack.clear();
        throw err;
      });
    };
  }


  function slicePage(all, cursor, pageSize) {
    const offset = cursor ? Number(cursor) || 0 : 0;
    const items = all.slice(offset, offset + pageSize);
    const end = offset + items.length;
    return { items: items, total: all.length, next: end < all.length ? String(end) : null, offset: offset };
  }

  function rankHits(hits, query, limit) {
    const folded = trimSeparators(foldText(query));
    const ranked = hits.map((hit) => ({ hit: hit, rank: rankLabel(hit.label, folded) }));
    ranked.sort((a, b) => a.rank - b.rank || collator.compare(a.hit.label, b.hit.label));
    return { hits: ranked.slice(0, limit).map((item) => item.hit), total: hits.length, truncated: hits.length > limit };
  }

  function inlineSource(view) {
    const pageSize = view.pageSize || 100;
    const labelWords = new WeakMap();
    const wordsOf = (node) => {
      let cached = labelWords.get(node);
      if (!cached) {
        cached = words(node.label);
        labelWords.set(node, cached);
      }
      return cached;
    };
    return {
      kind: "inline",
      canSearch: true,
      page(node, cursor) {
        return Promise.resolve(slicePage(node ? node.children || [] : view.roots || [], cursor, pageSize));
      },
      search(query, limit) {
        const queryWords = words(query);
        const hits = [];
        const kinds = view.search && Array.isArray(view.search.kinds) && view.search.kinds.length ? view.search.kinds : null;
        if (queryWords.length) {
          const stack = (view.roots || []).map((node) => ({ node, parent: null })).reverse();
          while (stack.length) {
            const item = stack.pop();
            if ((!kinds || kinds.indexOf(item.node.kind) >= 0) && matchesWords(wordsOf(item.node), queryWords)) {
              const path = [];
              const labels = [];
              for (let entry = item; entry; entry = entry.parent) {
                path.push(entry.node.id);
                if (entry !== item) labels.push(entry.node.label);
              }
              const hit = { path: path.reverse(), label: item.node.label, context: labels.reverse().join(" / ") };
              if (item.node.kind != null) hit.kind = item.node.kind;
              hits.push(hit);
            }
            const children = item.node.children || [];
            for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], parent: item });
          }
        }
        return Promise.resolve(rankHits(hits, query, limit));
      }
    };
  }

  function sidecarSource(view) {
    const supplied = view.source.base;
    if (typeof supplied !== "string" || !supplied || /[?#]/.test(supplied)) throw new Error("CanopyX: sidecar base must be a folder path without a query or fragment.");
    const base = supplied.endsWith("/") ? supplied : supplied + "/";
    const load = (ref) => loadSidecar(base, view.id, ref);
    let manifestPromise = null;
    const manifest = () => manifestPromise || (manifestPromise = load("manifest").then((doc) => {
      checkDocument(doc, "manifest");
      if (doc.view !== view.id) throw new Error("CanopyX: manifest view does not match the requested view.");
      if (doc.search !== undefined) checkSearchIndex(doc.search);
      if (doc.packs !== undefined && !isCount(doc.packs)) throw new Error("CanopyX: manifest packs must be a count.");
      return doc;
    }).catch((err) => {
      manifestPromise = null;
      throw err;
    }));
    const loadPack = recentCache(PACK_CACHE, async (number) => {
      const doc = checkDocument(await load("p/" + number), "pack");
      if (!Array.isArray(doc.pages)) throw new Error("CanopyX: pack pages must be an array.");
      return doc.pages;
    });
    let pinned = new Map();
    const pin = (key, promise) => {
      pinned.set(key, promise);
      promise.catch(() => pinned.get(key) === promise && pinned.delete(key));
      return promise;
    };
    const packOf = async (ref) => {
      const packed = /^p\/(0|[1-9]\d*)#(0|[1-9]\d*)$/.exec(ref);
      return packed && (await manifest()).packs !== undefined ? packed : null;
    };
    const loadPage = async (ref) => {
      const packed = await packOf(ref);
      if (!packed) {
        const doc = pinned.get("file:" + ref);
        if (doc) pinned.delete("file:" + ref);
        return doc || load(ref);
      }
      const text = Number(packed[1]) < (await manifest()).packs ? (await (pinned.get("pack:" + packed[1]) || loadPack(packed[1])))[Number(packed[2])] : undefined;
      if (typeof text !== "string") throw new Error("CanopyX: the bundle has no packed page " + ref + ".");
      return JSON.parse(text);
    };
    const hints = new Map();
    return {
      kind: "sidecar",
      canSearch: true,
      manifest: manifest,
      async prefetch(opens, finds) {
        const refs = new Set();
        opens.forEach((id) => { const hint = hints.get(id); if (hint && hint.ref) refs.add(hint.ref); });
        finds.forEach((id) => { const hint = hints.get(id); if (hint && hint.at) refs.add(hint.at); });
        pinned = new Map();
        await Promise.all(Array.from(refs, async (ref) => {
          const packed = await packOf(ref);
          const key = packed ? "pack:" + packed[1] : "file:" + ref;
          if (!pinned.has(key)) await pin(key, packed ? loadPack(packed[1]) : load(ref));
        }).map((pending) => pending.catch(() => {})));
      },
      async page(node, cursor) {
        const ref = cursor || (node ? node.ref || node.id : (await manifest()).root);
        if (!ref) {
          throw new Error("Node '" + node.id + "' has no sidecar reference for its children.");
        }
        const doc = checkPage(await loadPage(ref), node);
        return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      search: sidecarSearch(load, manifest, hints)
    };
  }

  function remoteSource(view, options) {
    const source = view.source;
    const settings = options || {};
    const timeoutMs = settings.timeoutMs === undefined ? 30000 : settings.timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
      throw new Error("CanopyX: request timeout must be an integer from 1 to 2147483647 milliseconds.");
    }
    const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match));
    const getJson = (url, type, request) => remoteJson(url, type, timeoutMs, settings.signal, request && request.signal);
    return {
      kind: "remote",
      canSearch: !!source.search,
      async page(node, cursor, request) {
        const doc = checkPage(await getJson(fill(source.children, {
          ref: node ? encodeURIComponent(node.ref || node.id) : "",
          cursor: cursor ? encodeURIComponent(cursor) : ""
        }), "page", request), node);
        return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      async search(query, limit, request) {
        if (!source.search) {
          return { hits: [], total: 0, truncated: false };
        }
        const doc = await getJson(fill(source.search, { query: encodeURIComponent(query), limit: String(limit) }), "search", request);
        if (doc.query !== query) throw new Error("CanopyX: search response query does not match the request.");
        if (doc.total != null && (doc.total < doc.hits.length || doc.truncated !== (doc.total > doc.hits.length))) {
          throw new Error("CanopyX: search total and truncated flag disagree with the returned hits.");
        }
        return { hits: doc.hits, total: doc.total, truncated: doc.truncated };
      },
      counts: source.counts ? async (ids, request) => {
        const items = [];
        for (let i = 0; i < ids.length; i += COUNTS_BATCH) {
          const batch = ids.slice(i, i + COUNTS_BATCH).map((id) => encodeURIComponent(encodeURIComponent(id))).join(",");
          const doc = await getJson(fill(source.counts, { ids: batch }), "counts", request);
          items.push.apply(items, doc.items);
        }
        return { protocol: PROTOCOL, type: "counts", items: items };
      } : null
    };
  }

  function sourceFor(view, options) {
    const kind = view.source && view.source.kind;
    if (kind === "sidecar") {
      return sidecarSource(view);
    }
    if (kind === "remote") {
      return remoteSource(view, options);
    }
    if (kind === "inline") {
      if (!Array.isArray(view.roots)) throw new Error("CanopyX: inline view roots must be an array.");
      return inlineSource(view);
    }
    throw new Error("CanopyX: unknown source kind '" + kind + "'.");
  }

  async function remoteJson(url, type, timeoutMs, lifetime, signal) {
    const controller = new AbortController();
    const signals = Array.from(new Set([lifetime, signal].filter(Boolean)));
    const abort = () => controller.abort();
    signals.forEach((item) => {
      if (item.aborted) abort();
      else item.addEventListener("abort", abort, { once: true });
    });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) {
        if (response.body) await response.body.cancel().catch(() => {});
        throw new Error(response.status + " " + response.statusText);
      }
      return checkDocument(await response.json(), type);
    } catch (error) {
      if (timedOut) throw new Error("CanopyX: remote request timed out after " + timeoutMs + " milliseconds.");
      throw error;
    } finally {
      abort();
      clearTimeout(timer);
      signals.forEach((item) => item.removeEventListener("abort", abort));
    }
  }

  class TreeGrid {
    constructor(host, options) {
      const view = checkDocument(options.view, "view");
      requireIdentifier(view.id, "view ID");
      this.host = host;
      this.view = view;
      this.opts = options;
      for (const name of ["isSelectable", "beforeSelect"]) {
        if (options[name] !== undefined && typeof options[name] !== "function") throw new Error("CanopyX: " + name + " must be a function.");
      }
      this.id = "cx" + ++instanceSeq;
      this.lifetime = new AbortController();
      this.source = options.source || sourceFor(view, { signal: this.lifetime.signal, timeoutMs: options.requestTimeoutMs });
      this.rowH = view.rowHeight || 28;
      this.pageSize = view.pageSize || 100;
      this.multi = view.selection === "multiple";
      this.lang = document.documentElement.lang || undefined;
      this.labels = labelsFor(view.labels, options.labels);
      this.local = view.timeZone === "local";
      this.fmt = formatting(this.lang, this.local, this.labels);
      if (options.renderCell) {
        throw new Error("CanopyX: renderCell was replaced by renderers, an object of functions (node, element, context) by column id.");
      }
      const renderers = options.renderers || {};
      if (typeof renderers !== "object" || (Object.getPrototypeOf(renderers) !== Object.prototype && Object.getPrototypeOf(renderers) !== null)) {
        throw new Error("CanopyX: renderers must be a plain object of functions by column id.");
      }
      Object.keys(renderers).forEach((id) => {
        if (typeof renderers[id] !== "function" || !view.columns.some((column) => column.id === id)) {
          throw new Error("CanopyX: renderers needs a function for a column of the view, not for '" + id + "'.");
        }
      });
      if (!options.formatLink !== !options.parseLink) {
        throw new Error("CanopyX: formatLink and parseLink define one link scheme and are given together.");
      }
      const rendererOf = (id) => (Object.prototype.hasOwnProperty.call(renderers, id) ? renderers[id] : null);
      this.columns = view.columns.map((column, index) => Object.assign({}, column, { hidden: index > 0 && !!column.hidden, render: rendererOf(column.id) }));
      this.keyMap = new Map();
      this.root = { key: null, h: null, parent: null, level: 0, idx: 0, expanded: true, children: null, total: null, next: null, loading: false, error: null };
      if (!options.source && (!view.source || view.source.kind === "inline")) {
        this.root.inlineItems = view.roots || [];
      }
      this.rows = [];
      this.tops = [0];
      this.total = 0;
      this.version = 1;
      this.rendered = new Map();
      this.pool = [];
      this.focused = null;
      this.selected = new Set();
      this.anchor = null;
      this.filter = null;
      this.declaredFilter = null;
      this.filterExpand = false;
      this.activeFilters = new Set();
      this.sortState = null;
      this.typeBuf = "";
      this.typeAt = 0;
      this.rafId = 0;
      this.iconTemplates = this.buildIcons(view.icons || {});
      this.initializing = true;
      this.build();
      this.buildToolbar();
      this.ready = this.init();
    }

    async search(query, limit) {
      return validateSearchResult(await this.source.search(query, limit));
    }

    buildIcons(icons) {
      const templates = new Map();
      Object.keys(icons).forEach((key) => {
        const holder = h("span", "cx-icon");
        holder.setAttribute("aria-hidden", "true");
        holder.innerHTML = icons[key]; // trusted host SVG, declared once per view
        templates.set(key, holder);
      });
      return templates;
    }

    async init() {
      try {
        this.rootsReady = this.loadRoots();
        await this.rootsReady;
        await this.restoreState();
        await this.expandInitial(this.root);
        await this.openDeepLink();
      } finally {
        this.initializing = false;
      }
      if (this.destroyed) return;
      await this.flushPendingToggles();
      if (this.linkChanged) await this.openDeepLink();
      if (!this.destroyed) {
        this.host.setAttribute("data-cx-ready", "true");
        this.emit("ready", {});
      }
    }

    loadRoots() {
      if (!this.root.inlineItems) {
        return this.loadPage(this.root, null);
      }
      validateNodes(this.root.inlineItems, this.keyMap, true);
      const first = slicePage(this.root.inlineItems, null, this.pageSize);
      this.root.inline = true;
      this.root.children = first.items.map((node, i) => this.wrap(node, this.root, i));
      this.root.total = first.total;
      this.root.next = first.next;
      this.applySort(this.root, false);
      this.relayout();
      return Promise.resolve();
    }

    expandable(w) {
      return !!(w && w.h && !w.h.detail && (w.h.hasChildren || (w.children && w.children.length)));
    }

    statusRow(parent, kind) {
      kind = parent.loading ? "loading" : parent.error ? "error" : kind;
      let row = parent._status;
      if (!row) {
        row = parent._status = { key: null, status: kind, parent: parent, level: parent.level + 1, hpx: this.rowH, h: { id: "", label: "" }, _v: 0 };
      }
      row.status = kind;
      const format = numberFormat(this.lang);
      const loaded = format.format(parent.children ? parent.children.length : 0);
      const labels = this.labels;
      row.h.label = kind === "loading" ? labels.loading : kind === "error" ? fill(labels.loadError, { error: parent.error }) :
        parent.total != null ? fill(labels.showMore, { loaded: loaded, total: format.format(parent.total) }) : fill(labels.showMoreUnknownTotal, { loaded: loaded });
      row._v = 0;
      return row;
    }

    cellOf(node, column, index) {
      const cells = node.cells;
      if (cells && Object.prototype.hasOwnProperty.call(cells, column.id)) {
        return cells[column.id];
      }
      return index === 0 ? node.label : undefined;
    }

    emit(name, detail) {
      if (this.destroyed) return;
      this.host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail: detail, bubbles: true }));
    }
  }
  Object.assign(TreeGrid.prototype, {
    async expandInitial(parent) {
      if (this.restoring) return;
      const generation = this.restoreGeneration || 0;
      const pending = (parent.children || []).slice().reverse();
      while (pending.length && !this.destroyed && !this.restoring && generation === (this.restoreGeneration || 0)) {
        const w = pending.pop();
        if (w.autoExpand && !w.children) {
          w.autoExpand = false;
          await this.toggle(w, true, true);
        }
        if (w.expanded && w.children) {
          for (let i = w.children.length - 1; i >= 0; i--) pending.push(w.children[i]);
        }
      }
    },

    wrap(node, parent, index, suppressExpansion) {
      const initialExpansion = !suppressExpansion && !this.restoring;
      const create = (data, owner, position) => {
        requireIdentifier(data.id, "node ID");
        if (data.ref != null) requireIdentifier(data.ref, "node reference");
        const w = {
          key: data.id, h: data, parent: owner, level: owner.level + 1, idx: position, expanded: false,
          children: null, total: null, next: null, inline: false, loading: false, error: null,
          hpx: data.detail ? this.detailHeight(data.detail) : this.rowH, auto: !!data.detail && !(data.detail.height > 0), _v: 0
        };
        this.keyMap.set(data.id, w);
        return w;
      };
      const root = create(node, parent, index);
      const pending = [root];
      while (pending.length) {
        const w = pending.pop();
        const data = w.h;
        if (Array.isArray(data.children)) {
          const first = slicePage(data.children, null, this.pageSize);
          w.inline = true;
          w.children = first.items.map((child, i) => create(child, w, i));
          w.total = first.total;
          w.next = first.next;
          w.expanded = !!data.expanded && initialExpansion && w.children.length > 0;
          for (let i = w.children.length - 1; i >= 0; i--) pending.push(w.children[i]);
          this.applySort(w, false);
        } else if (data.hasChildren) {
          w.total = typeof data.childCount === "number" ? data.childCount : null;
          w.autoExpand = !!data.expanded && initialExpansion;
        }
      }
      return root;
    }
  });
  const LAYOUT_HOLD_MS = 250;

  Object.assign(TreeGrid.prototype, {
    matchState(w) {
      const pending = [{ node: w, visited: false }];
      while (pending.length) {
        const entry = pending.pop();
        const node = entry.node;
        if (node._fm !== undefined) continue;
        if (entry.visited) {
          node._fm = (node.children || []).some((child) => child._fm > 0) ? 1 : 0;
          continue;
        }
        if (this.filter.match(node.h)) node._fm = 2;
        else if (this.filter.keep && this.filter.keep(node.h)) node._fm = 1;
        else {
          pending.push({ node, visited: true });
          for (const child of node.children || []) {
            if (child._fm === undefined) pending.push({ node: child, visited: false });
          }
        }
      }
      return w._fm;
    },

    relayout(now) {
      if (this.destroyed) return;
      if (this.layoutHolds && !this.layoutLate && !now) {
        this.layoutDirty = true;
        return;
      }
      this.layoutDirty = false;
      const previousFocus = this.focused;
      const previousIndex = this.indexOf(previousFocus);
      const previousElement = this.rendered.get(previousFocus);
      const ownedFocus = previousElement && previousElement.contains(document.activeElement);
      const rows = [];
      const filter = this.filter;
      if (filter) {
        this.keyMap.forEach((w) => { w._fm = undefined; });
      }
      const pending = [{ parent: this.root, filtered: !!filter, index: 0, pos: 0 }];
      while (pending.length) {
        const frame = pending[pending.length - 1];
        const children = frame.parent.children || [];
        if (frame.index < children.length) {
          const w = children[frame.index++];
          const state = frame.filtered ? this.matchState(w) : 2;
          if (!state) continue;
          const filterChildren = frame.filtered && state === 1;
          w.pos = ++frame.pos;
          rows.push(w);
          const autoOpen = filterChildren && this.filterExpand && !w.filterCollapsed && w.children && w.children.length;
          w._open = !!((w.expanded && (w.children || w.loading || w.error)) || autoOpen);
          if (w._open) pending.push({ parent: w, filtered: filterChildren, index: 0, pos: 0 });
        } else {
          const parent = frame.parent;
          parent.visibleCount = frame.pos;
          parent.childrenFiltered = frame.filtered;
          if (parent.loading) rows.push(this.statusRow(parent, "loading"));
          else if (parent.error) rows.push(this.statusRow(parent, "error"));
          else if (parent.next) rows.push(this.statusRow(parent, "more"));
          pending.pop();
        }
      }
      this.rows = rows;
      this.retop();
      this.grid.setAttribute("aria-rowcount", rows.some((row) => row.status) ? "-1" : String(rows.length + 1));
      if (this.focused && this.indexOf(this.focused) < 0 && this.focused !== this.focusHandoff) {
        let target = this.focused.parent;
        while (target && this.indexOf(target) < 0) target = target.parent;
        target = target || rows[Math.min(Math.max(0, previousIndex), rows.length - 1)];
        this.focused = null;
        if (target) this.setFocus(target, !!ownedFocus);
        else if (ownedFocus) {
          this.grid.tabIndex = 0;
          this.grid.focus({ preventScroll: true });
        }
      }
      this.grid.tabIndex = rows.length ? -1 : 0;
      this.scheduleRender();
    },

    holdLayout() {
      if (!this.layoutHolds) {
        this.layoutTimer = setTimeout(() => {
          this.layoutTimer = 0;
          this.layoutLate = true;
          this.flushLayout();
        }, LAYOUT_HOLD_MS);
      }
      this.layoutHolds = (this.layoutHolds || 0) + 1;
      let held = true;
      return () => {
        if (!held) return false;
        held = false;
        if (--this.layoutHolds) return false;
        clearTimeout(this.layoutTimer);
        this.layoutTimer = 0;
        this.layoutLate = false;
        return this.flushLayout();
      };
    },

    flushLayout() {
      if (!this.layoutDirty) return false;
      this.relayout(true);
      return true;
    },

    retop() {
      const rows = this.rows;
      const tops = new Array(rows.length + 1);
      let y = 0;
      for (let i = 0; i < rows.length; i++) {
        rows[i]._ri = i;
        tops[i] = y;
        y += rows[i].hpx;
      }
      tops[rows.length] = y;
      this.tops = tops;
      this.total = y;
      this.canvas.style.height = y + "px";
    },

    applySort(parent, deep) {
      const pending = [parent];
      while (pending.length) {
        const children = pending.pop().children;
        if (!children) continue;
        const state = this.sortState;
        const column = state && this.columns.find((c) => c.id === state.column);
        if (column) {
          const direction = state.direction === "desc" ? -1 : 1;
          const index = this.columns.indexOf(column);
          const keys = new Map();
          const keyOf = (w) => {
            let key = keys.get(w);
            if (!key) {
              key = sortKey(this.cellOf(w.h, column, index), column);
              keys.set(w, key);
            }
            return key;
          };
          children.sort((a, b) => compareKeys(keyOf(a), keyOf(b), direction) || a.idx - b.idx);
        } else {
          children.sort((a, b) => a.idx - b.idx);
        }
        if (deep) {
          for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
        }
      }
    }
  });
  function isIdentifier(value) {
    return typeof value === "string" && /^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])+$/.test(value);
  }

  function requireIdentifier(value, name) {
    if (!isIdentifier(value)) {
      throw new Error("CanopyX: " + name + " must be a nonempty, well-formed Unicode identifier");
    }
  }

  function validateNodes(nodes, existing, inlineOnly = false) {
    if (!Array.isArray(nodes)) throw new Error("CanopyX: page items must be an array.");
    const seen = new Set();
    const pending = nodes.slice();
    while (pending.length) {
      const node = pending.pop();
      requireIdentifier(node && node.id, "node ID");
      if (typeof node.label !== "string") throw new Error("CanopyX: node label must be a string.");
      if (Object.prototype.hasOwnProperty.call(node, "flags")) requireFlags(node.flags, "node flags");
      if (Object.prototype.hasOwnProperty.call(node, "data") && (!node.data || typeof node.data !== "object" || Array.isArray(node.data) ||
          Object.keys(node.data).some((name) => !name || name === "__proto__" || typeof node.data[name] !== "string"))) {
        throw new Error("CanopyX: node data must be an object of strings with nonempty names.");
      }
      if (existing.has(node.id) || seen.has(node.id)) throw new Error("CanopyX: duplicate node ID " + node.id);
      seen.add(node.id);
      if (node.ref != null) requireIdentifier(node.ref, "node reference");
      if (Object.prototype.hasOwnProperty.call(node, "children") && !Array.isArray(node.children)) {
        throw new Error("CanopyX: node children must be an array.");
      }
      if (inlineOnly && (node.ref != null || node.childCount != null && !Array.isArray(node.children) ||
          node.hasChildren === true && (!Array.isArray(node.children) || !node.children.length))) {
        throw new Error("CanopyX: inline views cannot declare lazy children.");
      }
      if (node.detail != null && (Object.prototype.hasOwnProperty.call(node, "children") ||
          node.hasChildren === true || node.ref != null || node.childCount != null)) {
        throw new Error("CanopyX: detail row must be a leaf.");
      }
      if (Object.prototype.hasOwnProperty.call(node, "childCount") &&
          (!validStructuralCount(node.childCount) || node.childCount < 1)) {
        throw new Error("CanopyX: node childCount must be a positive 32-bit integer.");
      }
      if (!Array.isArray(node.children) && (node.ref != null || node.childCount != null) && node.hasChildren !== true) {
        throw new Error("CanopyX: lazy node reference or childCount requires hasChildren true.");
      }
      if (Array.isArray(node.children)) {
        if (node.ref != null) throw new Error("CanopyX: inline children cannot have a load reference.");
        if (node.hasChildren === true && !node.children.length) throw new Error("CanopyX: expandable inline children cannot be empty.");
        if (node.hasChildren === false && node.children.length) throw new Error("CanopyX: inline children cannot declare a leaf.");
        if (node.childCount != null && node.childCount !== node.children.length) throw new Error("CanopyX: inline childCount must equal children length.");
        for (const child of node.children) pending.push(child);
      }
    }
  }

  function validatePage(page, existing, expectedOffset) {
    if (!page || !Array.isArray(page.items)) throw new Error("CanopyX: page items must be an array.");
    const items = page.items;
    if (Object.prototype.hasOwnProperty.call(page, "next") && page.next !== null) {
      requireIdentifier(page.next, "page continuation");
    }
    if (page.offset !== undefined && (!Number.isInteger(page.offset) || page.offset !== expectedOffset)) {
      throw new Error("CanopyX: page offset does not match the loaded child count.");
    }
    if (page.total != null && (!validStructuralCount(page.total) || page.total < expectedOffset + items.length)) {
      throw new Error("CanopyX: page total is smaller than its loaded range.");
    }
    if (page.total != null && (page.next != null) !== (expectedOffset + items.length < page.total)) {
      throw new Error("CanopyX: page continuation disagrees with its total.");
    }
    validateNodes(items, existing);
    return items;
  }

  Object.assign(TreeGrid.prototype, {
    build() {
      const host = this.host;
      host.classList.add("cx-host");
      if (!host.hasAttribute("data-cx-theme")) {
        host.setAttribute("data-cx-theme", "auto");
      }
      host.style.setProperty("--cx-row-h", this.rowH + "px");
      this.setTreeColumnPinned(this.view.pinTreeColumn);
      this.toolbar = h("div", "cx-toolbar");
      this.toolbar.hidden = true;
      const grid = this.grid = h("div", "cx-grid");
      grid.id = this.id;
      grid.setAttribute("role", "treegrid");
      grid.setAttribute("aria-label", this.view.label);
      if (this.multi) {
        grid.setAttribute("aria-multiselectable", "true");
      }
      this.head = h("div", "cx-head");
      this.head.setAttribute("role", "rowgroup");
      this.headRow = h("div", "cx-hrow");
      this.headRow.setAttribute("role", "row");
      this.headRow.setAttribute("aria-rowindex", "1");
      this.head.appendChild(this.headRow);
      this.canvas = h("div", "cx-canvas");
      this.canvas.setAttribute("role", "rowgroup");
      grid.appendChild(this.head);
      grid.appendChild(this.canvas);
      this.live = h("div", "cx-live cx-sr-only");
      this.live.setAttribute("aria-live", "polite");
      this.outline = h("div", "cx-outline");
      host.appendChild(this.toolbar);
      host.appendChild(grid);
      host.appendChild(this.live);
      host.appendChild(this.outline);
      this.buildHeader();
      this.onScroll = () => this.scheduleRender();
      this.onPrint = () => { this.outline.innerHTML = this.toOutline(); };
      grid.addEventListener("scroll", this.onScroll, { passive: true });
      grid.addEventListener("click", (e) => this.onClick(e));
      grid.addEventListener("dblclick", (e) => this.onDblClick(e));
      grid.addEventListener("keydown", (e) => this.onKey(e));
      this.canvas.addEventListener("focusin", (e) => {
        const rowEl = e.target.closest(".cx-row");
        if (rowEl && rowEl._w && this.focused !== rowEl._w) {
          this.focusRevision = (this.focusRevision || 0) + 1;
          this.focused = rowEl._w;
          this.scheduleRender();
        }
      });
      this.canvas.addEventListener("focusout", (e) => this.settleCell(e.relatedTarget));
      global.addEventListener("beforeprint", this.onPrint);
      this.onHash = (e) => {
        const href = global.location.href;
        const last = this.locationEvent;
        this.locationEvent = last && last.href === href && last.type !== e.type ? null : { href: href, type: e.type };
        if (this.locationEvent) this.readLocation();
      };
      global.addEventListener("hashchange", this.onHash);
      global.addEventListener("popstate", this.onHash);
      const viewWidth = () => { if (grid.clientWidth) host.style.setProperty("--cx-view-w", grid.clientWidth + "px"); };
      viewWidth();
      this.resizeObserver = new ResizeObserver(() => {
        viewWidth();
        this.scheduleRender();
      });
      this.resizeObserver.observe(grid);
    },

    visibleColumns() {
      return this.columns.filter((column) => !column.hidden);
    },

    buildHeader() {
      const active = document.activeElement;
      const focusedColumn = active && this.headRow.contains(active) ? active.closest(".cx-hcell").getAttribute("data-cx-column") : null;
      const focusedResize = active && active.classList.contains("cx-resize");
      const nextCols = this.visibleColumns();
      const layoutChanged = !this.cols || this.cols.length !== nextCols.length || nextCols.some((column, i) => column !== this.cols[i]);
      this.cols = nextCols;
      this.columnIndex = this.cols.map((column) => this.columns.indexOf(column));
      if (layoutChanged) {
        this.layout = (this.layout || 0) + 1;
        this.version++;
      }
      this.grid.setAttribute("aria-colcount", String(this.cols.length));
      this.headRow.textContent = "";
      this.headCells = this.cols.map((column, i) => {
        const cell = h("div", "cx-hcell cx-kind-" + (column.kind || "text"));
        cell.setAttribute("role", "columnheader");
        cell.setAttribute("aria-label", column.title);
        cell.setAttribute("data-cx-column", column.id);
        cell.setAttribute("aria-colindex", String(i + 1));
        if (column.sortable) {
          const sorted = this.sortState && this.sortState.column === column.id ? this.sortState.direction : null;
          cell.setAttribute("aria-sort", sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none");
          const button = h("button", "cx-sort");
          button.type = "button";
          setText(button, column.title);
          button.addEventListener("click", () => this.sort(column.id, sorted === "asc" ? "desc" : sorted === "desc" ? null : "asc"));
          cell.appendChild(button);
        } else {
          const title = h("span", "cx-htext");
          setText(title, column.title);
          cell.appendChild(title);
        }
        const grip = h("span", "cx-resize");
        grip.tabIndex = 0;
        grip.setAttribute("role", "separator");
        grip.setAttribute("aria-orientation", "vertical");
        grip.setAttribute("aria-valuemin", "40");
        grip.setAttribute("aria-valuemax", String(MAX_COLUMN_WIDTH));
        grip.addEventListener("keydown", (e) => {
          if (!["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          column.width = e.key === "Home" ? 40 : Math.min(MAX_COLUMN_WIDTH, Math.max(40, column.width + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 50 : 10)));
          this.applyWidths();
        });
        grip.addEventListener("pointerdown", (e) => this.startResize(e, column));
        cell.appendChild(grip);
        this.headRow.appendChild(cell);
        return cell;
      });
      this.applyWidths();
      if (focusedColumn) {
        const index = this.cols.findIndex((c) => c.id === focusedColumn);
        const button = index >= 0 ? this.headCells[index].querySelector(focusedResize ? ".cx-resize" : ".cx-sort") : null;
        if (button) {
          button.focus();
        }
      }
    },

    scheduleRender() {
      if (this.destroyed) return;
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = 0;
          this.render();
        });
      }
    },

    rowAt(y) {
      const tops = this.tops;
      let lo = 0;
      let hi = this.rows.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (tops[mid] <= y) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return Math.max(0, lo);
    },

    indexOf(w) {
      const i = w ? w._ri : undefined;
      return i !== undefined && this.rows[i] === w ? i : -1;
    },

    render() {
      let measured = false;
      for (let pass = 0; !this.destroyed; pass++) {
        this.renderPass();
        if (!this.measureDetails()) break;
        measured = true;
        if (pass === 3) {
          this.scheduleRender();
          break;
        }
      }
      return measured;
    },

    renderPass() {
      if (this.destroyed) {
        return;
      }
      const grid = this.grid;
      const held = this.heldCell();
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      const top = grid.scrollTop;
      const n = this.rows.length;
      const over = this.lean ? 0 : OVERSCAN;
      const first = n ? Math.max(0, this.rowAt(top) - over) : 0;
      const last = n ? Math.min(n - 1, this.rowAt(top + viewHeight) + over) : -1;
      const want = new Set();
      for (let i = first; i <= last; i++) {
        want.add(this.rows[i]);
      }
      const visibleFocus = this.indexOf(this.focused) >= 0 ? this.focused : null;
      if (visibleFocus) {
        want.add(visibleFocus);
      }
      const free = [];
      const active = document.activeElement;
      for (const [w, rowEl] of this.rendered) {
        if (!want.has(w)) {
          this.rendered.delete(w);
          if (rowEl.contains(active)) {
            rowEl.remove();
            rowEl._w = null;
            this.observeDetail(rowEl, false);
          } else {
            rowEl.remove();
            free.push(rowEl);
          }
        }
      }
      const tabRow = visibleFocus || this.rows[n ? this.rowAt(top) : 0] || null;
      const fragment = document.createDocumentFragment();
      for (const w of want) {
        const index = this.indexOf(w);
        if (index < 0) {
          continue;
        }
        let rowEl = this.rendered.get(w);
        if (!rowEl) {
          rowEl = free.pop() || this.pool.pop() || h("div");
          if (!rowEl.parentNode) {
            fragment.appendChild(rowEl);
          }
          this.rendered.set(w, rowEl);
          w._v = 0;
        }
        if (w._v !== this.version || rowEl._w !== w) {
          this.fillRow(rowEl, w);
          w._v = this.version;
        } else if (!w.status) this.refreshRowState(rowEl, w);
        const y = this.tops[index];
        if (rowEl._top !== y) {
          rowEl.style.transform = "translateY(" + y + "px)";
          rowEl._top = y;
        }
        if (rowEl._index !== index) {
          rowEl.setAttribute("aria-rowindex", String(index + 2));
          rowEl._index = index;
        }
        const alt = index % 2 === 1 && !w.status && !w.h.detail;
        if (rowEl._alt !== alt) {
          rowEl.classList.toggle("cx-alt", alt);
          rowEl._alt = alt;
        }
        const tab = w === tabRow ? 0 : -1;
        if (rowEl._tab !== tab) {
          rowEl.tabIndex = tab;
          rowEl._tab = tab;
        }
      }
      for (const rowEl of free) {
        rowEl.remove();
        rowEl._w = null;
        this.observeDetail(rowEl, false);
        if (this.pool.length < 200) {
          this.pool.push(rowEl);
        }
      }
      if (fragment.childNodes.length) {
        this.canvas.appendChild(fragment);
      }
      this.window = { first: first, last: last };
      this.keepDomOrder(first, last);
      if (held) this.restoreCell(held);
    }
  });

  Object.assign(TreeGrid.prototype, {
    applyWidths() {
      let sum = 0;
      this.cols.forEach((column, i) => {
        this.headCells[i].style.width = column.width + "px";
        const grip = this.headCells[i].querySelector(".cx-resize");
        grip.setAttribute("aria-label", fill(this.labels.resizeColumn, { column: column.title }));
        grip.setAttribute("aria-valuenow", String(column.width));
        grip.setAttribute("aria-valuetext", fill(this.labels.columnWidth, { width: numberFormat(this.lang).format(column.width) }));
        sum += column.width;
      });
      this.rowWidth = sum;
      this.headRow.style.width = sum + "px";
      this.canvas.style.width = sum + "px";
      const resizeRow = (row) => {
        row.style.width = sum + "px";
        if (!row._kind || !row.firstElementChild) return;
        if (row._kind !== "node") row.firstElementChild.style.width = sum + "px";
        else this.cols.forEach((column, i) => { if (row.children[i]) row.children[i].style.width = column.width + "px"; });
      };
      this.rendered.forEach(resizeRow);
      this.pool.forEach(resizeRow);
    },

    setColumnWidth(columnId, width) {
      const column = this.columns.find((c) => c.id === columnId);
      if (!column || !Number.isFinite(width)) {
        throw new Error("CanopyX: setColumnWidth needs a column of the view and a width in pixels.");
      }
      if (this.cancelResize) this.cancelResize();
      column.width = Math.min(MAX_COLUMN_WIDTH, Math.max(40, Math.round(width)));
      this.applyWidths();
    },

    setTreeColumnPinned(pinned) {
      this.host.classList.toggle("cx-pin-tree", !!pinned);
    },

    startResize(e, column) {
      if (this.destroyed || e.button !== 0) return;
      if (this.cancelResize) this.cancelResize();
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = column.width;
      const pointer = e.pointerId;
      const move = (ev) => {
        if (ev.pointerId !== pointer) return;
        column.width = Math.min(MAX_COLUMN_WIDTH, Math.max(40, w0 + ev.clientX - x0));
        this.applyWidths();
      };
      const stop = () => {
        global.removeEventListener("pointermove", move);
        global.removeEventListener("pointerup", end);
        global.removeEventListener("pointercancel", end);
        global.removeEventListener("blur", stop);
        if (this.cancelResize === stop) this.cancelResize = null;
      };
      const end = (ev) => { if (ev.pointerId === pointer) stop(); };
      this.cancelResize = stop;
      global.addEventListener("pointermove", move);
      global.addEventListener("pointerup", end);
      global.addEventListener("pointercancel", end);
      global.addEventListener("blur", stop);
    }
  });

  Object.assign(TreeGrid.prototype, {
    keepDomOrder(first, last) {
      const ordered = [];
      const focusedIndex = this.focused ? this.indexOf(this.focused) : -1;
      const focusedEl = focusedIndex >= 0 ? this.rendered.get(this.focused) : null;
      if (focusedEl && focusedIndex < first) {
        ordered.push(focusedEl);
      }
      for (let i = first; i <= last; i++) {
        const rowEl = this.rendered.get(this.rows[i]);
        if (rowEl) {
          ordered.push(rowEl);
        }
      }
      if (focusedEl && focusedIndex > last) {
        ordered.push(focusedEl);
      }
      const kids = Array.prototype.slice.call(this.canvas.children);
      const n = ordered.length;
      let inOrder = kids.length === n;
      for (let k = 0; inOrder && k < n; k++) {
        inOrder = kids[k] === ordered[k];
      }
      if (inOrder) {
        return;
      }
      if (kids.length === n && !focusedEl) {
        const shift = kids.indexOf(ordered[0]);
        let rotation = shift > 0;
        for (let k = 0; rotation && k < n; k++) {
          rotation = kids[(shift + k) % n] === ordered[k];
        }
        if (rotation) {
          if (shift <= n - shift) {
            for (let k = 0; k < shift; k++) {
              this.canvas.appendChild(kids[k]);
            }
          } else {
            for (let k = n - 1; k >= shift; k--) {
              this.canvas.insertBefore(kids[k], this.canvas.firstChild);
            }
          }
          return;
        }
      }
      const p = focusedEl ? ordered.indexOf(focusedEl) : -1;
      if (p < 0) {
        let node = this.canvas.firstChild;
        for (const rowEl of ordered) {
          if (node === rowEl) {
            node = node.nextSibling;
          } else {
            this.canvas.insertBefore(rowEl, node);
          }
        }
        return;
      }
      let ref = focusedEl;
      for (let k = p - 1; k >= 0; k--) {
        if (ordered[k].nextSibling !== ref) {
          this.canvas.insertBefore(ordered[k], ref);
        }
        ref = ordered[k];
      }
      let prev = focusedEl;
      for (let k = p + 1; k < ordered.length; k++) {
        if (prev.nextSibling !== ordered[k]) {
          this.canvas.insertBefore(ordered[k], prev.nextSibling);
        }
        prev = ordered[k];
      }
    }
  });

  function setAttr(element, name, value) {
    const cache = element._attrs || (element._attrs = {});
    if (cache[name] === value) {
      return;
    }
    cache[name] = value;
    if (value === null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }

  function setClass(element, value) {
    if (element._cls !== value) {
      element.className = value;
      element._cls = value;
      element._alt = false;
    }
  }

  Object.assign(TreeGrid.prototype, {
    fillRow(rowEl, w) {
      rowEl._w = w;
      const kind = w.status ? "status" : w.h.detail ? "detail" : "node";
      if (rowEl._kind !== kind || rowEl._layout !== this.layout) {
        this.buildRow(rowEl, kind);
      }
      setAttr(rowEl, "aria-level", String(w.level));
      const auto = kind === "detail" && w.auto;
      this.observeDetail(rowEl, auto);
      const height = auto ? "auto" : w.hpx + "px";
      if (rowEl._height !== height) {
        rowEl.style.height = height;
        rowEl._height = height;
      }
      if (kind === "status") {
        this.paintStatusRow(rowEl, w);
      } else if (kind === "detail") {
        this.paintDetailRow(rowEl, w);
      } else {
        this.paintNodeRow(rowEl, w);
      }
    },

    buildRow(rowEl, kind) {
      rowEl.textContent = "";
      ["aria-expanded", "aria-busy", "aria-setsize", "aria-posinset", "aria-selected", "data-cx-id", "data-cx-status", "data-kind"].forEach((name) => rowEl.removeAttribute(name));
      rowEl._attrs = {};
      rowEl._cls = null;
      rowEl._kind = kind;
      rowEl._layout = this.layout;
      rowEl._height = null;
      rowEl.setAttribute("role", "row");
      rowEl.style.width = this.rowWidth + "px";
      if (kind !== "node") {
        const cell = this.cell(rowEl, 0, this.rowWidth);
        cell.setAttribute("aria-colspan", String(this.cols.length));
        rowEl._cells = [{ cell: cell }];
        if (kind === "status") {
          const indent = cell.appendChild(h("span", "cx-indent"));
          const label = cell.appendChild(h("span"));
          rowEl._cells[0].indent = indent;
          rowEl._cells[0].label = label;
          rowEl._cells[0].text = label.appendChild(document.createTextNode(""));
        }
        return;
      }
      rowEl._cells = this.cols.map((column, i) => {
        const cell = this.cell(rowEl, i, column.width, column.kind);
        const slot = { cell: cell, base: cell.className + (i === 0 ? " cx-tree" : ""), cls: null, title: null, badges: [], iconKey: null, iconEl: null, mode: "default" };
        cell.className = slot.base;
        if (i === 0) {
          slot.indent = cell.appendChild(h("span", "cx-indent"));
          slot.exp = cell.appendChild(h("span", "cx-exp"));
          slot.exp.setAttribute("aria-hidden", "true");
          slot.content = cell.appendChild(h("span", "cx-content"));
        } else {
          slot.content = cell;
        }
        slot.textSpan = slot.content.appendChild(h("span", "cx-text"));
        slot.text = slot.textSpan.appendChild(document.createTextNode(""));
        return slot;
      });
    },

    paintStatusRow(rowEl, w) {
      setClass(rowEl, "cx-row cx-status cx-" + w.status);
      setAttr(rowEl, "data-cx-status", w.status);
      const slot = rowEl._cells[0];
      slot.label.className = w.status === "more" ? "cx-more-btn" : "cx-status-text";
      slot.indent.style.width = (w.level - 1) * INDENT + "px";
      if (slot.text.data !== w.h.label) {
        slot.text.data = w.h.label;
      }
    },

    paintDetailRow(rowEl, w) {
      const node = w.h;
      setClass(rowEl, "cx-row cx-detail" + (w.auto ? " cx-detail-auto" : "") + (node.group ? " cx-group" : "") + (node.className ? " " + node.className : ""));
      this.paintRowState(rowEl, w);
      const old = rowEl._cells[0].cell;
      const cell = this.cell(rowEl, 0, this.rowWidth);
      rowEl.replaceChild(cell, old);
      rowEl._cells[0].cell = cell;
      cell.setAttribute("aria-colspan", String(this.cols.length));
      const left = (w.level - 1) * INDENT + 8 + "px";
      cell.style.paddingLeft = left;
      cell.style.setProperty("--cx-detail-left", left);
      this.renderDetail(node, cell);
      quietControls(cell);
      if (w.auto) this.measureNeeded = true;
    },

    paintNodeRow(rowEl, w) {
      const node = w.h;
      setClass(rowEl, "cx-row" + (node.group ? " cx-group" : "") + (node.className ? " " + node.className : ""));
      this.paintRowState(rowEl, w);
      setAttr(rowEl, "aria-expanded", this.expandable(w) ? (w._open ? "true" : "false") : null);
      setAttr(rowEl, "aria-busy", w.loading ? "true" : null);
      const slots = rowEl._cells;
      for (let i = 0; i < this.cols.length; i++) {
        const slot = slots[i];
        if (i === 0) {
          this.paintTreeSlot(slot, w);
        }
        this.paintSlot(slot, node, this.cols[i], this.columnIndex[i], w);
      }
    },

    paintRowState(rowEl, w) {
      const node = w.h;
      setAttr(rowEl, "data-cx-id", node.id);
      setAttr(rowEl, "data-kind", node.kind || null);
      setAttr(rowEl, "data-cx-status", null);
      setAttr(rowEl, "aria-selected", this.selected.has(w) ? "true" : "false");
      this.setPosition(rowEl, w);
    },

    refreshRowState(rowEl, w) {
      setAttr(rowEl, "aria-expanded", this.expandable(w) ? (w._open ? "true" : "false") : null);
      setAttr(rowEl, "aria-busy", w.loading ? "true" : null);
      this.setPosition(rowEl, w);
      if (rowEl._kind === "node") this.paintTreeSlot(rowEl._cells[0], w);
    },

    setPosition(rowEl, w) {
      const parent = w.parent;
      const loaded = parent.children ? parent.children.length : 0;
      const size = parent.childrenFiltered ? (parent.next ? -1 : parent.visibleCount) : parent.total != null ? Math.max(parent.total, loaded) : parent.next ? -1 : loaded;
      setAttr(rowEl, "aria-setsize", String(size));
      setAttr(rowEl, "aria-posinset", String(w.pos));
    },

    paintTreeSlot(slot, w) {
      const level = w.level;
      if (slot.level !== level) {
        slot.indent.style.width = (level - 1) * INDENT + "px";
        slot.level = level;
      }
      const expander = this.expandable(w) ? "cx-exp" : "cx-exp cx-leaf";
      if (slot.expCls !== expander) {
        slot.exp.className = expander;
        slot.expCls = expander;
      }
      const key = w.h.icon && this.iconTemplates.has(w.h.icon) ? w.h.icon : null;
      if (slot.iconKey !== key) {
        if (slot.iconEl) {
          slot.iconEl.remove();
        }
        slot.iconEl = key ? this.iconTemplates.get(key).cloneNode(true) : null;
        if (slot.iconEl) {
          slot.cell.insertBefore(slot.iconEl, slot.content);
        }
        slot.iconKey = key;
      }
    },

    paintSlot(slot, node, column, index, w) {
      const value = this.cellOf(node, column, index);
      const hosted = column.render ? this.paintHostSlot(slot, node, column, index, w) : null;
      if (hosted === "host") {
        return;
      }
      const decorated = hosted === "decorated";
      const text = cellText(value, column, this.fmt);
      if (slot.text.data !== text) {
        slot.text.data = text;
      }
      const object = isCellObject(value);
      const tone = object ? toneOf(value.tone) : NO_TONE;
      const cls = slot.base + tone.cls;
      if (slot.cls !== cls) {
        if (decorated) {
          if (tone.cls) slot.cell.className += tone.cls;
        } else {
          slot.cell.className = cls;
        }
        slot.cls = cls;
      }
      toneColors(slot.cell, tone);
      const title = object && value.title ? value.title : decorated ? null : otherZone(value, column, this.fmt);
      if (slot.title !== title) {
        if (title) {
          slot.cell.title = title;
        } else {
          slot.cell.removeAttribute("title");
        }
        slot.title = title;
      }
      this.paintBadges(slot, (index === 0 && node.badges) || null, object && value.badges ? value.badges : null);
    },

    paintBadges(slot, first, second) {
      const count = (first ? first.length : 0) + (second ? second.length : 0);
      for (let k = 0; k < count; k++) {
        const badge = first && k < first.length ? first[k] : second[k - (first ? first.length : 0)];
        let span = slot.badges[k];
        if (!span) {
          span = slot.content.appendChild(h("span"));
          span._text = span.appendChild(document.createTextNode(""));
          slot.badges.push(span);
        }
        const tone = toneOf(badge.tone || "neutral");
        if (span._cls !== tone.cls) {
          applyTone(span, "cx-badge", tone);
          span._cls = tone.cls;
        }
        if (span._text.data !== badge.text) {
          span._text.data = badge.text;
        }
        const title = badge.title || null;
        if (span._title !== title) {
          if (title) {
            span.title = title;
          } else {
            span.removeAttribute("title");
          }
          span._title = title;
        }
      }
      while (slot.badges.length > count) {
        slot.badges.pop().remove();
      }
    },

    setTimeZone(zone) {
      if (zone !== "local" && zone !== "utc") {
        throw new Error("CanopyX: the time zone is 'local' or 'utc'.");
      }
      if (this.local === (zone === "local")) {
        return;
      }
      this.local = zone === "local";
      this.fmt = formatting(this.lang, this.local, this.labels);
      this.version++;
      this.scheduleRender();
    },

    cell(rowEl, index, width, kind) {
      const cell = this.newCell(index, width, kind);
      rowEl.appendChild(cell);
      return cell;
    },

    newCell(index, width, kind) {
      const cell = h("div", "cx-cell" + (kind ? " cx-kind-" + kind : ""));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(index + 1));
      cell.style.width = width + "px";
      return cell;
    }
  });


  function badgeElement(badge) {
    const span = h("span");
    applyTone(span, "cx-badge", toneOf(badge.tone || "neutral"));
    setText(span, badge.text);
    if (badge.title) span.title = badge.title;
    return span;
  }

  function hostBadge(badge) {
    if (!badge || typeof badge !== "object" || typeof badge.text !== "string" ||
        (badge.tone != null && typeof badge.tone !== "string") || (badge.title != null && typeof badge.title !== "string")) {
      throw new Error("CanopyX: badge needs { text, tone?, title? } with string values.");
    }
    return badgeElement(badge);
  }

  function attributeShape(element) {
    let shape = "";
    for (const attribute of element.attributes) {
      shape += attribute.name + "=" + attribute.value + "\n";
    }
    return shape;
  }

  Object.assign(TreeGrid.prototype, {
    paintHostSlot(slot, node, column, index, w) {
      const tree = slot.content !== slot.cell;
      const previous = slot.content;
      const fresh = tree ? h("span", "cx-content") : this.newCell(this.cols.indexOf(column), column.width, column.kind);
      const shape = attributeShape(fresh);
      previous.replaceWith(fresh);
      this.setSlotContent(slot, fresh, tree);
      let drawn;
      try {
        drawn = column.render(node, fresh, { column: column.id, level: w.level, expanded: w.expanded, index: index }) === true;
      } catch (e) {
        if (fresh.parentNode) fresh.replaceWith(previous);
        this.setSlotContent(slot, previous, tree);
        throw e;
      }
      const untouched = !drawn && !fresh.firstChild && attributeShape(fresh) === shape;
      if (untouched && slot.mode === "default") {
        fresh.replaceWith(previous);
        this.setSlotContent(slot, previous, tree);
        return "default";
      }
      if (tree) {
        slot.cell.className = slot.base;
        slot.cell.removeAttribute("title");
        toneColors(slot.cell, NO_TONE);
      }
      slot.cls = slot.base;
      slot.title = null;
      slot.badges = [];
      slot.mode = drawn ? "host" : untouched ? "default" : "decorated";
      if (!untouched) {
        quietControls(fresh);
      }
      if (!drawn) {
        fresh.appendChild(slot.textSpan);
      }
      return slot.mode;
    },

    setSlotContent(slot, element, tree) {
      slot.content = element;
      if (!tree) {
        slot.cell = element;
      }
    }
  });

  const detailColumn = { kind: "text" };
  const DETAIL_ESTIMATE_SLOTS = 16;

  function detailCell(tag, cell, fmt) {
    const element = h(tag);
    setText(element, cellText(cell, detailColumn, fmt));
    if (isCellObject(cell)) {
      if (cell.tone) {
        applyTone(element, "", toneOf(cell.tone));
      }
      if (cell.title) {
        element.title = cell.title;
      }
      (cell.badges || []).forEach((badge) => element.appendChild(badgeElement(badge)));
    }
    return element;
  }

  Object.assign(TreeGrid.prototype, {
    renderDetail(node, element, plainHtml = false) {
      const body = element.appendChild(h("div", "cx-detail-body"));
      if (!plainHtml) body.setAttribute("tabindex", "-1");
      if (this.opts.renderDetail && this.opts.renderDetail(node, body) === true) {
        return;
      }
      const detail = node.detail;
      if (detail.type === "table") {
        const table = h("table", "cx-detail-table");
        if (detail.caption) {
          const caption = h("caption");
          setText(caption, detail.caption);
          table.appendChild(caption);
        }
        const columns = detail.columns || [];
        const widths = Array.isArray(detail.widths) && detail.widths.length === columns.length ? detail.widths : null;
        if (widths) {
          const total = widths.reduce((sum, share) => sum + share, 0);
          const group = table.appendChild(h("colgroup"));
          widths.forEach((share) => { group.appendChild(h("col")).style.width = (share / total * 100) + "%"; });
        }
        const head = h("thead");
        const headRow = h("tr");
        columns.forEach((title) => {
          const th = h("th");
          th.scope = "col";
          setText(th, title);
          headRow.appendChild(th);
        });
        head.appendChild(headRow);
        table.appendChild(head);
        const tbody = h("tbody");
        (detail.rows || []).forEach((row) => {
          const tr = h("tr");
          row.forEach((cell) => tr.appendChild(detailCell("td", cell, this.fmt)));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);
      } else if (detail.type === "properties") {
        const list = h("dl", "cx-props");
        (detail.items || []).forEach((item) => {
          const term = h("dt");
          setText(term, item.name);
          list.appendChild(term);
          list.appendChild(detailCell("dd", item.value, this.fmt));
        });
        body.appendChild(list);
      } else if (detail.type === "html") {
        if (plainHtml) setText(body, detail.html || "");
        else body.innerHTML = detail.html; // trusted host markup, see docs/data-protocol.md
      }
    },

    detailHeight(detail) {
      if (detail.height > 0) {
        return detail.height * this.rowH;
      }
      const slots = detail.type === "table" ? (detail.rows || []).length + (detail.caption ? 2 : 1) : detail.type === "properties" ? (detail.items || []).length : 6;
      return Math.max(1, Math.min(DETAIL_ESTIMATE_SLOTS, slots)) * this.rowH;
    },

    observeDetail(rowEl, auto) {
      if (!!rowEl._auto === auto) {
        return;
      }
      rowEl._auto = auto;
      if (!this.detailObserver) {
        this.detailObserver = new ResizeObserver(() => {
          this.measureNeeded = true;
          this.scheduleRender();
        });
      }
      if (auto) {
        this.detailObserver.observe(rowEl);
        this.measureNeeded = true;
      } else {
        this.detailObserver.unobserve(rowEl);
      }
    },

    measureDetails() {
      if (!this.measureNeeded) {
        return false;
      }
      this.measureNeeded = false;
      const top = this.grid.scrollTop;
      let shift = 0;
      let changed = false;
      for (const [w, rowEl] of this.rendered) {
        if (!w.auto || rowEl._kind !== "detail") continue;
        const measured = rowEl.offsetHeight;
        const height = Math.max(this.rowH, measured);
        if (measured && height !== w.hpx) {
          if (this.tops[this.indexOf(w)] + w.hpx <= top) shift += height - w.hpx;
          w.hpx = height;
          changed = true;
        }
      }
      if (changed) {
        this.retop();
        if (shift) this.grid.scrollTop = top + shift;
      }
      return changed;
    }
  });

  function hostControl(target) {
    const row = target.closest(".cx-row");
    const control = target.closest("input,textarea,select,button,a,summary,[tabindex],[contenteditable]:not([contenteditable=false]),[role=button],[role=checkbox],[role=radio],[role=link],[role=textbox],[role=combobox],[role=menuitem],[role=separator]");
    return control && row && row !== control && row.contains(control) && !control.matches(".cx-cell,.cx-detail-body") ? control : null;
  }
  Object.assign(TreeGrid.prototype, {
    onKey(e) {
      if (e.defaultPrevented || e.isComposing) return;
      if (this.head.contains(e.target)) {
        return;
      }
      const rowEl = e.target.closest(".cx-row");
      if (rowEl && rowEl !== e.target && e.key === "Tab" && e.shiftKey && !e.defaultPrevented) {
        this.skipRowTabStop(rowEl);
        return;
      }
      if (rowEl && rowEl !== e.target && this.onCellKey(e)) {
        return;
      }
      const w = this.focused || this.rows[0];
      if (!w) {
        return;
      }
      const i = this.indexOf(w);
      const pageHeight = Math.max(this.rowH, this.grid.clientHeight - this.head.offsetHeight - this.rowH);
      const last = this.rows.length - 1;
      const key = e.key === " " && this.typeBuf && performance.now() - this.typeAt <= TYPEAHEAD_MS ? "typeahead" : e.key;
      let target = null;
      let handled = true;
      switch (key) {
        case "ArrowDown": target = this.rows[Math.min(last, i + 1)]; break;
        case "ArrowUp": target = this.rows[Math.max(0, i - 1)]; break;
        case "PageDown": target = this.rows[Math.min(last, Math.max(i + 1, this.rowAt(this.tops[i] + pageHeight)))]; break;
        case "PageUp": target = this.rows[Math.max(0, Math.min(i - 1, this.rowAt(this.tops[i] - pageHeight)))]; break;
        case "Home": target = this.rows[0]; break;
        case "End": target = this.rows[last]; break;
        case "ArrowRight":
          if (!w.status && this.expandable(w) && !w._open) {
            this.toggle(w, true);
          } else if (!w.status && this.expandable(w) && this.rows[i + 1] && this.rows[i + 1].parent === w) {
            target = this.rows[i + 1];
          } else if (!w.status) {
            this.enterCells(w);
          }
          break;
        case "F2":
          if (!w.status) this.enterCells(w);
          break;
        case "ArrowLeft":
          if (!w.status && w._open) {
            this.toggle(w, false);
          } else if (w.parent && w.parent !== this.root) {
            target = w.parent;
          }
          break;
        case "Enter":
        case " ":
          try { this.activate(w, key === "Enter"); }
          finally { e.preventDefault(); e.stopPropagation(); }
          return;
        default:
          handled = this.typeAhead(e, i);
      }
      if (target) {
        this.setFocus(target);
        if (!target.status && this.multi && e.shiftKey && /^(Arrow(Up|Down)|Page(Up|Down)|Home|End)$/.test(key)) {
          this.selectRange(target);
        }
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },

    activate(w, enter) {
      if (w.status === "more") {
        this.loadMore(w.parent);
      } else if (w.status === "error") {
        this.retryPage(w);
      } else if (!w.status) {
        let accepted, revision;
        const deferred = enter && this.expandable(w);
        try {
          accepted = this.multi && !enter ? this.select(w, { toggle: true }) :
            this.select(w, { deferNotify: deferred });
          revision = this.selectionRevision;
        } finally {
          if (enter && this.expandable(w)) this.toggle(w);
        }
        if (accepted && deferred && revision === this.selectionRevision)
          this.notifySelection(w, Array.from(this.selected).map((selected) => selected.h), revision);
      }
    },

    async retryPage(status) {
      const parent = status.parent;
      await this.loadStatusPage(parent, status, parent.next || null);
    },

    typeAhead(e, i) {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) {
        return false;
      }
      const now = performance.now();
      const letter = e.key.toLowerCase();
      this.typeBuf = now - this.typeAt > TYPEAHEAD_MS ? letter : this.typeBuf + letter;
      this.typeAt = now;
      const n = this.rows.length;
      const start = this.typeBuf.length === 1 ? i + 1 : i;
      for (let k = 0; k < n; k++) {
        const w = this.rows[(start + k) % n];
        if (!w.status && String(w.h.label).toLowerCase().startsWith(this.typeBuf)) {
          this.setFocus(w);
          break;
        }
      }
      return true;
    },

    announce(message) {
      setText(this.live, message);
    }
  });

  const CELL_CONTROLS = "a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]:not([contenteditable=false])," +
    "[role=button],[role=checkbox],[role=radio],[role=link],[role=switch],[role=tab],[role=menuitem],[role=textbox],[role=combobox]";
  const OWN_ARROWS = ".cx-detail-body,textarea,select,[contenteditable]:not([contenteditable=false]),[aria-activedescendant]," +
    "[role=textbox],[role=combobox],[role=spinbutton],[role=slider],[role=radio],[role=tab],[role=menuitem],[role=listbox],[role=tree],[role=grid]," +
    "input:not([type=button]):not([type=checkbox]):not([type=submit]):not([type=reset]):not([type=image]):not([type=file]):not([type=color])";

  function reachable(control) {
    return !control.matches(":disabled") && !control.closest("[inert],[aria-hidden=true]") &&
      (control.checkVisibility ? control.checkVisibility({ visibilityProperty: true }) : control.getClientRects().length > 0);
  }

  function cellControls(cell) {
    const controls = Array.prototype.filter.call(cell.querySelectorAll(CELL_CONTROLS), (control) =>
      !control.classList.contains("cx-detail-body") && reachable(control));
    const body = cell.querySelector(":scope > .cx-detail-body");
    if (body && (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1)) controls.push(body);
    return controls;
  }

  function quietControls(cell) {
    cell.querySelectorAll(CELL_CONTROLS).forEach((control) => {
      if (control.tabIndex >= 0) control.tabIndex = -1;
    });
  }

  Object.assign(TreeGrid.prototype, {
    rowCells(rowEl) {
      return rowEl && rowEl._cells && rowEl._kind !== "status" ? rowEl._cells.map((slot) => slot.cell) : [];
    },

    enterCells(w) {
      const cells = this.rowCells(this.rendered.get(w));
      const index = cells.findIndex((cell) => cellControls(cell).length > 0);
      if (index < 0) return false;
      this.focusCell(w, index, 0);
      return true;
    },

    focusCell(w, index, control, enter) {
      this.setFocus(w, false);
      const cells = this.rowCells(this.rendered.get(w));
      if (!cells.length) {
        this.setFocus(w, true);
        return;
      }
      const cell = cells[Math.max(0, Math.min(cells.length - 1, index))];
      const controls = cellControls(cell);
      let target = cell;
      if (typeof control === "number" && controls.length) target = controls[control < 0 ? controls.length - 1 : Math.min(control, controls.length - 1)];
      else if (control === undefined && controls.length === 1) target = controls[0];
      let parked = -1;
      if (target !== cell && !enter && !target.classList.contains("cx-detail-body") && target.matches(OWN_ARROWS)) {
        parked = controls.indexOf(target);
        target = cell;
      }
      cell._cxAt = parked;
      if (target === cell) cell.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      this.revealInRow(cell, target, cells[0]);
    },

    revealInRow(cell, target, treeCell) {
      const grid = this.grid;
      if (cell.parentNode && cell.parentNode._kind === "node") {
        this.revealInCell(cell, target);
        const pinned = cell !== treeCell && this.host.classList.contains("cx-pin-tree") ? treeCell.offsetWidth : 0;
        const left = grid.getBoundingClientRect().left + grid.clientLeft;
        const box = cell.getBoundingClientRect();
        if (box.left < left + pinned) grid.scrollLeft -= left + pinned - box.left;
        else if (box.right > left + grid.clientWidth) grid.scrollLeft += Math.min(box.right - left - grid.clientWidth, box.left - left - pinned);
      }
      const body = target.closest(".cx-detail-body");
      if (body && body !== target) {
        const outer = body.getBoundingClientRect();
        const inner = target.getBoundingClientRect();
        if (inner.top < outer.top) body.scrollTop -= outer.top - inner.top;
        else if (inner.bottom > outer.bottom) body.scrollTop += Math.min(inner.bottom - outer.bottom, inner.top - outer.top);
      }
      const frame = grid.getBoundingClientRect();
      const top = frame.top + grid.clientTop + this.head.offsetHeight;
      const bottom = frame.top + grid.clientTop + grid.clientHeight;
      const box = target.getBoundingClientRect();
      if (box.top < top) grid.scrollTop -= top - box.top;
      else if (box.bottom > bottom) grid.scrollTop += Math.min(box.bottom - bottom, box.top - top);
    },

    revealInCell(cell, target) {
      if (target === cell || !cell.contains(target) || !cell.parentNode || cell.parentNode._kind !== "node") return;
      const outer = cell.getBoundingClientRect();
      const inner = target.getBoundingClientRect();
      const start = outer.left + cell.clientLeft;
      const end = start + cell.clientWidth;
      if (inner.left < start) cell.scrollLeft -= start - inner.left;
      else if (inner.right > end) cell.scrollLeft += Math.min(inner.right - end, inner.left - start);
      if (cell.scrollLeft) this.scrolledCell = cell;
    },

    settleCell(next) {
      const cell = this.scrolledCell;
      if (cell && !cell.contains(next || document.activeElement)) {
        cell.scrollLeft = 0;
        this.scrolledCell = null;
      }
    },

    skipRowTabStop(rowEl) {
      if (rowEl.tabIndex < 0) return;
      rowEl.tabIndex = -1;
      setTimeout(() => {
        if (!this.destroyed && rowEl._tab === 0) rowEl.tabIndex = 0;
      }, 0);
    },

    heldCell() {
      const active = document.activeElement;
      const rowEl = active && active.closest ? active.closest(".cx-row") : null;
      if (!rowEl || rowEl === active || !rowEl._w || !this.canvas.contains(rowEl)) return null;
      const cells = this.rowCells(rowEl);
      const index = cells.findIndex((cell) => cell.contains(active));
      if (index < 0) return null;
      return { w: rowEl._w, index: index, control: active === cells[index] ? -1 : Array.prototype.indexOf.call(cells[index].querySelectorAll(CELL_CONTROLS), active) };
    },

    restoreCell(held) {
      const active = document.activeElement;
      if (!held || this.destroyed || (active && active !== document.body) || !this.rendered.has(held.w)) return;
      const cell = this.rowCells(this.rendered.get(held.w))[held.index];
      if (!cell) return;
      const candidate = held.control >= 0 ? cell.querySelectorAll(CELL_CONTROLS)[held.control] : null;
      const target = candidate && reachable(candidate) ? candidate : cell;
      if (target === cell) cell.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      this.revealInCell(cell, target);
    },

    onCellKey(e) {
      const rowEl = e.target.closest(".cx-row");
      const w = rowEl && rowEl._w;
      const cells = this.rowCells(rowEl);
      const index = cells.findIndex((cell) => cell.contains(e.target));
      if (!w || w.status || index < 0 || e.isComposing || e.defaultPrevented) return index >= 0;
      const cell = cells[index];
      const control = e.target !== cell ? e.target : null;
      if (control && control.matches(OWN_ARROWS)) {
        if (e.key !== "Escape") return true;
        const from = cellControls(cell).indexOf(control);
        this.focusCell(w, index, null);
        cell._cxAt = from;
        e.preventDefault();
        e.stopPropagation();
        return true;
      }
      const controls = cellControls(cell);
      const at = control ? controls.indexOf(control) : cell._cxAt >= 0 && cell._cxAt < controls.length ? cell._cxAt : -1;
      const detail = rowEl._kind === "detail";
      switch (e.key) {
        case "ArrowRight":
          if (at >= 0 && at < controls.length - 1) this.focusCell(w, index, at + 1);
          else if (!detail && index < cells.length - 1) this.focusCell(w, index + 1, 0);
          break;
        case "ArrowLeft":
          if (at > 0) this.focusCell(w, index, at - 1);
          else if (!detail && index > 0) this.focusCell(w, index - 1, -1);
          else this.setFocus(w, true);
          break;
        case "Home":
          this.focusCell(w, 0, 0);
          break;
        case "End":
          this.focusCell(w, cells.length - 1, -1);
          break;
        case "ArrowUp":
        case "ArrowDown": {
          const next = this.rows[this.indexOf(w) + (e.key === "ArrowUp" ? -1 : 1)];
          if (!next) break;
          if (!detail && !next.status && !next.h.detail) this.focusCell(next, index);
          else this.setFocus(next, true);
          break;
        }
        case "Escape":
        case "F2":
          this.setFocus(w, true);
          break;
        case "Enter":
        case " ":
          if (control) return true;
          if (e.key === "Enter" && controls.length) this.focusCell(w, index, Math.max(0, at), true);
          else this.activate(w, e.key === "Enter");
          break;
        default:
          return !!control;
      }
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  });
  Object.assign(TreeGrid.prototype, {
    async loadStatusPage(parent, status, cursor) {
      const previous = new Set(parent.children || []);
      const element = document.activeElement;
      const revision = this.focusRevision || 0;
      const owned = this.focused === status && element && element._w === status;
      if (owned) this.focusHandoff = status;
      try { await this.loadPage(parent, cursor); }
      finally {
        if (this.focusHandoff === status) this.focusHandoff = null;
        if (!this.destroyed) {
          if (owned) this.flushLayout();
          if (owned && (this.focusRevision || 0) === revision &&
              (document.activeElement === element || document.activeElement === document.body)) {
            let target = parent.error ? this.statusRow(parent, "error") :
              (parent.children || []).find((child) => !previous.has(child)) ||
              (parent.next ? this.statusRow(parent, "more") : parent !== this.root ? parent : this.rows[0]);
            while (target && this.indexOf(target) < 0) target = target.parent;
            target = target || this.rows[0];
            if (target) this.setFocus(target, true);
            else {
              this.focused = null;
              this.grid.tabIndex = 0;
              this.render();
              this.grid.focus({ preventScroll: true });
            }
          }
          this.relayout();
        }
      }
    }
  });

  Object.assign(TreeGrid.prototype, {
    async toggle(w, expand, automatic = false) {
      if (this.destroyed || !w || w._invalidated || w.status || !this.expandable(w)) {
        return;
      }
      if ((this.restoring || this.initializing || this.replayingToggles) && !automatic) {
        const pending = this.pendingRestorationToggles || (this.pendingRestorationToggles = new Map());
        const last = pending.has(w) ? pending.get(w) : !!w._open;
        pending.set(w, expand === undefined ? !last : expand);
        return;
      }
      const open = !!w._open;
      const want = expand === undefined ? !open : expand;
      if (want === open && (!want || w.children)) {
        return;
      }
      w.expanded = want;
      const revision = w.toggleRevision = (w.toggleRevision || 0) + 1;
      w.filterCollapsed = !want && !!this.filter;
      try {
        if (want && !w.children) {
          await this.loadPage(w, null);
        } else {
          this.relayout();
          if (want) await this.expandInitial(w);
        }
      } finally {
        if (!this.destroyed && !w._invalidated && w.toggleRevision === revision) this.stateChanged();
      }
      if (this.destroyed || w._invalidated || w.toggleRevision !== revision) return;
      this.emit("toggle", { node: w.h, expanded: w.expanded });
      if (this.opts.onToggle) {
        this.opts.onToggle(w.h, w.expanded);
      }
    },

    loadPage(w, cursor) {
      if (this.destroyed || w._invalidated) return Promise.resolve();
      if (w.loading) {
        return w._pending;
      }
      w.loading = true;
      w.error = null;
      this.relayout();
      const started = performance.now();
      const restoration = this.restoreGeneration || 0;
      const suppressInitial = !!this.restoring;
      const run = (async () => {
        let info = null;
        let appliedCount = null;
        let removedSelection = null;
        let removed = false;
        try {
          const inlineItems = w === this.root ? this.root.inlineItems : w.inline ? w.h.children : null;
          const page = inlineItems ? slicePage(inlineItems, cursor, this.pageSize) : await this.source.page(w === this.root ? null : w.h, cursor);
          if (this.destroyed || w._invalidated) return;
          const items = validatePage(page, this.keyMap, cursor ? (w.children || []).length : 0);
          if (cursor != null && !items.length && page.next === cursor) {
            throw new Error("CanopyX: page continuation did not advance.");
          }
          if (!cursor || !w.children) {
            w.children = [];
          }
          const base = w.children.length;
          const suppressExpansion = suppressInitial || restoration !== (this.restoreGeneration || 0);
          items.forEach((node, i) => w.children.push(this.wrap(node, w, base + i, suppressExpansion)));
          w.total = typeof page.total === "number" ? page.total : page.next ? null : w.children.length;
          w.next = page.next || null;
          if (w !== this.root && !w.next && !w.children.length) {
            w.h.hasChildren = false;
            w.h.childCount = 0;
            w.expanded = false;
          }
          this.applySort(w, false);
          appliedCount = items.length;
        } catch (err) {
          if (this.destroyed || w._invalidated) return;
          w.error = err && err.message ? err.message : String(err);
          this.emit("error", { node: w.h, message: w.error });
        } finally {
          w.loading = false;
          w._pending = null;
          if (!this.destroyed && !w._invalidated && w.pendingChildCount != null) {
            const count = w.pendingChildCount;
            const loaded = w.children ? w.children.length : 0;
            w.total = count;
            if (w.children && (loaded > count || (!w.next && loaded < count))) {
              removedSelection = this.invalidateChildren(w);
              removed = true;
            } else if (loaded === count) {
              w.next = null;
              w.error = null;
            }
            if (!count && !loaded) w.expanded = false;
            w.pendingChildCount = null;
          }
          if (!this.destroyed && !w._invalidated) this.relayout(removed);
        }
        if (appliedCount != null && !this.destroyed && !w._invalidated && w.children) {
          const loaded = w.children.length;
          const format = numberFormat(this.lang);
          this.announce(w.total != null && loaded < w.total ? fill(this.labels.pageLoaded, { loaded: format.format(loaded), total: format.format(w.total) }) : fill(this.labels.itemsLoaded, { count: format.format(loaded) }));
          info = { node: w.h, count: appliedCount, total: w.total, ms: performance.now() - started };
        }
        if (removedSelection) this.selectionChanged(removedSelection);
        try {
          if (info && !this.destroyed && !w._invalidated) {
            this.emit("load", info);
            if (this.opts.onLoad) this.opts.onLoad(w.h, info);
          }
        } finally {
          if (!this.destroyed && !w._invalidated && !w.error && (w !== this.root || !this.initializing) && (w === this.root || w.expanded) && !suppressInitial && restoration === (this.restoreGeneration || 0)) await this.expandInitial(w);
        }
      })();
      w._pending = run;
      return run;
    },

    async loadMore(w) {
      if (w.children && w.next) {
        await this.loadStatusPage(w, this.statusRow(w, "more"), w.next);
      }
    },

    setFocus(w, domFocus) {
      if (!w) {
        return;
      }
      this.focusRevision = (this.focusRevision || 0) + 1;
      this.focused = w;
      this.ensureVisible(w);
      if (this.render()) {
        this.ensureVisible(w);
        this.render();
      }
      const rowEl = this.rendered.get(w);
      if (rowEl && domFocus !== false) {
        rowEl.focus({ preventScroll: true });
      }
    },

    ensureVisible(w) {
      const i = this.indexOf(w);
      if (i < 0) {
        return;
      }
      const grid = this.grid;
      const y = this.tops[i];
      const height = w.hpx;
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      const before = grid.scrollTop;
      if (y < before) {
        grid.scrollTop = y;
      } else if (y + height > before + viewHeight) {
        grid.scrollTop = y + height - viewHeight;
      }
      if (Math.abs(grid.scrollTop - before) > viewHeight) this.leanReveal();
    },

    leanReveal() {
      if (this.lean) return;
      this.lean = true;
      requestAnimationFrame(() => setTimeout(() => {
        this.lean = false;
        this.scheduleRender();
      }));
    },

    rowFromEvent(e) {
      const rowEl = e.target.closest(".cx-row");
      return rowEl && rowEl._w && !rowEl._w._invalidated ? rowEl._w : null;
    },

    onClick(e) {
      const w = this.rowFromEvent(e);
      if (!w) {
        return;
      }
      if (w.status) {
        this.setFocus(w, true);
        this.activate(w, true);
        return;
      }
      const interactive = hostControl(e.target);
      if (interactive && !e.target.closest(".cx-exp")) {
        this.setFocus(w, false);
        return;
      }
      if (w.h.detail) {
        this.setFocus(w, true);
        this.select(w, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
        return;
      }
      this.setFocus(w, true);
      if (e.target.classList.contains("cx-exp")) {
        this.toggle(w);
      } else {
        this.select(w, { toggle: e.ctrlKey || e.metaKey, range: e.shiftKey });
      }
    },

    onDblClick(e) {
      const w = this.rowFromEvent(e);
      if (w && !w.status && !hostControl(e.target)) {
        this.toggle(w);
      }
    },

    setFilter(filter, options) {
      this.filter = typeof filter === "function" ? { match: filter } : filter || null;
      this.filterExpand = !!(options && options.autoExpand);
      this.keyMap.forEach((w) => { w.filterCollapsed = false; });
      this.relayout();
    },

    setFilterActive(id, active) {
      const next = new Set(this.activeFilters);
      if (active) next.add(id);
      else next.delete(id);
      this.applyActiveFilters([id], next);
    },

    setActiveFilters(ids) {
      if (!Array.isArray(ids)) throw new Error("CanopyX: setActiveFilters needs an array of filter ids.");
      this.applyActiveFilters(ids, new Set(ids));
    },

    applyActiveFilters(named, next) {
      const declared = this.view.filters || [];
      named.forEach((id) => {
        if (!declared.some((f) => f.id === id)) throw new Error("CanopyX: the view declares no filter '" + id + "'.");
      });
      const changed = next.size !== this.activeFilters.size || Array.from(next).some((id) => !this.activeFilters.has(id));
      if (!changed && this.filter === this.declaredFilter) return;
      this.activeFilters = next;
      this.toolbar.querySelectorAll("[data-cx-filter]").forEach((input) => { input.checked = next.has(input.getAttribute("data-cx-filter")); });
      const filters = declared.filter((f) => next.has(f.id));
      const has = (node, flag) => !!(flag && node.flags && node.flags.indexOf(flag) >= 0);
      this.setFilter(filters.length ? {
        match: (node) => filters.every((f) => has(node, f.flag)),
        keep: (node) => filters.every((f) => has(node, f.flag) || has(node, f.ancestorFlag))
      } : null, { autoExpand: true });
      this.declaredFilter = this.filter;
      if (changed) this.emit("filter", { active: Array.from(next) });
    },

    sort(columnId, direction) {
      this.sortState = direction ? { column: columnId, direction: direction } : null;
      this.buildHeader();
      this.applySort(this.root, true);
      this.relayout();
    },

    setColumnVisible(columnId, visible) {
      const index = this.columns.findIndex((c) => c.id === columnId);
      if (index <= 0) {
        return;
      }
      this.columns[index].hidden = !visible;
      const input = Array.from(this.toolbar.querySelectorAll("[data-cx-column]")).find((el) => el.getAttribute("data-cx-column") === columnId);
      if (input) {
        input.checked = !!visible;
      }
      this.buildHeader();
      this.relayout();
    }
  });

  function navigationScope(grid, signal) {
    const signals = Array.from(new Set([grid.lifetime.signal, signal].filter(Boolean)));
    let abort;
    const stopped = new Promise((resolve) => { abort = () => resolve(); });
    signals.forEach((item) => item.addEventListener("abort", abort, { once: true }));
    const cancelled = () => signals.some((item) => item.aborted);
    if (cancelled()) abort();
    return {
      cancelled,
      wait: (pending) => Promise.race([pending, stopped]),
      dispose: () => signals.forEach((item) => item.removeEventListener("abort", abort))
    };
  }

  Object.assign(TreeGrid.prototype, {
    async openForPath(w, navigation) {
      if (navigation.cancelled() || w._invalidated) return false;
      const wasOpen = w.expanded && !w.filterCollapsed;
      w.expanded = true;
      w.filterCollapsed = false;
      if (!wasOpen) this.relayout();
      const revision = w.toggleRevision || 0;
      if (!w.children) {
        await navigation.wait(this.loadPage(w, null));
        if (navigation.cancelled() || w._invalidated || !w.expanded || (w.toggleRevision || 0) !== revision) return false;
        if (!w.children) {
          throw new Error("CanopyX: could not load the children of '" + w.key + "': " + (w.error || "no data"));
        }
      } else if (!wasOpen) {
        await navigation.wait(this.expandInitial(w));
      }
      return !navigation.cancelled() && !w._invalidated && w.expanded && (w.toggleRevision || 0) === revision;
    },

    async expandPath(ids, options) {
      const navigation = navigationScope(this, options && options.signal);
      try { return await this.navigatePath(ids, options, navigation); }
      finally { navigation.dispose(); }
    },

    async navigatePath(ids, options, navigation) {
      const o = options || {};
      const cancelled = navigation.cancelled;
      if (cancelled()) return null;
      await navigation.wait(this.rootsReady);
      if (cancelled()) return null;
      await navigation.wait(this.prefetchPath(ids, !!o.expandLast));
      if (cancelled()) return null;
      const release = this.holdLayout();
      let w;
      let rebuilt = false;
      try {
        w = await this.openPath(ids, o, navigation);
      } finally {
        rebuilt = release();
      }
      if (cancelled() || w === undefined) return null;
      if (w && (o.focus !== false || o.reveal !== false) && this.flushLayout()) rebuilt = true;
      if (w && rebuilt && (o.focus !== false || o.reveal !== false)) this.leanReveal();
      if (w && o.reveal !== false && this.filter && this.indexOf(w) < 0) {
        this.clearDeclaredFilters();
        this.setFilter(null);
        this.flushLayout();
      }
      this.stateChanged();
      if (w && o.select !== false) {
        this.select(w);
      }
      if (w && o.focus !== false) {
        this.setFocus(w, true);
      } else if (w && o.reveal !== false) {
        this.ensureVisible(w);
      }
      return w ? w.h : null;
    },

    async prefetchPath(ids, openLast) {
      if (typeof this.source.prefetch !== "function") return;
      const opens = [];
      const finds = [];
      let parent = this.root;
      ids.forEach((id, k) => {
        if (k > 0 && !(parent && parent.children)) opens.push(ids[k - 1]);
        const w = this.keyMap.get(id);
        if (!(w && parent && w.parent === parent)) finds.push(id);
        parent = w && w.parent === parent ? w : null;
      });
      if (openLast && ids.length && !(parent && parent.children)) opens.push(ids[ids.length - 1]);
      if (!opens.length && !finds.length) return;
      try {
        await this.source.prefetch(opens, finds);
      } catch (err) {
      }
    },

    async openPath(ids, o, navigation) {
      const cancelled = navigation.cancelled;
      let parent = this.root;
      let w = null;
      const opened = [];
      for (let k = 0; k < ids.length; k++) {
        if (parent !== this.root) {
          try { if (!await this.openForPath(parent, navigation)) return undefined; }
          catch (err) { if (cancelled() || parent._invalidated) return undefined; throw err; }
          opened.push([parent, parent.toggleRevision || 0]);
        }
        if (cancelled() || parent._invalidated || (parent !== this.root && !parent.expanded)) return undefined;
        w = this.keyMap.get(ids[k]);
        const seenCursors = new Set();
        while ((!w || w.parent !== parent) && parent.children && parent.next) {
          const before = parent.children.length;
          const cursor = parent.next;
          if (seenCursors.has(cursor)) {
            throw new Error("CanopyX: could not load more children of '" + (parent.key || "the top level") + "': no progress (continuation repeated)");
          }
          seenCursors.add(cursor);
          await navigation.wait(this.loadPage(parent, parent.next));
          if (cancelled() || parent._invalidated || (parent !== this.root && (!parent.expanded || (parent.toggleRevision || 0) !== opened[opened.length - 1][1]))) return undefined;
          if (parent.error || (parent.children.length === before && parent.next === cursor)) {
            throw new Error("CanopyX: could not load more children of '" + (parent.key || "the top level") + "': " + (parent.error || "no progress"));
          }
          w = this.keyMap.get(ids[k]);
        }
        if (!w || w.parent !== parent) {
          throw new Error("CanopyX: id not found on the path: " + ids[k]);
        }
        parent = w;
      }
      if (o.expandLast && w && this.expandable(w)) {
        try { if (!await this.openForPath(w, navigation)) return undefined; }
        catch (err) { if (cancelled() || w._invalidated) return undefined; throw err; }
        opened.push([w, w.toggleRevision || 0]);
      }
      if (cancelled() || (w && w._invalidated) || opened.some(([node, revision]) =>
        node._invalidated || !node.expanded || (node.toggleRevision || 0) !== revision)) return undefined;
      return w;
    }
  });
  Object.assign(TreeGrid.prototype, {
    select(w, options) {
      if (!w || w.status || w._invalidated) {
        return false;
      }
      const o = options || {};
      const revision = this.selectionRevision || 0;
      if (this.multi && o.range && this.anchor) {
        return this.selectRange(w, revision);
      }
      const next = new Set(this.selected);
      if (this.multi && o.toggle) {
        if (next.has(w)) next.delete(w);
        else next.add(w);
      } else {
        next.clear(); next.add(w);
      }
      return this.commitSelection(next, w, { notify: !o.deferNotify, reason: "row", anchor: w, revision });
    },

    selectRange(w, revision = this.selectionRevision || 0) {
      const from = this.indexOf(this.anchor);
      const to = this.indexOf(w);
      if (from < 0 || to < 0) {
        return this.select(w);
      }
      const next = new Set();
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        const node = this.rows[i];
        if (!node.status && !node._invalidated && this.isSelectable(node)) next.add(node);
      }
      return this.commitSelection(next, w, { reason: "range", revision });
    },

    isSelectable(w) {
      return !this.opts.isSelectable || this.opts.isSelectable(w.h) !== false;
    },

    commitSelection(next, target, options) {
      if (this.destroyed) return false;
      const o = options || {};
      const revision = o.revision == null ? this.selectionRevision || 0 : o.revision;
      if (revision !== (this.selectionRevision || 0)) return false;
      for (const w of next) if (!this.selected.has(w) && !this.isSelectable(w)) return false;
      const nodes = Array.from(next, w => w.h), previous = Array.from(this.selected, w => w.h);
      const node = target ? target.h : null;
      const context = { previous, reason: o.reason || "api" };
      if (this.opts.beforeSelect) {
        const decision = this.opts.beforeSelect(node, nodes.slice(), context);
        if (decision && typeof decision.then === "function") {
          Promise.resolve(decision).catch(() => {});
          throw new Error("CanopyX: beforeSelect must return synchronously.");
        }
        if (decision === false) return false;
      }
      const event = new CustomEvent("canopyx:beforeselect", { bubbles: true, cancelable: true,
        detail: { node, nodes: nodes.slice(), previous, reason: context.reason } });
      if (!this.host.dispatchEvent(event) || this.destroyed || revision !== (this.selectionRevision || 0)) return false;
      if (Array.from(next).some(w => w._invalidated || this.keyMap.get(w.key) !== w)) return false;
      this.selected = next;
      if (Object.prototype.hasOwnProperty.call(o, "anchor")) this.anchor = o.anchor;
      return this.selectionChanged(target, o.notify !== false);
    },

    setSelection(ids) {
      if (this.destroyed) return false;
      if (!Array.isArray(ids)) throw new Error("CanopyX: setSelection needs an array of loaded node ids.");
      const next = new Set();
      for (const id of ids) {
        requireIdentifier(id, "selection ID");
        const w = this.keyMap.get(id);
        if (!w || w._invalidated) throw new Error("CanopyX: selection node is not loaded: " + id);
        next.add(w);
      }
      if (!this.multi && next.size > 1) throw new Error("CanopyX: this view allows only one selected node.");
      const target = Array.from(next).pop() || null;
      return this.commitSelection(next, target, { reason: ids.length ? "api" : "clear", anchor: target });
    },

    selectAll(options) {
      if (this.destroyed) return false;
      if (!this.multi) throw new Error("CanopyX: selectAll requires multiple selection.");
      const scope = options && options.scope;
      if (scope !== "visible" && scope !== "loaded") throw new Error("CanopyX: selectAll scope must be visible or loaded.");
      const candidates = scope === "visible" ? this.rows : Array.from(this.keyMap.values());
      const revision = this.selectionRevision || 0;
      const next = new Set(candidates.filter(w => !w.status && !w._invalidated && this.isSelectable(w)));
      const target = Array.from(next).pop() || null;
      return this.commitSelection(next, target, { reason: "all", anchor: target, revision });
    },

    selectionChanged(w, notify = true) {
      this.selectionRevision = (this.selectionRevision || 0) + 1;
      const revision = this.selectionRevision;
      for (const [node, row] of this.rendered) {
        if (!node.status) setAttr(row, "aria-selected", this.selected.has(node) ? "true" : "false");
      }
      this.scheduleRender();
      const nodes = Array.from(this.selected).map((s) => s.h);
      this.writeDeepLink(this.selected.has(w) ? w : Array.from(this.selected).pop(), revision);
      if (this.destroyed || revision !== this.selectionRevision) return false;
      if (notify) this.notifySelection(w, nodes, revision);
      return revision === this.selectionRevision && !this.destroyed;
    },

    notifySelection(w, nodes, revision = this.selectionRevision) {
      const node = w ? w.h : null;
      this.emit("select", { node, nodes });
      if (this.opts.onSelect && revision === this.selectionRevision && !this.destroyed) {
        this.opts.onSelect(node, nodes);
      }
    }
  });

  Object.assign(TreeGrid.prototype, {
    buildToolbar() {
      const bar = this.toolbar;
      let any = false;
      if (this.view.search && this.source.canSearch) {
        this.buildSearch(bar, this.view.search);
        any = true;
      }
      (this.view.filters || []).forEach((filter) => {
        if (filter.hidden) return;
        const label = h("label", "cx-switch");
        const input = h("input");
        input.type = "checkbox";
        input.setAttribute("data-cx-filter", filter.id);
        input.addEventListener("change", () => this.setFilterActive(filter.id, input.checked));
        label.appendChild(input);
        label.appendChild(document.createTextNode(filter.label));
        bar.appendChild(label);
        any = true;
      });
      if (this.columns.length > 1) {
        this.buildColumnChooser(bar);
        any = true;
      }
      bar.hidden = !any;
    },

    clearDeclaredFilters() {
      if (!this.activeFilters.size) {
        return;
      }
      this.activeFilters.clear();
      this.toolbar.querySelectorAll("[data-cx-filter]").forEach((input) => { input.checked = false; });
      this.emit("filter", { active: [] });
    },

    buildSearch(bar, options) {
      const box = h("div", "cx-search");
      const input = h("input", "cx-search-input");
      const list = h("ul", "cx-results");
      const status = h("span", "cx-sr-only");
      list.id = this.id + "-results";
      list.hidden = true;
      const labels = this.labels;
      const count = (value) => numberFormat(this.lang).format(value);
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", labels.searchResults);
      input.type = "search";
      input.placeholder = options.placeholder || labels.searchPlaceholder;
      input.setAttribute("aria-label", options.placeholder || labels.searchPlaceholder);
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-controls", list.id);
      status.setAttribute("aria-live", "polite");
      let timer = 0;
      let blurTimer = 0;
      let sequence = 0;
      let navigation = null;
      const cancelNavigation = () => { if (navigation) navigation.abort(); };
      let hits = [];
      let active = -1;
      const close = () => {
        list.hidden = true;
        active = -1;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
      };
      const flyout = watchFlyout(box, list, () => !list.hidden);
      this.disposeSearchFlyout = flyout.dispose;
      const choose = async (index) => {
        const hit = hits[index];
        if (!hit) {
          return;
        }
        cancelNavigation();
        const current = navigation = new AbortController();
        close();
        try {
          await this.expandPath(hit.path, { select: true, focus: true, signal: current.signal });
        } catch (err) {
          if (!this.destroyed && !current.signal.aborted) setText(status, fill(labels.searchFailed, { error: err.message }));
        }
      };
      const show = (result) => {
        hits = result.hits || [];
        list.textContent = "";
        hits.forEach((hit, index) => {
          const item = h("li", "cx-result");
          item.id = list.id + "-" + index;
          item.setAttribute("role", "option");
          item.setAttribute("aria-selected", "false");
          const label = h("span", "cx-result-label");
          setText(label, hit.label);
          item.appendChild(label);
          if (hit.kind) {
            const kind = h("span", "cx-result-kind");
            setText(kind, hit.kind);
            item.appendChild(kind);
          }
          if (hit.context) {
            const context = h("span", "cx-result-context");
            setText(context, hit.context);
            item.appendChild(context);
          }
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
          });
          item.addEventListener("click", () => choose(index));
          list.appendChild(item);
        });
        list.hidden = !hits.length;
        flyout.position();
        input.setAttribute("aria-expanded", hits.length ? "true" : "false");
        setText(status, !hits.length ? labels.searchNoResults : !result.truncated ? fill(labels.searchResultCount, { count: count(hits.length) }) :
          result.total ? fill(labels.searchResultCountOfTotal, { count: count(hits.length), total: count(result.total) }) : fill(labels.searchResultCountOfMany, { count: count(hits.length) }));
      };
      const run = async () => {
        if (this.destroyed) return;
        const query = trimSeparators(input.value);
        if (query.length < options.minLength) {
          sequence++;
          close();
          setText(status, query ? fill(labels.searchTooShort, { min: count(options.minLength) }) : "");
          return;
        }
        const mine = ++sequence;
        try {
          const result = await this.search(query, options.maxResults);
          if (!this.destroyed && mine === sequence) {
            show(result);
          }
        } catch (err) {
          if (!this.destroyed && mine === sequence) {
            setText(status, err && err.code === "too-short" ? fill(labels.searchWordTooShort, { min: count(2) }) :
              fill(labels.searchFailed, { error: err && err.message ? err.message : err }));
          }
        }
      };
      const move = (delta) => {
        if (list.hidden || !hits.length) {
          return;
        }
        if (active >= 0) {
          list.children[active].setAttribute("aria-selected", "false");
        }
        active = active < 0 ? (delta < 0 ? hits.length - 1 : 0) : (active + delta + hits.length) % hits.length;
        const item = list.children[active];
        item.setAttribute("aria-selected", "true");
        input.setAttribute("aria-activedescendant", item.id);
        item.scrollIntoView({ block: "nearest" });
      };
      input.addEventListener("input", () => {
        cancelNavigation();
        sequence++;
        clearTimeout(timer);
        hits = [];
        close();
        timer = setTimeout(run, 150);
      });
      input.addEventListener("keydown", (e) => {
        if (e.defaultPrevented || e.isComposing) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          move(e.key === "ArrowDown" ? 1 : -1);
        } else if (e.key === "Enter") {
          if (!list.hidden) {
            choose(active >= 0 ? active : 0);
          }
        } else if (e.key === "Escape") {
          cancelNavigation();
          sequence++;
          clearTimeout(timer);
          if (list.hidden) {
            input.value = "";
          }
          close();
        } else {
          return;
        }
        e.preventDefault();
      });
      input.addEventListener("blur", () => {
        cancelNavigation();
        sequence++;
        clearTimeout(timer);
        clearTimeout(blurTimer);
        blurTimer = setTimeout(close, 150);
      });
      this.cancelSearch = () => { cancelNavigation(); sequence++; clearTimeout(timer); clearTimeout(blurTimer); };
      box.appendChild(input);
      box.appendChild(list);
      box.appendChild(status);
      bar.appendChild(box);
      this.searchInput = input;
    },

    buildColumnChooser(bar) {
      const details = h("details", "cx-columns");
      const summary = h("summary");
      setText(summary, this.labels.columns);
      const group = h("fieldset", "cx-columns-list");
      const legend = h("legend", "cx-sr-only");
      setText(legend, this.labels.visibleColumns);
      group.appendChild(legend);
      this.columns.slice(1).forEach((column) => {
        const label = h("label");
        const input = h("input");
        input.type = "checkbox";
        input.checked = !column.hidden;
        input.setAttribute("data-cx-column", column.id);
        input.addEventListener("change", () => this.setColumnVisible(column.id, input.checked));
        label.appendChild(input);
        label.appendChild(document.createTextNode(column.title));
        group.appendChild(label);
      });
      details.appendChild(summary);
      details.appendChild(group);
      bar.appendChild(details);
      const flyout = watchFlyout(details, group, () => details.open);
      details.addEventListener("toggle", flyout.position);
      this.disposeColumnChooser = flyout.dispose;
    }
  });

  function watchFlyout(anchorElement, panel, isOpen) {
    const position = () => {
      if (!isOpen()) return;
      const anchor = anchorElement.getBoundingClientRect();
      const below = Math.max(0, global.innerHeight - anchor.bottom - 8);
      const above = Math.max(0, anchor.top - 8);
      const opensAbove = below < 120 && above > below;
      panel.style.maxHeight = Math.min(320, opensAbove ? above : below) + "px";
      panel.style.top = opensAbove ? "auto" : "100%";
      panel.style.bottom = opensAbove ? "100%" : "auto";
      const width = panel.getBoundingClientRect().width;
      panel.style.left = Math.max(8, Math.min(anchor.left, global.innerWidth - width - 8)) - anchor.left + "px";
    };
    global.addEventListener("resize", position);
    global.addEventListener("scroll", position, true);
    return {
      position,
      dispose: () => {
        global.removeEventListener("resize", position);
        global.removeEventListener("scroll", position, true);
      }
    };
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  Object.assign(TreeGrid.prototype, {
    pathOf(w) {
      const path = [];
      for (let node = w; node && node !== this.root; node = node.parent) {
        path.push(node.key);
      }
      return path.reverse();
    },

    getExpandedPaths() {
      const out = [];
      const pending = (this.root.children || []).slice().reverse();
      while (pending.length) {
        const child = pending.pop();
        if (child.expanded && this.expandable(child)) {
          out.push(this.pathOf(child));
          if (child.children) {
            for (let i = child.children.length - 1; i >= 0; i--) pending.push(child.children[i]);
          }
        }
      }
      return out;
    },

    async setState(state) {
      if (this.destroyed || !state || !Array.isArray(state.expanded)) {
        return;
      }
      try {
        for (const path of state.expanded) {
          if (!Array.isArray(path) || !path.length) return;
          for (const id of path) requireIdentifier(id, "remembered path ID");
        }
      } catch (error) {
        return;
      }
      if (this.restoreController) this.restoreController.abort();
      const current = this.restoreController = new AbortController();
      this.restoreGeneration = (this.restoreGeneration || 0) + 1;
      this.pendingRestorationToggles = null;
      this.restoring = true;
      clearTimeout(this.saveTimer);
      const before = new Map();
      this.keyMap.forEach((w) => before.set(w, [w.expanded, w.autoExpand, w.filterCollapsed]));
      let restored = 0;
      let fallback = false;
      const release = this.holdLayout();
      try {
        this.keyMap.forEach((w) => { w.expanded = false; w.autoExpand = false; });
        this.relayout();
        const paths = state.expanded.slice().sort((a, b) => a.length - b.length);
        for (const path of paths) {
          if (this.destroyed || current.signal.aborted) break;
          try {
            const node = await this.expandPath(path, { select: false, focus: false, reveal: false, expandLast: true, signal: current.signal });
            const wrapper = node && this.keyMap.get(node.id);
            if (wrapper && wrapper.expanded) restored++;
          } catch (e) {
            const last = this.keyMap.get(path[path.length - 1]);
            if ((last && last.expanded) || path.some((id) => {
              const node = this.keyMap.get(id);
              return node && node.expanded && node.error;
            })) restored++;
          }
        }
        fallback = !!state.expanded.length && !restored && !this.destroyed && !current.signal.aborted;
        if (fallback) {
          this.keyMap.forEach((w) => {
            const old = before.get(w);
            w.expanded = old ? old[0] : !!w.h.expanded && !!w.children && w.children.length > 0;
            w.autoExpand = old ? old[1] : !!w.h.expanded && !w.children && this.expandable(w);
            if (old) w.filterCollapsed = old[2];
          });
          this.relayout();
        }
      } finally {
        release();
        if (this.restoreController === current) {
          this.restoring = false;
          this.restoreController = null;
          if (fallback && !this.initializing) await this.expandInitial(this.root);
          if (!this.initializing) await this.flushPendingToggles();
        }
      }
    },

    async flushPendingToggles() {
      if (this.pendingToggleFlush) {
        try { await this.pendingToggleFlush; }
        catch (error) { if (!this.restoreController) throw error; }
        if (this.restoring || this.initializing) return;
        return this.flushPendingToggles();
      }
      const pending = this.pendingRestorationToggles;
      if (!pending || !pending.size) return;
      const generation = this.restoreGeneration || 0;
      this.replayingToggles = true;
      const run = (async () => {
        let failure = null;
        while (!this.destroyed && generation === (this.restoreGeneration || 0) && pending.size) {
          const [node, expand] = pending.entries().next().value;
          pending.delete(node);
          try { await this.toggle(node, expand, true); }
          catch (error) { if (!failure) failure = error; }
        }
        if (failure && generation === (this.restoreGeneration || 0)) throw failure;
      })();
      this.pendingToggleFlush = run;
      try {
        await run;
      } finally {
        if (this.pendingToggleFlush === run) this.pendingToggleFlush = null;
        this.replayingToggles = false;
        if (this.pendingRestorationToggles === pending && !pending.size) {
          this.pendingRestorationToggles = null;
          if (!this.destroyed) this.stateChanged();
        }
      }
    },

    stateKey() {
      return this.view.stateKey == null ? null : "canopyx:" + this.view.stateKey;
    },

    stateChanged() {
      const key = this.stateKey();
      if (this.destroyed || !key || this.restoring || this.initializing || this.replayingToggles) {
        return;
      }
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        if (this.destroyed || this.restoring || this.initializing || this.replayingToggles) return;
        try {
          sessionStorage.setItem(key, JSON.stringify({ expanded: this.getExpandedPaths() }));
        } catch (e) {
        }
      }, 250);
    },

    async restoreState() {
      const key = this.stateKey();
      if (!key) {
        return;
      }
      let state = null;
      try {
        state = JSON.parse(sessionStorage.getItem(key) || "null");
      } catch (e) {
        state = null;
      }
      await this.setState(state);
    },

    visibleRows() {
      return this.rows.filter((w) => !w.status).map((w) => ({ node: w.h, level: w.level, path: this.pathOf(w) }));
    },

    toOutline() {
      const cols = this.visibleColumns();
      const out = ["<table class=\"cx-outline-table\"><thead><tr>"];
      cols.forEach((column) => out.push("<th>" + escapeHtml(column.title) + "</th>"));
      out.push("</tr></thead><tbody>");
      this.rows.forEach((w) => {
        if (w.status) {
          return;
        }
        const pad = " style=\"padding-left:" + ((w.level - 1) * 14 + 4) + "px\"";
        if (w.h.detail) {
          const detail = w.h.detail;
          const content = h("div");
          this.renderDetail(w.h, content, true);
          out.push("<tr><td" + pad + " colspan=\"" + cols.length + "\">" + content.innerHTML + "</td></tr>");
          return;
        }
        out.push("<tr>");
        cols.forEach((column, i) => {
          const index = this.columns.indexOf(column);
          const value = this.cellOf(w.h, column, index);
          const text = cellText(value, column, this.fmt);
          const content = h("span");
          if (!column.render || column.render(w.h, content, { column: column.id, level: w.level, expanded: w.expanded, index }) !== true) {
            const badges = (i === 0 ? w.h.badges || [] : []).concat(isCellObject(value) ? value.badges || [] : []);
            content.appendChild(detailCell("span", Object.assign({}, isCellObject(value) ? value : {}, { text, badges }), this.fmt));
          }
          out.push("<td" + (i === 0 ? pad : "") + ">" + content.outerHTML + "</td>");
        });
        out.push("</tr>");
      });
      out.push("</tbody></table>");
      return out.join("");
    },

    invalidateChildren(w) {
      const pending = (w.children || []).slice();
      let removedSelection = null;
      while (pending.length) {
        const child = pending.pop();
        if (child.children) for (const descendant of child.children) pending.push(descendant);
        child._invalidated = true;
        if (this.keyMap.get(child.key) === child) this.keyMap.delete(child.key);
        if (this.selected.delete(child) && !removedSelection) removedSelection = child;
        if (this.anchor === child) this.anchor = null;
      }
      w.children = null;
      w.next = null;
      w.error = null;
      w.expanded = false;
      return removedSelection;
    },

    applyCounts(doc, fromRefresh = false) {
      if (this.destroyed) return;
      checkDocument(doc, "counts");
      let removedSelection = null;
      let removed = false;
      doc.items.forEach((item) => {
        const w = this.keyMap.get(item.id);
        if (w && w.inline && item.childCount != null && item.childCount !== w.h.children.length) {
          throw new Error("CanopyX: inline childCount must equal children length.");
        }
      });
      if (!fromRefresh && this.countRevisions) {
        for (const id of new Set(doc.items.map((item) => item.id))) {
          this.countRevisions.set(id, (this.countRevisions.get(id) || 0) + 1);
        }
      }
      doc.items.forEach((item) => {
        const w = this.keyMap.get(item.id);
        if (!w) {
          return;
        }
        if (item.cells) w._v = 0;
        if (typeof item.childCount === "number") {
          w.h.childCount = item.childCount;
          w.total = item.childCount;
          if (!w.inline) {
            w.h.hasChildren = item.childCount > 0;
            const loaded = w.children ? w.children.length : 0;
            if (w.loading) w.pendingChildCount = item.childCount;
            else if (item.childCount < loaded || (item.childCount > loaded && w.children && !w.next)) {
              removedSelection = this.invalidateChildren(w) || removedSelection;
              removed = true;
            }
            else if (item.childCount === loaded) {
              w.next = null;
              w.error = null;
            }
            if (!item.childCount && (!w.children || !w.children.length)) w.expanded = false;
          }
        }
        if (item.cells) {
          w.h.cells = Object.assign(Object.create(null), w.h.cells, item.cells);
        }
        if (Array.isArray(item.flags)) {
          w.h.flags = item.flags.slice();
        }
      });
      this.applySort(this.root, true);
      this.relayout(removed);
      if (removedSelection) this.selectionChanged(removedSelection);
    },

    async refreshCounts(ids) {
      if (this.destroyed || !this.source.counts) {
        return null;
      }
      const wanted = ids || this.rows.filter((w) => !w.status).map((w) => w.key);
      const revisions = this.countRevisions || (this.countRevisions = new Map());
      const mine = new Map(wanted.map((id) => [id, (revisions.get(id) || 0) + 1]));
      mine.forEach((revision, id) => revisions.set(id, revision));
      const doc = await this.source.counts(wanted);
      if (this.destroyed) return null;
      checkDocument(doc, "counts");
      this.applyCounts(Object.assign({}, doc, { items: doc.items.filter((item) => mine.has(item.id) && mine.get(item.id) === revisions.get(item.id)) }), true);
      return doc;
    },

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.lifetime.abort();
      if (this.restoreController) this.restoreController.abort();
      if (this.cancelResize) this.cancelResize();
      clearTimeout(this.saveTimer);
      clearTimeout(this.layoutTimer);
      if (this.cancelSearch) this.cancelSearch();
      if (this.disposeColumnChooser) this.disposeColumnChooser();
      if (this.disposeSearchFlyout) this.disposeSearchFlyout();
      cancelAnimationFrame(this.rafId);
      this.resizeObserver.disconnect();
      if (this.detailObserver) this.detailObserver.disconnect();
      this.grid.removeEventListener("scroll", this.onScroll);
      global.removeEventListener("beforeprint", this.onPrint);
      global.removeEventListener("hashchange", this.onHash);
      global.removeEventListener("popstate", this.onHash);
      if (this.linkOpening) this.linkOpening.abort();
      [this.toolbar, this.grid, this.live, this.outline].forEach((element) => element.remove());
      this.host.classList.remove("cx-pin-tree");
      this.host.removeAttribute("data-cx-ready");
      this.host.removeAttribute("data-canopyx-mounted");
    }
  });

  Object.assign(TreeGrid.prototype, {
    deepLinkName() {
      return "cx." + encodeURIComponent(this.view.id);
    },

    hashParams() {
      return (global.location.hash || "").replace(/^#/, "").split("&").filter(Boolean);
    },

    currentLink() {
      if (this.opts.parseLink) {
        return (global.location.hash || "").replace(/^#/, "");
      }
      const prefix = this.deepLinkName() + "=";
      const param = this.hashParams().find((p) => p.startsWith(prefix));
      return param ? param.slice(prefix.length) : null;
    },

    readLocation() {
      if (this.destroyed) return Promise.resolve();
      if (this.initializing) {
        if (this.linkOpening && this.currentLink() !== this.link) {
          this.linkOpening.abort();
          this.link = null; // Deferred reopening must not reuse the canceled link if the address changes back.
        }
        this.linkChanged = true;
        return this.ready.then(() => undefined, () => undefined);
      }
      return this.openDeepLink();
    },

    openDeepLink() {
      const link = this.view.deepLink ? this.currentLink() : null;
      if (link !== this.link && this.linkOpening) this.linkOpening.abort();
      if (link == null || link === this.link) {
        if (link == null) this.link = null;
        return link != null && this.linkTask && this.linkTask.link === link ? this.linkTask.promise : Promise.resolve();
      }
      this.link = link;
      if (this.linkOpening) this.linkOpening.abort();
      const current = this.linkOpening = new AbortController();
      const promise = this.openLink(link, current);
      this.linkTask = { link: link, promise: promise };
      promise.then(() => {
        if (this.linkTask && this.linkTask.promise === promise) this.linkTask = null;
      });
      return promise;
    },

    async openLink(link, current) {
      try {
        const ids = this.opts.parseLink ? await this.opts.parseLink(link) : link.split("/").filter(Boolean).map(decodeURIComponent);
        if (Array.isArray(ids) && ids.length && !this.destroyed && !current.signal.aborted &&
            !await this.expandPath(ids, { select: true, focus: false, signal: current.signal }) && !current.signal.aborted) {
          this.link = null;
        }
      } catch (e) {
        if (!current.signal.aborted) {
          this.link = null;
          this.announce(e && e.message ? e.message : String(e));
        }
      }
    },

    writeDeepLink(w, revision = this.selectionRevision) {
      if (!this.view.deepLink) {
        return;
      }
      let hash;
      if (this.opts.formatLink) {
        let link = null;
        try {
          link = this.opts.formatLink(w ? this.pathOf(w) : [], w ? w.h : null);
        } catch (e) {
          if (global.console) global.console.error(e);
        }
        if (link == null || this.destroyed || revision !== this.selectionRevision) {
          return;
        }
        hash = "#" + String(link).replace(/^#/, "");
      } else {
        const prefix = this.deepLinkName() + "=";
        const params = this.hashParams().filter((p) => !p.startsWith(prefix));
        if (w) params.push(prefix + this.pathOf(w).map(encodeURIComponent).join("/"));
        hash = "#" + params.join("&");
      }
      try {
        global.history.replaceState(global.history.state, "", global.location.href.replace(/#.*$/, "") + hash);
      } catch (e) {
        global.location.hash = hash;
      }
      this.link = this.currentLink();
      this.locationEvent = null;
    }
  });

  function createTreeGrid(host, options) {
    if (!host || !options || !options.view) {
      throw new Error("CanopyX: createTreeGrid needs a host element and a view document.");
    }
    const existing = activeGrids.get(host);
    if (existing) return existing;
    const grid = new TreeGrid(host, options);
    const api = Object.freeze({
      element: host,
      view: grid.view,
      ready: grid.ready,
      expandPath: (ids, o) => grid.expandPath(ids, o),
      setFilter: (filter, o) => { grid.clearDeclaredFilters(); grid.setFilter(filter, o); },
      setFilterActive: (id, active) => grid.setFilterActive(id, active),
      setActiveFilters: (ids) => grid.setActiveFilters(ids),
      getActiveFilters: () => Array.from(grid.activeFilters),
      sort: (columnId, direction) => grid.sort(columnId, direction),
      setColumnVisible: (columnId, visible) => grid.setColumnVisible(columnId, visible),
      setColumnWidth: (columnId, width) => grid.setColumnWidth(columnId, width),
      setTreeColumnPinned: (pinned) => grid.setTreeColumnPinned(pinned),
      setTimeZone: (zone) => grid.setTimeZone(zone),
      getTimeZone: () => (grid.local ? "local" : "utc"),
      refresh: () => { grid.version++; grid.scheduleRender(); },
      readLocation: () => grid.readLocation(),
      getSelected: () => Array.from(grid.selected).map((w) => w.h),
      setSelection: (ids) => grid.setSelection(ids),
      clearSelection: () => grid.setSelection([]),
      selectAll: (options) => grid.selectAll(options),
      focus: () => {
        if (grid.destroyed) return;
        const target = grid.indexOf(grid.focused) >= 0 ? grid.focused : grid.rows[0];
        if (target) grid.setFocus(target, true);
        else grid.grid.focus({ preventScroll: true });
      },
      visibleRows: () => grid.visibleRows(),
      toOutline: () => grid.toOutline(),
      getState: () => ({ expanded: grid.getExpandedPaths() }),
      setState: (state) => grid.setState(state),
      search: (query, limit) => grid.search(query, limit || (grid.view.search && grid.view.search.maxResults) || 20),
      loadMore: (id) => {
        const w = id == null ? grid.root : grid.keyMap.get(id);
        return w ? grid.loadMore(w) : Promise.resolve();
      },
      applyCounts: (doc) => grid.applyCounts(doc),
      refreshCounts: (ids) => grid.refreshCounts(ids),
      destroy: () => {
        grid.destroy();
        if (activeGrids.get(host) === api) activeGrids.delete(host);
        if (host.canopyx === api) delete host.canopyx;
      }
    });
    activeGrids.set(host, api);
    host.setAttribute("data-canopyx-mounted", "true");
    host.canopyx = api;
    return api;
  }

  const configured = new Map();

  function configure(viewId, options) {
    requireIdentifier(viewId, "view ID");
    if (!options || typeof options !== "object") {
      throw new Error("CanopyX: configure needs a view id and an options object.");
    }
    if (Array.from(document.querySelectorAll("[data-canopyx-mounted]")).some((host) => host.canopyx && host.canopyx.view.id === viewId)) {
      throw new Error("CanopyX: view '" + viewId + "' is already mounted; configure it before the page has loaded, or mark its fragment data-cx-mount=\"manual\" and call CanopyX.mount.");
    }
    const registration = Object.assign({}, configured.get(viewId), options, { view: undefined });
    configured.set(viewId, registration);
    return () => {
      if (configured.get(viewId) === registration) configured.delete(viewId);
    };
  }

  function unconfigure(viewId) {
    requireIdentifier(viewId, "view ID");
    return configured.delete(viewId);
  }

  function mount(root, automatic) {
    const scope = root || document;
    const created = [];
    const showError = (host, err, api, view) => {
      if (api) {
        api.destroy();
        if (host.canopyx === api) delete host.canopyx;
      }
      const message = err && err.message ? err.message : String(err);
      let labels = DEFAULT_LABELS;
      for (const attempt of [() => labelsFor(view && view.labels, view && configured.has(view.id) ? configured.get(view.id).labels : null), () => labelsFor(view && view.labels)]) {
        try { labels = attempt(); break; } catch (e) { labels = DEFAULT_LABELS; }
      }
      const notice = document.createElement("div");
      notice.className = "cx-mount-error";
      notice.setAttribute("role", "alert");
      setText(notice, fill(labels.mountError, { error: message }));
      host.classList.add("cx-host");
      host.setAttribute("data-canopyx-mounted", "true");
      host.setAttribute("data-cx-error", message);
      host.appendChild(notice);
      if (global.console) global.console.error(err);
    };
    scope.querySelectorAll("[data-canopyx-host]:not([data-canopyx-mounted])").forEach((host) => {
      const config = host.querySelector("script.cx-config");
      if (!config || (automatic === true && host.getAttribute("data-cx-mount") === "manual")) {
        return;
      }
      host.setAttribute("data-canopyx-mounted", "true");
      let view = null;
      try {
        view = JSON.parse(config.textContent);
        const api = createTreeGrid(host, Object.assign({}, view && configured.get(view.id), { view: view }));
        created.push(api);
        api.ready.catch((err) => {
          if (activeGrids.get(host) === api && host.canopyx === api) showError(host, err, api, view);
        });
      } catch (err) {
        showError(host, err, null, view);
      }
    });
    return created;
  }

  global.CanopyX = Object.freeze({
    protocol: PROTOCOL,
    createTreeGrid: createTreeGrid,
    configure: configure,
    unconfigure: unconfigure,
    mount: (root) => mount(root, false),
    sources: Object.freeze({ inline: inlineSource, sidecar: sidecarSource, remote: remoteSource }),
    badge: hostBadge,
    labels: DEFAULT_LABELS
  });

  const navigation = global.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
  if (document.readyState === "loading" || (document.readyState === "interactive" && navigation && navigation.domContentLoadedEventStart === 0)) {
    document.addEventListener("DOMContentLoaded", () => mount(document, true));
  } else {
    mount(document, true);
  }
})(typeof window !== "undefined" ? window : this);

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

  /** Verifies wire page ownership and required structural counters. */
  function checkPage(doc, node) {
    checkDocument(doc, "page");
    if (!Array.isArray(doc.items)) throw new Error("CanopyX: page items must be an array.");
    if (!validStructuralCount(doc.offset)) throw new Error("CanopyX: page offset must be a nonnegative 32-bit integer.");
    if (Object.prototype.hasOwnProperty.call(doc, "total") && !validStructuralCount(doc.total)) {
      throw new Error("CanopyX: page total must be a nonnegative 32-bit integer.");
    }
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
  // Common ranges use direct rules. The remaining one-unit pairs come from the C# writer's frozen table.
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

  // ---------- sidecar registry ----------
  // Sidecar files run (self.CanopyXSidecar = self.CanopyXSidecar || []).push([viewId, ref, document]). Files that ran
  // before the runtime left entries in a plain array; the runtime drains it and replaces push, so load order does not
  // matter. Script tags are used because browsers block fetch() of local files on file://.
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

  /** Loads one sidecar document by injecting its script; resolves with the document the script registers. */
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
    // A wire reference is an opaque path, not a URL suffix. Encode each component so ? and #
    // remain part of the file name while the separators between bundle folders stay intact.
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

  // ---------- data sources ----------
  // Every source has the same promise-based interface:
  //   page(node, cursor)   -> { items, total, next, offset }   node is null for the top level, cursor null for page one
  //   search(query, limit) -> { hits, total, truncated }
  //   counts(ids)          -> a counts document (remote sources with a counts URL only)
  //   canSearch            -> whether search() can answer

  /** Pages an array that is already in memory (inline roots and inline children). */
  function slicePage(all, cursor, pageSize) {
    const offset = cursor ? Number(cursor) || 0 : 0;
    const items = all.slice(offset, offset + pageSize);
    const end = offset + items.length;
    return { items: items, total: all.length, next: end < all.length ? String(end) : null, offset: offset };
  }

  function rankHits(hits, query, limit) {
    hits.sort((a, b) => rankLabel(a.label, query) - rankLabel(b.label, query) || collator.compare(a.label, b.label));
    return { hits: hits.slice(0, limit), total: hits.length, truncated: hits.length > limit };
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
        if (queryWords.length) {
          // Paths are linked during traversal and materialized only for matching hits.
          const stack = (view.roots || []).map((node) => ({ node, parent: null })).reverse();
          while (stack.length) {
            const item = stack.pop();
            if (matchesWords(wordsOf(item.node), queryWords)) {
              const path = [];
              const labels = [];
              for (let entry = item; entry; entry = entry.parent) {
                path.push(entry.node.id);
                if (entry !== item) labels.push(entry.node.label);
              }
              hits.push({ path: path.reverse(), label: item.node.label, kind: item.node.kind, context: labels.reverse().join(" / ") });
            }
            const children = item.node.children || [];
            for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], parent: item });
          }
        }
        return Promise.resolve(rankHits(hits, query, limit));
      }
    };
  }

  /** Picks the search shards for one folded query word (see "Sidecar" in docs/data-protocol.md). */
  function resolveShards(shards, keys, word) {
    const bases = keys.filter((key) => !/\.\d+$/.test(key));
    const parts = (selected) => selected.flatMap((key) => [key].concat(keys.filter((part) => part.startsWith(key + "."))
      .sort((a, b) => Number(a.slice(a.lastIndexOf(".") + 1)) - Number(b.slice(b.lastIndexOf(".") + 1)))));
    for (let length = 2; length <= word.length; length++) {
      const key = shardKey(word.slice(0, length));
      if (Object.prototype.hasOwnProperty.call(shards, key)) return parts([key]);
      const deeper = bases.filter((k) => k.length > key.length && k.startsWith(key));
      if (!deeper.length) return [];
      if (length === word.length) return parts(deeper);
    }
    return [];
  }

  function sidecarSource(view) {
    const supplied = view.source.base;
    if (typeof supplied !== "string" || !supplied || /[?#]/.test(supplied)) throw new Error("CanopyX: sidecar base must be a folder path without a query or fragment.");
    const base = supplied.endsWith("/") ? supplied : supplied + "/";
    const load = (ref) => loadSidecar(base, view.id, ref);
    const shardCache = new Map();
    let manifestPromise = null;
    // Failed loads are not cached, so a retry can succeed once the file is back.
    const manifest = () => manifestPromise || (manifestPromise = load("manifest").then((doc) => {
      checkDocument(doc, "manifest");
      if (doc.view !== view.id) throw new Error("CanopyX: manifest view does not match the requested view.");
      return doc;
    }).catch((err) => {
      manifestPromise = null;
      throw err;
    }));
    // Shards stay cached for repeated queries, but only the most recent ones, so a few broad queries cannot keep
    // megabytes of index alive.
    const loadShard = (key) => {
      let pending = shardCache.get(key);
      if (pending) {
        shardCache.delete(key);
      } else {
        pending = manifest().then(async (m) => {
          const doc = checkDocument(await load("s/" + (m.search.prefix || "") + key), "searchShard");
          if (doc.key !== key) throw new Error("CanopyX: search shard key does not match the manifest.");
          if (!Array.isArray(doc.entries) || doc.entries.length !== m.search.shards[key]) {
            throw new Error("CanopyX: search shard entry count does not match the manifest.");
          }
          return doc.entries.map((entry) => ({ entry: entry, words: words(entry.label) }));
        }).catch((err) => {
          shardCache.delete(key);
          throw err;
        });
      }
      shardCache.set(key, pending);
      if (shardCache.size > SHARD_CACHE) {
        shardCache.delete(shardCache.keys().next().value);
      }
      return pending;
    };
    return {
      kind: "sidecar",
      canSearch: true,
      manifest: manifest,
      async page(node, cursor) {
        const ref = cursor || (node ? node.ref : (await manifest()).root);
        if (!ref) {
          throw new Error("Node '" + node.id + "' has no sidecar reference for its children.");
        }
        const doc = checkPage(await load(ref), node);
        return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      async search(query, limit) {
        const queryWords = words(query);
        if (queryWords.length && !queryWords.some((word) => word.length >= 2)) {
          throw new Error("CanopyX: sidecar search needs a word of at least two UTF-16 units.");
        }
        const m = await manifest();
        if (!m.search || !queryWords.length) {
          return { hits: [], total: 0, truncated: false };
        }
        const longest = queryWords.reduce((a, b) => (b.length > a.length ? b : a));
        const shards = m.search.shards;
        const all = Object.keys(shards);
        // Parts use the same canonical resolver as ordinary shards and load in numeric order.
        const order = resolveShards(shards, all, longest);
        const seen = new Set();
        const hits = [];
        let stopped = false;
        // Files load a few at a time: parallel enough for HTTP, and the candidate check between batches keeps a
        // broad query from pulling in every part.
        for (let i = 0; i < order.length; i += SHARD_BATCH) {
          if (hits.length >= limit * SEARCH_CANDIDATES) {
            stopped = true;
            break;
          }
          const batch = await Promise.all(order.slice(i, i + SHARD_BATCH).map(loadShard));
          for (const shard of batch) {
            for (const item of shard) {
              const pathKey = JSON.stringify(item.entry.path);
              if (!seen.has(pathKey) && matchesWords(item.words, queryWords)) {
                seen.add(pathKey);
                hits.push(item.entry);
              }
            }
          }
        }
        const ranked = rankHits(hits, query, limit);
        if (stopped) {
          ranked.truncated = true;
          ranked.total = undefined;
        }
        return ranked;
      }
    };
  }

  function remoteSource(view) {
    const source = view.source;
    const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match));
    const getJson = async (url, type) => {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(response.status + " " + response.statusText);
      }
      return checkDocument(await response.json(), type);
    };
    return {
      kind: "remote",
      canSearch: !!source.search,
      async page(node, cursor) {
        const doc = checkPage(await getJson(fill(source.children, {
          ref: node ? encodeURIComponent(node.ref || node.id) : "",
          cursor: cursor ? encodeURIComponent(cursor) : ""
        }), "page"), node);
        return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0 };
      },
      async search(query, limit) {
        if (!source.search) {
          return { hits: [], total: 0, truncated: false };
        }
        const doc = await getJson(fill(source.search, { query: encodeURIComponent(query), limit: String(limit) }), "search");
        if (doc.query !== query) throw new Error("CanopyX: search response query does not match the request.");
        if (doc.total != null && (doc.total < doc.hits.length || doc.truncated !== (doc.total > doc.hits.length))) {
          throw new Error("CanopyX: search total and truncated flag disagree with the returned hits.");
        }
        return { hits: doc.hits, total: doc.total, truncated: doc.truncated };
      },
      counts: source.counts ? async (ids) => {
        const items = [];
        for (let i = 0; i < ids.length; i += COUNTS_BATCH) {
          const batch = ids.slice(i, i + COUNTS_BATCH).map(encodeURIComponent).join(",");
          const doc = await getJson(fill(source.counts, { ids: batch }), "counts");
          items.push.apply(items, doc.items);
        }
        return { protocol: PROTOCOL, type: "counts", items: items };
      } : null
    };
  }

  function sourceFor(view) {
    const kind = view.source && view.source.kind;
    if (kind === "sidecar") {
      return sidecarSource(view);
    }
    if (kind === "remote") {
      return remoteSource(view);
    }
    return inlineSource(view);
  }

  // ---------- tree grid: model ----------
  // Loaded nodes keep their children. The visible rows are a flat array rebuilt on every structure change, in time
  // proportional to the visible rows. Rows have a fixed height; a detail row spans several row slots.
  class TreeGrid {
    constructor(host, options) {
      const view = checkDocument(options.view, "view");
      requireIdentifier(view.id, "view ID");
      this.host = host;
      this.view = view;
      this.opts = options;
      this.id = "cx" + ++instanceSeq;
      this.source = options.source || sourceFor(view);
      this.rowH = view.rowHeight || 28;
      this.pageSize = view.pageSize || 100;
      this.multi = view.selection === "multiple";
      this.lang = document.documentElement.lang || undefined;
      this.columns = view.columns.map((column, index) => Object.assign({}, column, { hidden: index > 0 && !!column.hidden }));
      this.keyMap = new Map();
      this.root = { key: null, h: null, parent: null, level: 0, idx: 0, expanded: true, children: null, total: null, next: null, loading: false, error: null, span: 1 };
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
        // A stored expansion set takes precedence over declarative defaults. Neither restoration nor a partial
        // walk of slow defaults may write session state; user clicks made meanwhile are replayed at completion.
        await this.expandInitial(this.root);
        await this.openDeepLink();
      } finally {
        this.initializing = false;
      }
      if (this.destroyed) return;
      await this.flushPendingToggles();
      if (!this.destroyed) {
        this.host.setAttribute("data-cx-ready", "true");
        this.emit("ready", {});
      }
    }

    /** Shows the first page of top-level nodes: synchronously for inline data, from the source otherwise. */
    loadRoots() {
      if (!this.root.inlineItems) {
        return this.loadPage(this.root, null);
      }
      validateNodes(this.root.inlineItems, this.keyMap);
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
        row = parent._status = { key: null, status: kind, parent: parent, level: parent.level + 1, span: 1, h: { id: "", label: "" }, _v: 0 };
      }
      row.status = kind;
      const loaded = parent.children ? parent.children.length : 0;
      const format = numberFormat(this.lang);
      row.h.label = kind === "loading" ? "Loading…" : kind === "error" ? "Could not load: " + parent.error + " (Enter to retry)" :
        parent.total != null ? "Show more (" + format.format(loaded) + " of " + format.format(parent.total) + " loaded)" : "Show more (" + format.format(loaded) + " loaded)";
      row._v = 0;
      return row;
    }

    /** The cell for a column; the tree column falls back to the label. */
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
  // ---------- tree grid: iterative construction and initial expansion ----------
  Object.assign(TreeGrid.prototype, {
    /** Loads lazy children of nodes that start expanded without recursive tree walks. */
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
          span: data.detail ? Math.max(1, data.detail.height || 1) : 1, _v: 0
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
  // ---------- tree grid: iterative filtering, layout, and sorting ----------
  Object.assign(TreeGrid.prototype, {
    /** 2 = the node matches (its subtree shows), 1 = kept as an ancestor of matches, 0 = hidden. */
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

    relayout() {
      if (this.destroyed) return;
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
          // Unloaded matches remain reachable through their parent status row.
          if (parent.loading) rows.push(this.statusRow(parent, "loading"));
          else if (parent.error) rows.push(this.statusRow(parent, "error"));
          else if (parent.next) rows.push(this.statusRow(parent, "more"));
          pending.pop();
        }
      }
      this.rows = rows;
      const tops = new Array(rows.length + 1);
      let y = 0;
      for (let i = 0; i < rows.length; i++) {
        rows[i]._ri = i;
        tops[i] = y;
        y += rows[i].span * this.rowH;
      }
      tops[rows.length] = y;
      this.tops = tops;
      this.total = y;
      this.canvas.style.height = y + "px";
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
  // ---------- protocol node semantics before attachment ----------
  function validateNodes(nodes, existing) {
    if (!Array.isArray(nodes)) throw new Error("CanopyX: page items must be an array.");
    const seen = new Set();
    const pending = nodes.slice();
    while (pending.length) {
      const node = pending.pop();
      requireIdentifier(node && node.id, "node ID");
      if (existing.has(node.id) || seen.has(node.id)) throw new Error("CanopyX: duplicate node ID " + node.id);
      seen.add(node.id);
      if (node.ref != null) requireIdentifier(node.ref, "node reference");
      if (Object.prototype.hasOwnProperty.call(node, "childCount") &&
          (!validStructuralCount(node.childCount) || node.childCount < 1)) {
        throw new Error("CanopyX: node childCount must be a positive 32-bit integer.");
      }
      if (Array.isArray(node.children)) {
        if (node.ref != null) throw new Error("CanopyX: inline children cannot have a load reference.");
        if (node.hasChildren === false && node.children.length) throw new Error("CanopyX: inline children cannot declare a leaf.");
        if (node.childCount != null && node.childCount !== node.children.length) throw new Error("CanopyX: inline childCount must equal children length.");
        for (const child of node.children) pending.push(child);
      }
    }
  }

  /** Validates the entire incoming page before its wrappers or key map can change. */
  function validatePage(page, existing, expectedOffset) {
    if (!page || !Array.isArray(page.items)) throw new Error("CanopyX: page items must be an array.");
    const items = page.items;
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

  // ---------- tree grid: DOM scaffold and windowed rendering ----------
  Object.assign(TreeGrid.prototype, {
    build() {
      const host = this.host;
      host.classList.add("cx-host");
      if (!host.hasAttribute("data-cx-theme")) {
        host.setAttribute("data-cx-theme", "auto");
      }
      host.style.setProperty("--cx-row-h", this.rowH + "px");
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
      // Tabbing into the grid lands on the tab-stop row; adopt it so arrows start there and recycling keeps it.
      this.canvas.addEventListener("focusin", (e) => {
        const rowEl = e.target.closest(".cx-row");
        if (rowEl && rowEl._w && this.focused !== rowEl._w) {
          this.focusRevision = (this.focusRevision || 0) + 1;
          this.focused = rowEl._w;
          this.scheduleRender();
        }
      });
      global.addEventListener("beforeprint", this.onPrint);
      this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
      this.resizeObserver.observe(grid);
    },

    visibleColumns() {
      return this.columns.filter((column) => !column.hidden);
    },

    buildHeader() {
      // Rebuilding the header replaces its buttons; keep keyboard focus on the same column's sort button.
      const active = document.activeElement;
      const focusedColumn = active && this.headRow.contains(active) ? active.closest(".cx-hcell").getAttribute("data-cx-column") : null;
      const focusedResize = active && active.classList.contains("cx-resize");
      const nextCols = this.visibleColumns();
      const layoutChanged = !this.cols || this.cols.length !== nextCols.length || nextCols.some((column, i) => column !== this.cols[i]);
      this.cols = nextCols;
      this.columnIndex = this.cols.map((column) => this.columns.indexOf(column));
      // Visibility changes alter the cell skeleton; width-only changes do not.
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

    /**
     * Renders the rows in the viewport plus a small overscan and the focused row. A row that leaves the window is
     * reused for a row that enters it: its cells survive, content is updated while detached, and it is inserted in
     * visual DOM order. Rows retained in the viewport are not repainted. Positions and attributes change only as needed.
     */
    render() {
      if (this.destroyed) {
        return;
      }
      const grid = this.grid;
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      const top = grid.scrollTop;
      const n = this.rows.length;
      const first = n ? Math.max(0, this.rowAt(top) - OVERSCAN) : 0;
      const last = n ? Math.min(n - 1, this.rowAt(top + viewHeight) + OVERSCAN) : -1;
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
            // Reusing it would leave keyboard focus on a row that now shows another node.
            rowEl.remove();
            rowEl._w = null;
          } else {
            // Repaint a departing row while detached, then insert it in the new window's DOM order. Its cell
            // skeleton survives; retained rows do not need repainting or moving during downward scrolling.
            rowEl.remove();
            free.push(rowEl);
          }
        }
      }
      // With nothing focused, the tab stop is the first row inside the viewport (not an overscan row).
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
        if (this.pool.length < 200) {
          this.pool.push(rowEl);
        }
      }
      if (fragment.childNodes.length) {
        this.canvas.appendChild(fragment);
      }
      this.window = { first: first, last: last };
      // Browse-mode assistive technology reads DOM order even while wheel or touch scrolling continues.
      this.keepDomOrder(first, last);
    },

    // Screen readers in browse mode read rows in DOM order, so rows are kept (or put back) in visual order. The focused
    // row is never moved, because moving a focused element drops its focus. After in-place reuse the DOM is usually a
    // rotation of the visual order, and moving the smaller block keeps the number of restyled rows low.
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

  // ---------- tree grid: column sizing ----------
  Object.assign(TreeGrid.prototype, {
    applyWidths() {
      let sum = 0;
      this.cols.forEach((column, i) => {
        this.headCells[i].style.width = column.width + "px";
        const grip = this.headCells[i].querySelector(".cx-resize");
        grip.setAttribute("aria-label", "Resize " + column.title);
        grip.setAttribute("aria-valuenow", String(column.width));
        grip.setAttribute("aria-valuetext", column.width + " pixels");
        sum += column.width;
      });
      this.rowWidth = sum;
      this.headRow.style.width = sum + "px";
      this.canvas.style.width = sum + "px";
      // Both the original and pooled painters place grid cells directly under the row.
      // Keep recycled rows in sync without replacing host-owned cell content.
      const resizeRow = (row) => {
        row.style.width = sum + "px";
        if (!row._kind || !row.firstElementChild) return;
        if (row._kind !== "node") row.firstElementChild.style.width = sum + "px";
        else this.cols.forEach((column, i) => { if (row.children[i]) row.children[i].style.width = column.width + "px"; });
      };
      this.rendered.forEach(resizeRow);
      this.pool.forEach(resizeRow);
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

  // ---------- tree grid: row and cell painting ----------
  // A row element keeps a skeleton of cells for the current column layout. Recycling it for another node only updates
  // text nodes, classes, attributes, and badges that differ, instead of rebuilding every cell; rebuilding was what made
  // scrolling drop frames under CPU pressure in the D21 spike. The skeleton is rebuilt only when the row changes kind
  // (node, detail, status) or the columns change.
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
    /** Paints a row for a node or a status row. The row element may be recycled from another node. */
    fillRow(rowEl, w) {
      rowEl._w = w;
      const kind = w.status ? "status" : w.h.detail ? "detail" : "node";
      if (rowEl._kind !== kind || rowEl._layout !== this.layout) {
        this.buildRow(rowEl, kind);
      }
      setAttr(rowEl, "aria-level", String(w.level));
      const height = w.span * this.rowH + "px";
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
      // The attribute cache is reset with the skeleton, so drop what a node row of another kind left behind.
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
        const slot = { cell: cell, base: cell.className + (i === 0 ? " cx-tree" : ""), cls: null, title: null, badges: [], iconKey: null, iconEl: null };
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
      setClass(rowEl, "cx-row cx-detail" + (node.className ? " " + node.className : ""));
      this.paintRowState(rowEl, w);
      // Detail content (and anything a host renderDetail callback set on the cell) is rebuilt on a fresh cell.
      const old = rowEl._cells[0].cell;
      const cell = this.cell(rowEl, 0, this.rowWidth);
      rowEl.replaceChild(cell, old);
      rowEl._cells[0].cell = cell;
      cell.setAttribute("aria-colspan", String(this.cols.length));
      cell.style.paddingLeft = (w.level - 1) * INDENT + 8 + "px";
      this.renderDetail(node, cell);
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

    /** Attributes shared by node and detail rows. */
    paintRowState(rowEl, w) {
      const node = w.h;
      setAttr(rowEl, "data-cx-id", node.id);
      setAttr(rowEl, "data-kind", node.kind || null);
      setAttr(rowEl, "data-cx-status", null);
      setAttr(rowEl, "aria-selected", this.selected.has(w) ? "true" : "false");
      this.setPosition(rowEl, w);
    },

    /** Updates paging metadata without replacing a retained host control or its DOM state. */
    refreshRowState(rowEl, w) {
      setAttr(rowEl, "aria-expanded", this.expandable(w) ? (w._open ? "true" : "false") : null);
      setAttr(rowEl, "aria-busy", w.loading ? "true" : null);
      this.setPosition(rowEl, w);
      if (rowEl._kind === "node") this.paintTreeSlot(rowEl._cells[0], w);
    },

    /**
     * aria-posinset is the position among the visible siblings in display (sorted) order. aria-setsize counts children
     * that are not loaded yet; -1 means the total is unknown.
     */
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
      if (this.opts.renderCell) {
        // Host-rendered cells own their content, so they are rebuilt on every paint, from a clean cell.
        slot.cell.className = slot.base;
        slot.cell.removeAttribute("title");
        slot.cls = slot.base;
        slot.title = null;
        if (slot.content === slot.cell) {
          const old = slot.cell;
          const fresh = this.cell(old.parentNode, this.cols.indexOf(column), column.width, column.kind);
          old.replaceWith(fresh);
          slot.cell = fresh;
          slot.content = fresh;
        } else {
          const fresh = h("span", "cx-content");
          slot.content.replaceWith(fresh);
          slot.content = fresh;
        }
        slot.badges = [];
        if (this.opts.renderCell(node, column.id, slot.content, { level: w.level, expanded: w.expanded, index: index }) === true) {
          return;
        }
        slot.content.appendChild(slot.textSpan);
      }
      const text = cellText(value, column, this.lang);
      if (slot.text.data !== text) {
        slot.text.data = text;
      }
      const object = isCellObject(value);
      const cls = slot.base + (object && value.tone ? " cx-tone-" + value.tone : "");
      if (slot.cls !== cls) {
        if (this.opts.renderCell) {
          // A fallback tone augments a decorator's fresh cell instead of replacing its host classes.
          if (object && value.tone) slot.cell.classList.add("cx-tone-" + value.tone);
        } else {
          slot.cell.className = cls;
        }
        slot.cls = cls;
      }
      const title = object && value.title ? value.title : null;
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

    /** Reuses badge elements: updates the ones that exist, adds missing ones, removes extras. */
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
        const cls = "cx-badge cx-tone-" + (badge.tone || "neutral");
        if (span._cls !== cls) {
          span.className = cls;
          span._cls = cls;
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

    cell(rowEl, index, width, kind) {
      const cell = h("div", "cx-cell" + (kind ? " cx-kind-" + kind : ""));
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(index + 1));
      cell.style.width = width + "px";
      rowEl.appendChild(cell);
      return cell;
    }
  });

  // ---------- tree grid: detail rows ----------
  const detailColumn = { kind: "text" };

  function detailCell(tag, cell, lang) {
    const element = h(tag);
    setText(element, cellText(cell, detailColumn, lang));
    if (isCellObject(cell)) {
      if (cell.tone) {
        element.className = "cx-tone-" + cell.tone;
      }
      if (cell.title) {
        element.title = cell.title;
      }
      (cell.badges || []).forEach((badge) => {
        const span = h("span", "cx-badge cx-tone-" + (badge.tone || "neutral"));
        setText(span, badge.text);
        if (badge.title) span.title = badge.title;
        element.appendChild(span);
      });
    }
    return element;
  }

  Object.assign(TreeGrid.prototype, {
    /** Fills a detail row with its table, property list, or trusted host markup; a host callback can take over. */
    renderDetail(node, element, plainHtml = false) {
      if (this.opts.renderDetail && this.opts.renderDetail(node, element) === true) {
        return;
      }
      const detail = node.detail;
      const body = h("div", "cx-detail-body");
      if (detail.type === "table") {
        const table = h("table", "cx-detail-table");
        if (detail.caption) {
          const caption = h("caption");
          setText(caption, detail.caption);
          table.appendChild(caption);
        }
        const head = h("thead");
        const headRow = h("tr");
        (detail.columns || []).forEach((title) => {
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
          row.forEach((cell) => tr.appendChild(detailCell("td", cell, this.lang)));
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
          list.appendChild(detailCell("dd", item.value, this.lang));
        });
        body.appendChild(list);
      } else if (detail.type === "html") {
        if (plainHtml) setText(body, detail.html || "");
        else body.innerHTML = detail.html; // trusted host markup, see docs/data-protocol.md
      }
      element.appendChild(body);
    }
  });

  // ---------- tree grid: keyboard ----------
  // Row-focus model: Up/Down move, Right expands then enters, Left collapses then goes to the parent, Home/End,
  // PageUp/PageDown, Enter toggles and selects, Space selects (toggles with multi-select), Shift extends a multi-select,
  // printable keys run type-ahead on labels. Tab leaves the grid.
  function hostControl(target) {
    const row = target.closest(".cx-row");
    const control = target.closest("input,textarea,select,button,a,summary,[tabindex],[contenteditable]:not([contenteditable=false]),[role=button],[role=checkbox],[role=radio],[role=link],[role=textbox],[role=combobox],[role=menuitem],[role=separator]");
    return control && row && row !== control && row.contains(control) ? control : null;
  }
  Object.assign(TreeGrid.prototype, {
    onKey(e) {
      if (this.head.contains(e.target) || hostControl(e.target)) {
        return;
      }
      const w = this.focused || this.rows[0];
      if (!w) {
        return;
      }
      const i = this.indexOf(w);
      const pageHeight = Math.max(this.rowH, this.grid.clientHeight - this.head.offsetHeight - this.rowH);
      const last = this.rows.length - 1;
      // A space inside a running type-ahead term continues the term ("lab c").
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
          if (!w.status && this.expandable(w)) {
            if (!w._open) {
              this.toggle(w, true);
            } else if (this.rows[i + 1] && this.rows[i + 1].parent === w) {
              target = this.rows[i + 1];
            }
          }
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

    /** Enter or Space on a row: retry, show more, or select (and with Enter, toggle). */
    activate(w, enter) {
      if (w.status === "more") {
        this.loadMore(w.parent);
      } else if (w.status === "error") {
        this.retryPage(w);
      } else if (!w.status) {
        if (this.multi && !enter) {
          this.select(w, { toggle: true });
        } else {
          this.select(w, { deferNotify: enter && this.expandable(w) });
        }
        if (enter && this.expandable(w)) {
          this.toggle(w);
          this.notifySelection(w, Array.from(this.selected).map((selected) => selected.h));
        }
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
  // ---------- tree grid: focus ownership across status-row page requests ----------
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
          // Also retire removed status rows when another control took focus during the request.
          this.relayout();
        }
      }
    }
  });

  // ---------- tree grid: behavior ----------
  Object.assign(TreeGrid.prototype, {
    /** Opens or closes a node, judged by what the user sees: a filter can show a node open that was never expanded. */
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
        // A host load callback may throw after the page was applied; its expansion still belongs in saved state.
        if (!this.destroyed && !w._invalidated && w.toggleRevision === revision) this.stateChanged();
      }
      if (this.destroyed || w._invalidated || w.toggleRevision !== revision) return;
      this.emit("toggle", { node: w.h, expanded: w.expanded });
      if (this.opts.onToggle) {
        this.opts.onToggle(w.h, w.expanded);
      }
    },

    /** Loads the first page (cursor null) or the next page of a node's children, or of the top level. */
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
        try {
          const inlineItems = w === this.root ? this.root.inlineItems : w.inline ? w.h.children : null;
          const page = inlineItems ? slicePage(inlineItems, cursor, this.pageSize) : await this.source.page(w === this.root ? null : w.h, cursor);
          if (this.destroyed || w._invalidated) return;
          const items = validatePage(page, this.keyMap, cursor ? (w.children || []).length : 0);
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
          // Paging changes sibling metadata, not retained host cell content.
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
            } else if (loaded === count) {
              w.next = null;
              w.error = null;
            }
            if (!count && !loaded) w.expanded = false;
            w.pendingChildCount = null;
          }
          if (!this.destroyed && !w._invalidated) this.relayout();
        }
        // A newer count can discard an older page during reconciliation. Only announce and notify
        // the host after the page is known to remain attached to the tree.
        if (appliedCount != null && !this.destroyed && !w._invalidated && w.children) {
          const loaded = w.children.length;
          const format = numberFormat(this.lang);
          this.announce(w.total != null && loaded < w.total ? format.format(loaded) + " of " + format.format(w.total) + " loaded" : format.format(loaded) + " items");
          info = { node: w.h, count: appliedCount, total: w.total, ms: performance.now() - started };
        }
        if (removedSelection) this.selectionChanged(removedSelection);
        // Host callback failures do not turn an applied page into a source failure.
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
      this.render();
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
      const height = w.span * this.rowH;
      const viewHeight = grid.clientHeight - this.head.offsetHeight;
      if (y < grid.scrollTop) {
        grid.scrollTop = y;
      } else if (y + height > grid.scrollTop + viewHeight) {
        grid.scrollTop = y + height - viewHeight;
      }
    },

    rowFromEvent(e) {
      const rowEl = e.target.closest(".cx-row");
      return rowEl && rowEl._w ? rowEl._w : null;
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

    /** Opens a node for expandPath and throws when its children cannot be loaded. */
    async openForPath(w) {
      if (this.destroyed || w._invalidated) return false;
      const wasOpen = w.expanded && !w.filterCollapsed;
      w.expanded = true;
      w.filterCollapsed = false;
      const revision = w.toggleRevision || 0;
      if (!w.children) {
        await this.loadPage(w, null);
        if (this.destroyed || w._invalidated || !w.expanded || (w.toggleRevision || 0) !== revision) return false;
        if (!w.children) {
          throw new Error("CanopyX: could not load the children of '" + w.key + "': " + (w.error || "no data"));
        }
      } else if (!wasOpen) {
        await this.expandInitial(w);
      }
      return !this.destroyed && !w._invalidated && w.expanded && (w.toggleRevision || 0) === revision;
    },

    /**
     * Expands the tree along an id path, paging through "show more" until each id is loaded. Options: select and
     * focus (default true), reveal (scroll to the node, default true), expandLast (also open the last node),
     * signal (AbortSignal; cancelled navigation returns null without selecting or focusing).
     */
    async expandPath(ids, options) {
      const o = options || {};
      const cancelled = () => this.destroyed || !!(o.signal && o.signal.aborted);
      if (cancelled()) return null;
      await this.rootsReady;
      if (cancelled()) return null;
      let parent = this.root;
      let w = null;
      const opened = [];
      for (let k = 0; k < ids.length; k++) {
        if (parent !== this.root) {
          try { if (!await this.openForPath(parent)) return null; }
          catch (err) { if (cancelled() || parent._invalidated) return null; throw err; }
          opened.push([parent, parent.toggleRevision || 0]);
        }
        if (cancelled() || parent._invalidated || (parent !== this.root && !parent.expanded)) return null;
        w = this.keyMap.get(ids[k]);
        const seenCursors = new Set();
        while ((!w || w.parent !== parent) && parent.children && parent.next) {
          const before = parent.children.length;
          const cursor = parent.next;
          if (seenCursors.has(cursor)) {
            throw new Error("CanopyX: could not load more children of '" + (parent.key || "the top level") + "': no progress (continuation repeated)");
          }
          seenCursors.add(cursor);
          await this.loadPage(parent, parent.next);
          if (cancelled() || parent._invalidated || (parent !== this.root && (!parent.expanded || (parent.toggleRevision || 0) !== opened[opened.length - 1][1]))) return null;
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
        try { if (!await this.openForPath(w)) return null; }
        catch (err) { if (cancelled() || w._invalidated) return null; throw err; }
        opened.push([w, w.toggleRevision || 0]);
      }
      if (cancelled() || (w && w._invalidated) || opened.some(([node, revision]) =>
        node._invalidated || !node.expanded || (node.toggleRevision || 0) !== revision)) return null;
      this.relayout();
      if (w && o.reveal !== false && this.filter && this.indexOf(w) < 0) {
        this.activeFilters.clear();
        this.toolbar.querySelectorAll("[data-cx-filter]").forEach((input) => { input.checked = false; });
        this.setFilter(null);
      }
      this.relayout();
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

    /** Sets a filter: a predicate over nodes, or { match, keep } for ancestor hints; null clears it. */
    setFilter(filter, options) {
      this.filter = typeof filter === "function" ? { match: filter } : filter || null;
      this.filterExpand = !!(options && options.autoExpand);
      this.keyMap.forEach((w) => { w.filterCollapsed = false; });
      this.relayout();
    },

    /** Turns a declarative flag filter from the view on or off; active filters must all match. */
    setFilterActive(id, active) {
      if (active) {
        this.activeFilters.add(id);
      } else {
        this.activeFilters.delete(id);
      }
      const input = Array.from(this.toolbar.querySelectorAll("[data-cx-filter]")).find((el) => el.getAttribute("data-cx-filter") === id);
      if (input) {
        input.checked = !!active;
      }
      const filters = (this.view.filters || []).filter((f) => this.activeFilters.has(f.id));
      const has = (node, flag) => !!(flag && node.flags && node.flags.indexOf(flag) >= 0);
      this.setFilter(filters.length ? {
        match: (node) => filters.every((f) => has(node, f.flag)),
        keep: (node) => filters.every((f) => has(node, f.flag) || has(node, f.ancestorFlag))
      } : null, { autoExpand: true });
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
  // ---------- tree grid: selection and deep-link ownership ----------
  Object.assign(TreeGrid.prototype, {
    /** Selects a row. Options: toggle (Ctrl/Cmd or Space with multi-select), range (Shift). */
    select(w, options) {
      if (!w || w.status) {
        return;
      }
      const o = options || {};
      if (this.multi && o.range && this.anchor) {
        this.selectRange(w);
        return;
      }
      if (this.multi && o.toggle) {
        if (this.selected.has(w)) {
          this.selected.delete(w);
        } else {
          this.selected.add(w);
        }
      } else {
        this.selected = new Set([w]);
      }
      this.anchor = w;
      this.selectionChanged(w, !o.deferNotify);
    },

    selectRange(w) {
      const from = this.indexOf(this.anchor);
      const to = this.indexOf(w);
      if (from < 0 || to < 0) {
        this.select(w);
        return;
      }
      this.selected = new Set();
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
        if (!this.rows[i].status) {
          this.selected.add(this.rows[i]);
        }
      }
      this.selectionChanged(w);
    },

    selectionChanged(w, notify = true) {
      for (const [node, row] of this.rendered) {
        if (!node.status) setAttr(row, "aria-selected", this.selected.has(node) ? "true" : "false");
      }
      this.scheduleRender();
      const nodes = Array.from(this.selected).map((s) => s.h);
      this.writeDeepLink(this.selected.has(w) ? w : Array.from(this.selected).pop());
      if (notify) this.notifySelection(w, nodes);
    },

    notifySelection(w, nodes) {
      this.emit("select", { node: w.h, nodes: nodes });
      if (this.opts.onSelect) {
        this.opts.onSelect(w.h, nodes);
      }
    }
  });

  // ---------- tree grid: toolbar (search box, filter switches, column chooser) ----------
  Object.assign(TreeGrid.prototype, {
    buildToolbar() {
      const bar = this.toolbar;
      let any = false;
      if (this.view.search && this.source.canSearch) {
        this.buildSearch(bar, this.view.search);
        any = true;
      }
      (this.view.filters || []).forEach((filter) => {
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

    /** Combobox search: typing lists hits, arrows move through them, Enter expands the tree to the chosen hit. */
    buildSearch(bar, options) {
      const box = h("div", "cx-search");
      const input = h("input", "cx-search-input");
      const list = h("ul", "cx-results");
      const status = h("span", "cx-sr-only");
      list.id = this.id + "-results";
      list.hidden = true;
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", "Search results");
      input.type = "search";
      input.placeholder = options.placeholder || "Search";
      input.setAttribute("aria-label", options.placeholder || "Search");
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
          if (!this.destroyed && !current.signal.aborted) setText(status, err.message);
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
        input.setAttribute("aria-expanded", hits.length ? "true" : "false");
        setText(status, hits.length ? hits.length + (result.truncated ? " of " + (result.total || "many") : "") + " results" : "No results");
      };
      const run = async () => {
        if (this.destroyed) return;
        const query = trimSeparators(input.value);
        if (query.length < options.minLength) {
          sequence++;
          close();
          setText(status, query ? "Type at least " + options.minLength + " characters" : "");
          return;
        }
        const mine = ++sequence;
        try {
          const result = await this.source.search(query, options.maxResults);
          if (!this.destroyed && mine === sequence) {
            show(result);
          }
        } catch (err) {
          if (!this.destroyed && mine === sequence) {
            setText(status, "Search failed: " + (err && err.message ? err.message : err));
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
        // Results for the previous text are stale as soon as the text changes; Enter waits for the new ones.
        clearTimeout(timer);
        hits = [];
        close();
        timer = setTimeout(run, 150);
      });
      input.addEventListener("keydown", (e) => {
        if (e.isComposing) return;
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

    /** A native disclosure with one checkbox per hideable column; the tree column always stays. */
    buildColumnChooser(bar) {
      const details = h("details", "cx-columns");
      const summary = h("summary");
      setText(summary, "Columns");
      const group = h("fieldset", "cx-columns-list");
      const legend = h("legend", "cx-sr-only");
      setText(legend, "Visible columns");
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
    }
  });

  // ---------- tree grid: remembered state, deep links, outline, counts ----------
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
      // Invalid or obsolete stored state must not clear current expansion or reject ready.
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
      // Clicks queued for an older restoration cannot override this state.
      this.pendingRestorationToggles = null;
      this.restoring = true;
      clearTimeout(this.saveTimer);
      const before = new Map();
      this.keyMap.forEach((w) => before.set(w, [w.expanded, w.autoExpand, w.filterCollapsed]));
      let restored = 0;
      let fallback = false;
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
            // A missing node is obsolete; a failed lazy load still owns its open error row.
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
          // Storage can be unavailable (private mode, blocked storage).
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

    deepLinkName() {
      return "cx." + encodeURIComponent(this.view.id);
    },

    hashParams() {
      return (global.location.hash || "").replace(/^#/, "").split("&").filter(Boolean);
    },

    async openDeepLink() {
      if (!this.view.deepLink) {
        return;
      }
      const prefix = this.deepLinkName() + "=";
      const param = this.hashParams().find((p) => p.startsWith(prefix));
      if (!param) {
        return;
      }
      try {
        const ids = param.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent);
        await this.expandPath(ids, { select: true, focus: false });
      } catch (e) {
        this.announce(e.message);
      }
    },

    writeDeepLink(w) {
      if (!this.view.deepLink) {
        return;
      }
      const prefix = this.deepLinkName() + "=";
      const params = this.hashParams().filter((p) => !p.startsWith(prefix));
      if (w) params.push(prefix + this.pathOf(w).map(encodeURIComponent).join("/"));
      const hash = "#" + params.join("&");
      try {
        global.history.replaceState(global.history.state, "", hash);
      } catch (e) {
        global.location.hash = hash;
      }
    },

    visibleRows() {
      return this.rows.filter((w) => !w.status).map((w) => ({ node: w.h, level: w.level, path: this.pathOf(w) }));
    },

    /** An indented outline table of the rows that are open, for print and hosts that export what the user sees. */
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
          const text = cellText(value, column, this.lang);
          const content = h("span");
          if (!this.opts.renderCell || this.opts.renderCell(w.h, column.id, content, { level: w.level, expanded: w.expanded, index }) !== true) {
            const badges = (i === 0 ? w.h.badges || [] : []).concat(isCellObject(value) ? value.badges || [] : []);
            content.appendChild(detailCell("span", Object.assign({}, isCellObject(value) ? value : {}, { text, badges }), this.lang));
          }
          out.push("<td" + (i === 0 ? pad : "") + ">" + content.outerHTML + "</td>");
        });
        out.push("</tr>");
      });
      out.push("</tbody></table>");
      return out.join("");
    },

    /** Applies a counts document to loaded nodes: child counts, rollup cells, and flags. */
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
      w._v = 0;
      return removedSelection;
    },

    applyCounts(doc, fromRefresh = false) {
      if (this.destroyed) return;
      checkDocument(doc, "counts");
      let removedSelection = null;
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
        w._v = 0;
        if (typeof item.childCount === "number") {
          w.h.childCount = item.childCount;
          w.total = item.childCount;
          if (!w.inline) {
            w.h.hasChildren = item.childCount > 0;
            const loaded = w.children ? w.children.length : 0;
            if (w.loading) w.pendingChildCount = item.childCount;
            else if (item.childCount < loaded || (item.childCount > loaded && w.children && !w.next))
              removedSelection = this.invalidateChildren(w) || removedSelection;
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
      this.relayout();
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
      if (this.restoreController) this.restoreController.abort();
      if (this.cancelResize) this.cancelResize();
      clearTimeout(this.saveTimer);
      if (this.cancelSearch) this.cancelSearch();
      cancelAnimationFrame(this.rafId);
      this.resizeObserver.disconnect();
      this.grid.removeEventListener("scroll", this.onScroll);
      global.removeEventListener("beforeprint", this.onPrint);
      [this.toolbar, this.grid, this.live, this.outline].forEach((element) => element.remove());
      this.host.removeAttribute("data-cx-ready");
      this.host.removeAttribute("data-canopyx-mounted");
    }
  });

  // ---------- public API and auto-mount ----------
  /**
   * Creates a tree grid in a host element.
   * @param {HTMLElement} host The element that receives the grid.
   * @param {{ view: object, source?: object, renderCell?: Function, renderDetail?: Function,
   *           onSelect?: Function, onToggle?: Function, onLoad?: Function }} options
   *   `view` is a canopyx/1 view document. Callbacks are optional; the same events are also dispatched on the host
   *   as canopyx:select, canopyx:toggle, canopyx:load, canopyx:error, and canopyx:ready.
   *   renderCell(node, columnId, element, context) returns true when it drew the cell itself; context.index is the
   *   column's position in view.columns. renderDetail(node, element) returns true when it drew the detail row.
   */
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
      setFilter: (filter, o) => grid.setFilter(filter, o),
      setFilterActive: (id, active) => grid.setFilterActive(id, active),
      sort: (columnId, direction) => grid.sort(columnId, direction),
      setColumnVisible: (columnId, visible) => grid.setColumnVisible(columnId, visible),
      refresh: () => { grid.version++; grid.scheduleRender(); },
      getSelected: () => Array.from(grid.selected).map((w) => w.h),
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
      search: (query, limit) => grid.source.search(query, limit || (grid.view.search && grid.view.search.maxResults) || 20),
      loadMore: (id) => {
        const w = id == null ? grid.root : grid.keyMap.get(id);
        return w ? grid.loadMore(w) : Promise.resolve();
      },
      applyCounts: (doc) => grid.applyCounts(doc),
      refreshCounts: (ids) => grid.refreshCounts(ids),
      destroy: () => {
        grid.destroy();
        if (activeGrids.get(host) === api) activeGrids.delete(host);
      }
    });
    activeGrids.set(host, api);
    host.setAttribute("data-canopyx-mounted", "true");
    host.canopyx = api;
    return api;
  }

  /** Mounts every [data-canopyx-host] element under root that has a JSON configuration script. */
  function mount(root) {
    const scope = root || document;
    const created = [];
    const showError = (host, err, api) => {
      if (api) {
        api.destroy();
        if (host.canopyx === api) delete host.canopyx;
      }
      const message = err && err.message ? err.message : String(err);
      const notice = document.createElement("div");
      notice.className = "cx-mount-error";
      notice.setAttribute("role", "alert");
      setText(notice, "This view could not be displayed: " + message);
      host.classList.add("cx-host");
      host.setAttribute("data-canopyx-mounted", "true");
      host.setAttribute("data-cx-error", message);
      host.appendChild(notice);
      if (global.console) global.console.error(err);
    };
    scope.querySelectorAll("[data-canopyx-host]:not([data-canopyx-mounted])").forEach((host) => {
      const config = host.querySelector("script.cx-config");
      if (!config) {
        return;
      }
      host.setAttribute("data-canopyx-mounted", "true");
      try {
        const api = createTreeGrid(host, { view: JSON.parse(config.textContent) });
        created.push(api);
        api.ready.catch((err) => {
          if (activeGrids.get(host) === api && host.canopyx === api) showError(host, err, api);
        });
      } catch (err) {
        showError(host, err);
      }
    });
    return created;
  }

  global.CanopyX = Object.freeze({
    protocol: PROTOCOL,
    createTreeGrid: createTreeGrid,
    mount: mount,
    sources: Object.freeze({ inline: inlineSource, sidecar: sidecarSource, remote: remoteSource })
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(document));
  } else {
    mount(document);
  }
})(typeof window !== "undefined" ? window : this);

/* CanopyX: canopyx/2. */
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
const PACK_CACHE_BYTES = 2 * 1024 * 1024;
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
if (Object.prototype.hasOwnProperty.call(doc, "revision")) requireIdentifier(doc.revision, "dataset revision");
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
if (numberFormats.size >= 16) numberFormats.delete(numberFormats.keys().next().value);
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
let DEFAULT_LABELS = Object.freeze({
searchPlaceholder: "Search", searchResults: "Search results", searchResultCount: "{count} results",
searchResultCountOfTotal: "{count} of {total} results", searchResultCountOfMany: "{count} of many results",
searchNoResults: "No results", searchTooShort: "Type at least {min} characters",
searchWordTooShort: "Type a word of at least {min} characters", searchFailed: "Search failed: {error}",
columns: "Columns", visibleColumns: "Visible columns", resizeColumn: "Resize {column}", columnWidth: "{width} pixels",
loading: "Loading…", loadError: "Could not load: {error} (Enter to retry)",
queryFailed: "Could not update the view: {error}",
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
const EXTRA_FOLD_PAIRS = "//9BAGEAGgABAP//wADgABcAAQD//9gA+AAHAAEA//8AAQEBGAACAP//MgEzAQMAAgD//zkBOgEIAAIA//9KAUsBFwACAHgB/wD//3kBegEDAAIAgQFTAoIBgwGEAYUBhgFUAocBiAGJAVYCigFXAosBjAGOAd0BjwFZApABWwKRAZIBkwFgApQBYwKWAWkClwFoApgBmQGcAW8CnQFyAp8BdQL//6ABoQEDAAIApgGAAqcBqAGpAYMCrAGtAa4BiAKvAbABsQGKArIBiwKzAbQBtQG2AbcBkgK4AbkBvAG9AcQBxgHFAcYBxwHJAcgByQHKAcwB///LAcwBCQACAP//3gHfAQkAAgDxAfMB8gHzAfQB9QH2AZUB9wG/Af//+AH5ARQAAgAgAp4B//8iAiMCCQACADoCZSw7AjwCPQKaAT4CZixBAkICQwKAAUQCiQJFAowC//9GAkcCBQACAHADcQNyA3MDdgN3A38D8wOGA6wD//+IA60DAwABAIwDzAOOA80DjwPOA///kQOxAxEAAQD//6MDwwMJAAEAzwPXA///2APZAwwAAgD0A7gD9wP4A/kD8gP6A/sD///9A3sDAwABAP//AARQBBAAAQD//xAEMAQgAAEA//9gBGEEEQACAP//igSLBBsAAgDABM8E///BBMIEBwACAP//0ATRBDAAAgD//zEFYQUmAAEA//+gEAAtJgABAMcQJy3NEC0t//+gE3CrUAABAP//8BP4EwYAAQCJHIoc//+QHNAQKwABAP//vRz9EAMAAQD//wAeAR5LAAIAnh7fAP//oB6hHjAAAgD//wgfAB8IAAEA//8YHxAfBgABAP//KB8gHwgAAQD//zgfMB8IAAEA//9IH0AfBgABAP//WR9RHwQAAgD//2gfYB8IAAEA//+IH4AfCAABAP//mB+QHwgAAQD//6gfoB8IAAEAuB+wH7kfsR+6H3Afux9xH7wfsx///8gfch8EAAEAzB/DH9gf0B/ZH9Ef2h92H9sfdx/oH+Af6R/hH+ofeh/rH3sf7B/lH/gfeB/5H3kf+h98H/sffR/8H/MfJiHJAyohawArIeUAMiFOIf//YCFwIRAAAQCDIYQh//+2JNAkGgABAP//ACwwLDAAAQBgLGEsYixrAmMsfR1kLH0C//9nLGgsAwACAG0sUQJuLHECbyxQAnAsUgJyLHMsdSx2LH4sPwJ/LEAC//+ALIEsMgACAOss7CztLO4s8izzLP//QKZBphcAAgD//4CmgaYOAAIA//8ipyOnBwACAP//Mqczpx8AAgB5p3qne6d8p32neR3//36nf6cFAAIAi6eMp42nZQKQp5GnkqeTp///lqeXpwoAAgCqp2YCq6dcAqynYQKtp2wCrqdqArCnngKxp4cCsqedArOnU6v//7SntacIAAIAxKeUp8WnggLGp44dx6fIp8mnyqfLp2QCzKfNp9Cn0af//9an16cDAAIA3KebAfWn9qf//yH/Qf8aAAEA";
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
function recentCache(limit, loadDoc, maxBytes = Infinity, bytesOf = () => 0) {
const cache = new Map();
let bytes = 0;
const get = (key) => {
let entry = cache.get(key);
if (entry) {
cache.delete(key);
} else {
entry = { pending: loadDoc(key), ready: false, bytes: 0 };
entry.pending.then(doc => {
if (cache.get(key) !== entry) return;
entry.ready = true; entry.bytes = bytesOf(doc); bytes += entry.bytes;
for (const [oldKey, old] of cache) {
if (cache.size <= limit && bytes <= maxBytes) break;
if (old.ready) { cache.delete(oldKey); bytes -= old.bytes; }
}
}, () => { if (cache.get(key) === entry) cache.delete(key); });
}
cache.set(key, entry);
return entry.pending;
};
get.clear = () => { cache.clear(); bytes = 0; };
return get;
}
const packBytes = pages => pages.reduce((bytes, text) => bytes + (typeof text === "string" ? text.length * 2 : 0), 0);
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
if (!Array.isArray(doc.pages) || doc.pages.some(text => typeof text !== "string")) throw badIndex("pack");
return doc.pages;
}, PACK_CACHE_BYTES, packBytes);
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
if (!Array.isArray(doc.pages) || doc.pages.some(text => typeof text !== "string")) throw new Error("CanopyX: pack pages must be an array of strings.");
return doc.pages;
}, PACK_CACHE_BYTES, packBytes);
const pinned = new Map();
let releaseLoose;
const packOf = async (ref) => {
const packed = /^p\/(0|[1-9]\d*)#(0|[1-9]\d*)$/.exec(ref);
return packed && (await manifest()).packs !== undefined ? packed : null;
};
const loadPage = async (ref) => {
const packed = await packOf(ref);
if (!packed) {
const entry = pinned.get("file:" + ref);
return entry ? entry.pending : load(ref);
}
const entry = pinned.get("pack:" + packed[1]);
const text = Number(packed[1]) < (await manifest()).packs ? (await (entry ? entry.pending : loadPack(packed[1])))[Number(packed[2])] : undefined;
if (typeof text !== "string") throw new Error("CanopyX: the bundle has no packed page " + ref + ".");
return JSON.parse(text);
};
const hints = new Map();
return {
kind: "sidecar",
canSearch: true,
manifest: manifest,
async prefetch(opens, finds, request) {
const held = new Set(), signal = request && request.signal;
let live = true;
const release = () => {
if (!live) return;
live = false;
if (signal) signal.removeEventListener("abort", release);
for (const entry of held) if (!--entry.users && pinned.get(entry.key) === entry) pinned.delete(entry.key);
held.clear();
};
if (signal) {
if (signal.aborted) { release(); return release; }
signal.addEventListener("abort", release, { once: true });
} else {
if (releaseLoose) releaseLoose();
releaseLoose = release;
}
const refs = new Set();
opens.forEach((id) => { const hint = hints.get(id); if (hint && hint.ref) refs.add(hint.ref); });
finds.forEach((id) => { const hint = hints.get(id); if (hint && hint.at) refs.add(hint.at); });
await Promise.all(Array.from(refs, async (ref) => {
const packed = await packOf(ref);
if (!live) return;
const key = packed ? "pack:" + packed[1] : "file:" + ref;
let entry = pinned.get(key);
if (!entry) {
entry = { key, users: 0, pending: packed ? loadPack(packed[1]) : load(ref) };
pinned.set(key, entry);
entry.pending.catch(() => { if (pinned.get(key) === entry) pinned.delete(key); });
}
if (!held.has(entry)) { held.add(entry); entry.users++; }
await entry.pending;
}).map((pending) => pending.catch(() => {})));
return release;
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
if (source.queryAware !== undefined && typeof source.queryAware !== "boolean") throw new Error("CanopyX: queryAware must be a boolean.");
if (source.queryAware) for (const name of ["children", "search", "counts"]) {
if (source[name] != null && !/^[^#]*\{viewQuery\}/.test(source[name])) throw new Error("CanopyX: query-aware " + name + " needs {viewQuery} before its fragment.");
}
const settings = options || {};
const timeoutMs = settings.timeoutMs === undefined ? 30000 : settings.timeoutMs;
if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
throw new Error("CanopyX: request timeout must be an integer from 1 to 2147483647 milliseconds.");
}
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match));
const getJson = (url, type, request) => remoteJson(url, type, timeoutMs, settings.signal, request && request.signal);
const queryValues = request => {
if (!source.queryAware) return {};
if (!request || !request.query || request.query.version !== 1) throw new Error("CanopyX: a query-aware request needs a view query.");
return { viewQuery: encodeURIComponent(JSON.stringify(request.query)), revision: encodeURIComponent(request.revision || "") };
};
return {
kind: "remote",
queryAware: source.queryAware === true,
canSearch: !!source.search,
async page(node, cursor, request) {
const doc = checkPage(await getJson(fill(source.children, Object.assign(queryValues(request), {
ref: node ? encodeURIComponent(node.ref || node.id) : "",
cursor: cursor ? encodeURIComponent(cursor) : ""
})), "page", request), node);
return { items: doc.items, total: doc.total, next: doc.next || null, offset: doc.offset || 0, revision: doc.revision };
},
async search(query, limit, request) {
if (!source.search) {
return { hits: [], total: 0, truncated: false, revision: request && request.revision };
}
const doc = await getJson(fill(source.search, Object.assign(queryValues(request), { query: encodeURIComponent(query), limit: String(limit) })), "search", request);
if (doc.query !== query) throw new Error("CanopyX: search response query does not match the request.");
if (doc.total != null && (doc.total < doc.hits.length || doc.truncated !== (doc.total > doc.hits.length))) {
throw new Error("CanopyX: search total and truncated flag disagree with the returned hits.");
}
return { hits: doc.hits, total: doc.total, truncated: doc.truncated, revision: doc.revision };
},
counts: source.counts ? async (ids, request) => {
const items = [];
let revision = request && request.revision;
for (let i = 0; i < ids.length; i += COUNTS_BATCH) {
const batch = ids.slice(i, i + COUNTS_BATCH).map((id) => encodeURIComponent(encodeURIComponent(id))).join(",");
const doc = await getJson(fill(source.counts, Object.assign(queryValues(request), { ids: batch })), "counts", request);
if (source.queryAware) revision = snapshotRevision(doc, revision);
items.push.apply(items, doc.items);
}
return Object.assign({ protocol: PROTOCOL, type: "counts", items: items }, source.queryAware ? { revision } : {});
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
this.queryAware = this.source.queryAware === true;
this.dataLifetime = new AbortController();
this.acceptedQuery = Object.freeze({ version: 1, sort: null, filters: Object.freeze([]) });
this.datasetRevision = null;
this.rowH = view.rowHeight || 28;
this.pageSize = view.pageSize || 100;
this.retainedNodeLimit = options.retainedNodeLimit === undefined ? 1024 : options.retainedNodeLimit;
if (!validStructuralCount(this.retainedNodeLimit)) throw new Error("CanopyX: retainedNodeLimit must be a nonnegative 32-bit integer.");
this.inactiveNodeLimit = options.inactiveNodeLimit === undefined ? 4096 : options.inactiveNodeLimit;
if (!validStructuralCount(this.inactiveNodeLimit)) throw new Error("CanopyX: inactiveNodeLimit must be a nonnegative 32-bit integer.");
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
if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
const navigation = navigationScope(this, this.dataLifetime.signal);
try {
const result = await navigation.wait(this.source.search(query, limit, this.sourceRequest(this.dataLifetime.signal)));
if (navigation.cancelled()) throw new DOMException("Search snapshot was retired.", "AbortError");
if (this.queryAware) snapshotRevision(result, this.datasetRevision);
return validateSearchResult(result);
} finally { navigation.dispose(); }
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
if (!this.linkChanged || !this.linkChanged.aborted) await this.openDeepLink();
} finally {
this.initializing = false;
}
if (this.destroyed) return;
await this.flushPendingToggles();
if (this.linkChanged && !this.linkChanged.aborted) await this.openDeepLink();
if (!this.destroyed) {
this.host.setAttribute("data-cx-ready", "true");
this.emit("ready", {});
this.scheduleRender();
}
}
loadRoots() {
if (!this.root.inlineItems) {
return this.loadPage(this.root, null);
}
validateNodes(this.root.inlineItems, this.keyMap, true);
this.root.inline = true;
const first = this.inlinePage(this.root, null);
this.root.children = first.items.map((node, i) => this.wrap(node, this.root, first.positions[i]));
this.root.total = first.total;
this.root.next = first.next;
this.applySort(this.root, false);
this.relayout();
return Promise.resolve();
}
expandable(w) {
return !!(w && w.h && !w.h.detail && (w.h.hasChildren || (w.children && w.children.length) || (w.inline && w.h.children.length)));
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
function nodeContent(node) {
return JSON.stringify([node.label, node.kind, node.icon, node.cells, node.badges, node.flags, node.detail, node.data]);
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
createWrapper(data, owner, position) {
requireIdentifier(data.id, "node ID");
if (data.ref != null) requireIdentifier(data.ref, "node reference");
const w = {
key: data.id, h: data, parent: owner, level: owner.level + 1, idx: position, expanded: false,
children: null, total: null, next: null, inline: false, loading: false, error: null,
hpx: data.detail ? this.detailHeight(data.detail) : this.rowH, auto: !!data.detail && !(data.detail.height > 0), _v: 0,
content: nodeContent(data)
};
this.keyMap.set(data.id, w);
return w;
},
wrap(node, parent, index, suppressExpansion) {
const initialExpansion = !suppressExpansion && !this.restoring;
const root = this.createWrapper(node, parent, index);
const pending = [root];
while (pending.length) {
const w = pending.pop();
const data = w.h;
if (Array.isArray(data.children)) {
w.inline = true;
const first = this.inlinePage(w, null);
w.children = first.items.map((child, i) => this.createWrapper(child, w, first.positions[i]));
w.total = first.total;
w.next = first.next;
w.expanded = !!data.expanded && initialExpansion && w.children.length > 0;
for (let i = w.children.length - 1; i >= 0; i--) pending.push(w.children[i]);
this.applySort(w, false);
this.rememberInactive(w);
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
const top = this.logicalTop();
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
this.syncScrollRange(top);
},
applySort(parent, deep) {
if (this.queryAware) return;
const pending = [parent];
while (pending.length) {
const owner = pending.pop();
let children = owner.children;
if (!children) continue;
if (owner.inline) {
const first = this.inlinePage(owner, null, children.length || this.pageSize);
if (first.items.some((node, index) => !children[index] || children[index].key !== node.id) || first.items.length !== children.length) {
this.retirePage(owner);
this.reconcileList(owner, first.items, first.total, first.next, first.positions, true);
children = owner.children;
}
}
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
const all = this.modelChildren(owner);
for (let i = all.length - 1; i >= 0; i--) pending.push(all[i]);
}
}
this.trimInlineCache();
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
if (page.revision !== undefined) requireIdentifier(page.revision, "dataset revision");
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
modelChildren(w) {
const children = w.children || [];
return w.inlineCache && w.inlineCache.size ? children.concat(Array.from(w.inlineCache.values())) : children;
},
inlinePage(w, cursor, count, supplied) {
const source = supplied || (w === this.root ? w.inlineItems : w.h.children);
let order = w.inlineOrder;
const version = this.inlineOrderVersion || 0, generation = w.dataGeneration || 0;
if (!order || order.source !== source || order.version !== version || order.generation !== generation) {
const indices = Uint32Array.from({ length: source.length }, (_, index) => index);
const state = !this.queryAware && this.sortState, column = state && this.columns.find(c => c.id === state.column);
if (column) {
const columnIndex = this.columns.indexOf(column), direction = state.direction === "desc" ? -1 : 1;
const keys = source.map(node => sortKey(this.cellOf(node, column, columnIndex), column));
indices.sort((a, b) => compareKeys(keys[a], keys[b], direction) || a - b);
}
order = w.inlineOrder = { source, indices, version, generation };
}
const offset = cursor ? Number(cursor) : 0, end = Math.min(source.length, offset + (count || this.pageSize));
const positions = Array.from(order.indices.subarray(offset, end));
return { items: positions.map(index => source[index]), positions, total: source.length,
offset, next: end < source.length ? String(end) : null };
},
inlineReplacement(owner, items, positions) {
const source = owner === this.root ? owner.inlineItems : owner.h.children;
const prior = new Map(this.modelChildren(owner).map(w => [w.key, w]));
const attached = new Set(items.map(node => node.id)), cached = [], extraPositions = [];
source.forEach((data, index) => {
if (prior.has(data.id) && !attached.has(data.id)) { cached.push(data); extraPositions.push(index); }
});
return { items: items.concat(cached), positions: (positions || items.map((_, index) => index)).concat(extraPositions), attached: items.length };
},
retainInline(w, cached) {
const retained = this.inlineRetained || (this.inlineRetained = new Map());
w._cached = cached;
if (cached) { retained.delete(w.key); retained.set(w.key, w); }
else retained.delete(w.key);
},
trimInlineCache() {
const retained = this.inlineRetained;
if (!retained || !retained.size) return;
const groups = [];
let size = 0;
for (const w of retained.values()) {
if (w._invalidated || !w._cached) { retained.delete(w.key); continue; }
let ancestor = w.parent;
while (ancestor && !ancestor._cached) ancestor = ancestor.parent;
if (ancestor) continue;
const nodes = [w].concat(Array.from(this.descendants(w).values()));
size += nodes.length; groups.push({ w, nodes });
}
for (const group of groups) {
if (size <= this.retainedNodeLimit) break;
if (group.nodes.some(w => this.cachePinned(w))) continue;
group.w.parent.inlineCache.delete(group.w.key);
for (const w of group.nodes) this.retireWrapper(w);
size -= group.nodes.length;
}
}
});
Object.assign(TreeGrid.prototype, {
cachePinned(w) {
const focus = this.focused;
const filter = this.filter;
return w.expanded || w.autoExpand || w.loading || w.reloadController || this.selected.has(w) ||
w === (focus && focus.status ? focus.parent : focus) || w === this.anchor ||
this.pendingRestorationToggles && this.pendingRestorationToggles.has(w) ||
filter && (filter.match(w.h) || filter.keep && filter.keep(w.h));
},
rememberInactive(w) {
if (this.destroyed || w._invalidated) return;
const cache = this.inactiveCache || (this.inactiveCache = new Set());
cache.delete(w);
if (w !== this.root && w.children && (w.children.length || w.inlineCache && w.inlineCache.size) && !w.expanded) cache.add(w);
this.cacheDirty = true;
},
trimInactiveCache() {
if (!this.cacheDirty || this.destroyed || this.initializing || this.restoring || this.replayingToggles || this.layoutHolds) return;
this.cacheDirty = false;
this.trimInlineCache();
const cache = this.inactiveCache;
if (!cache || !cache.size) return;
const groups = [];
let size = 0;
for (const w of cache) {
if (w._invalidated || !w.children || w.expanded) { cache.delete(w); continue; }
}
for (const w of cache) {
let ancestor = w.parent;
while (ancestor && !cache.has(ancestor)) ancestor = ancestor.parent;
if (ancestor) continue;
const nodes = Array.from(this.descendants(w).values());
groups.push({ w, nodes }); size += nodes.length;
}
for (const { w, nodes } of groups) {
if (size <= this.inactiveNodeLimit) break;
if (w.loading || w.reloadController || nodes.some(node => this.cachePinned(node))) continue;
this.invalidateChildren(w);
cache.delete(w);
for (const node of nodes) cache.delete(node);
size -= nodes.length;
}
}
});
function readQuery(grid, value) {
if (!value || value.version !== 1 || !Array.isArray(value.filters) ||
value.sort === undefined || typeof value !== "object") throw new Error("CanopyX: query needs version 1, sort, and filters.");
let sort = null;
if (value.sort !== null) {
const state = value.sort, column = state && grid.columns.find(c => c.id === state.column && c.sortable);
if (!column || state.direction !== "asc" && state.direction !== "desc") throw new Error("CanopyX: invalid query sort.");
sort = Object.freeze({ column: column.id, direction: state.direction });
}
const named = new Set(value.filters);
if (named.size !== value.filters.length || value.filters.some(id => !(grid.view.filters || []).some(f => f.id === id)))
throw new Error("CanopyX: query filters must be unique declared IDs.");
const filters = Object.freeze((grid.view.filters || []).filter(f => named.has(f.id)).map(f => f.id));
return Object.freeze({ version: 1, sort, filters });
}
function snapshotRevision(value, expected) {
requireIdentifier(value && value.revision, "dataset revision");
if (expected != null && value.revision !== expected) throw new Error("CanopyX: dataset revision changed; reload the roots before continuing.");
return value.revision;
}
Object.assign(TreeGrid.prototype, {
getQuery() {
return { version: 1, sort: this.sortState && Object.assign({}, this.sortState), filters: Array.from(this.activeFilters) };
},
sourceRequest(signal) {
return this.queryAware ? { signal: signal || this.dataLifetime.signal, query: this.acceptedQuery, revision: this.datasetRevision } : { signal };
},
syncQueryControls() {
this.toolbar.querySelectorAll("[data-cx-filter]").forEach(input => { input.checked = this.activeFilters.has(input.getAttribute("data-cx-filter")); });
},
querySortHeader(id) {
const query = this.pendingQuery || this.acceptedQuery, state = query.sort && query.sort.column === id ? query.sort.direction : null;
this.sort(id, state === "asc" ? "desc" : state === "desc" ? null : "asc").catch(() => {});
}
});
Object.assign(TreeGrid.prototype, {
retireWrapper(w) {
w._invalidated = true;
this.retirePage(w);
if (this.inlineRetained && this.inlineRetained.get(w.key) === w) this.inlineRetained.delete(w.key);
if (this.inactiveCache) this.inactiveCache.delete(w);
if (this.keyMap.get(w.key) === w) this.keyMap.delete(w.key);
w.children = null; w.inlineCache = null; w.inlineOrder = null;
const selected = this.selected.delete(w);
if (this.anchor === w) this.anchor = null;
return selected ? w : null;
}
});
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
this.onScroll = () => { this.scheduleRender(); this.stateChanged(); };
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
button.addEventListener("click", (event) => this.queryAware ? this.querySortHeader(column.id, event) : this.sort(column.id, sorted === "asc" ? "desc" : sorted === "desc" ? null : "asc"));
cell.appendChild(button);
} else {
const title = h("span", "cx-htext");
setText(title, column.title);
cell.appendChild(title);
}
const grip = h("span", "cx-resize");
grip.setAttribute("aria-label", fill(this.labels.resizeColumn, { column: column.title }));
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
this.stateChanged();
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
rowCount() { return this.rows.length; },
rowItem(index) { return this.rows[index]; },
rowTop(index) { return this.tops[index]; },
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
}
});
Object.assign(TreeGrid.prototype, {
applyWidths(widths = this.cols.map(column => column.width)) {
let sum = 0;
this.cols.forEach((column, i) => {
const width = widths[i];
this.headCells[i].style.width = width + "px";
const grip = this.headCells[i].querySelector(".cx-resize");
grip.setAttribute("aria-valuenow", String(width));
grip.setAttribute("aria-valuetext", fill(this.labels.columnWidth, { width: numberFormat(this.lang).format(width) }));
sum += width;
});
this.rowWidth = sum;
this.headRow.style.width = this.canvas.style.width = sum + "px";
const resizeRow = (row) => {
row.style.width = sum + "px";
if (!row._kind || !row.firstElementChild) return;
if (row._kind !== "node") row.firstElementChild.style.width = sum + "px";
else widths.forEach((width, i) => { if (row.children[i]) row.children[i].style.width = width + "px"; });
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
this.stateChanged();
},
setTreeColumnPinned(pinned) {
this.host.classList.toggle("cx-pin-tree", !!pinned);
this.stateChanged();
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
this.stateChanged();
};
const end = (ev) => { if (ev.pointerId === pointer) stop(); };
this.cancelResize = stop;
global.addEventListener("pointermove", move);
global.addEventListener("pointerup", end);
global.addEventListener("pointercancel", end);
global.addEventListener("blur", stop);
}
});
const ROW_DOM_ORDER = {
keepDomOrder(first, last, rows) {
const ordered = [];
const focusedIndex = rows.indexOf(this.focused);
const focusedEl = focusedIndex >= 0 ? this.rendered.get(this.focused) : null;
if (focusedEl && focusedIndex < first) {
ordered.push(focusedEl);
}
for (let i = first; i <= last; i++) {
const rowEl = this.rendered.get(rows.rowItem(i));
if (rowEl) {
ordered.push(rowEl);
}
}
if (focusedEl && focusedIndex > last) {
ordered.push(focusedEl);
}
const kids = [...this.canvas.children];
const n = ordered.length;
if (kids.length === n && ordered.every((rowEl, k) => kids[k] === rowEl)) return;
if (kids.length === n && !focusedEl) {
const shift = kids.indexOf(ordered[0]);
if (shift > 0 && ordered.every((rowEl, k) => kids[(shift + k) % n] === rowEl)) {
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
};
Object.assign(TreeGrid.prototype, ROW_DOM_ORDER);
const NATIVE_HEIGHT = 8000000;
const ROW_SCROLLING = {
scrollRange() {
const view = Math.max(0, this.grid.clientHeight - this.head.offsetHeight);
return { logical: Math.max(0, this.total - view), native: Math.max(0, NATIVE_HEIGHT - view) };
},
logicalTop() {
const physical = this.grid.scrollTop;
if (!this.scaledScroll) return physical;
const range = this.scrollRange();
const point = this.scrollPosition;
return Math.min(range.logical, point && point.native === physical ? point.logical :
range.native ? physical * range.logical / range.native : 0);
},
setLogicalTop(value) {
if (!this.scaledScroll) { this.grid.scrollTop = value; this.scrollPosition = null; return; }
const range = this.scrollRange(), logical = Math.max(0, Math.min(range.logical, value));
this.grid.scrollTop = range.logical ? logical * range.native / range.logical : 0;
this.scrollPosition = { native: this.grid.scrollTop, logical };
this.scheduleRender(); this.stateChanged();
},
syncScrollRange(top) {
const scaled = this.total > NATIVE_HEIGHT;
this.canvas.style.height = Math.min(this.total, NATIVE_HEIGHT) + "px";
if (scaled !== !!this.scaledScroll) {
this.scaledScroll = scaled;
this.canvas.toggleAttribute("data-cx-scaled", scaled);
if (!this.onScaledWheel) {
this.onScaledWheel = event => this.scaledWheel(event);
this.onScaledTouchStart = event => {
if (!event.defaultPrevented && event.touches.length === 1) {
const touch = event.touches[0];
this.touchScroll = { x: touch.clientX, y: touch.clientY, top: this.logicalTop(), left: this.grid.scrollLeft };
} else this.touchScroll = null;
};
this.onScaledTouchMove = event => this.scaledTouch(event);
this.onScaledTouchEnd = () => { this.touchScroll = null; };
}
const method = scaled ? "addEventListener" : "removeEventListener";
this.grid[method]("wheel", this.onScaledWheel, { passive: false });
this.grid[method]("touchstart", this.onScaledTouchStart, { passive: true });
this.grid[method]("touchmove", this.onScaledTouchMove, { passive: false });
this.grid[method]("touchend", this.onScaledTouchEnd);
this.grid[method]("touchcancel", this.onScaledTouchEnd);
this.touchScroll = null;
}
this.setLogicalTop(top);
},
scaledWheel(event) {
if (event.defaultPrevented || event.ctrlKey || event.shiftKey || !event.deltaY || !event.cancelable) return;
if (this.nestedScroll(event.target, event.deltaY)) return;
const unit = event.deltaMode === 1 ? this.rowH : event.deltaMode === 2 ? this.grid.clientHeight - this.head.offsetHeight : 1;
const top = this.logicalTop(), next = Math.max(0, Math.min(this.scrollRange().logical, top + event.deltaY * unit));
if (next === top) return; // Preserve native scroll chaining at either boundary.
event.preventDefault();
this.grid.scrollLeft += event.deltaX * unit;
this.setLogicalTop(next);
},
scaledTouch(event) {
const start = this.touchScroll;
if (!start || event.defaultPrevented || event.touches.length !== 1 || !event.cancelable) { this.touchScroll = null; return; }
const touch = event.touches[0], dy = start.y - touch.clientY, dx = start.x - touch.clientX;
if (Math.abs(dx) > Math.abs(dy)) return;
if (this.nestedScroll(event.target, dy)) { this.touchScroll = null; return; }
const next = Math.max(0, Math.min(this.scrollRange().logical, start.top + dy));
if (next === this.logicalTop()) return;
event.preventDefault(); this.grid.scrollLeft = start.left + dx; this.setLogicalTop(next);
},
nestedScroll(target, delta) {
for (let element = target; element && element !== this.grid; element = element.parentElement) {
if (element.clientHeight && element.scrollHeight > element.clientHeight &&
/^(auto|scroll)$/.test(getComputedStyle(element).overflowY) &&
(delta > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : element.scrollTop > 0)) return true;
}
return false;
}
};
Object.assign(TreeGrid.prototype, ROW_SCROLLING);
const ROW_VIEWPORT = {
scheduleRender() {
if (this.destroyed) return;
if (!this.rafId) {
this.rafId = requestAnimationFrame(() => {
this.rafId = 0;
this.render();
});
}
},
renderPass(rows = this) {
if (this.destroyed) return;
const grid = this.grid;
const held = this.heldCell();
const viewHeight = grid.clientHeight - this.head.offsetHeight;
const top = this.logicalTop();
const shift = this.scaledScroll ? top - grid.scrollTop : 0;
const n = rows.rowCount();
const over = this.lean ? 0 : OVERSCAN;
const first = n ? Math.max(0, rows.rowAt(top) - over) : 0;
const last = n ? Math.min(n - 1, rows.rowAt(top + viewHeight) + over) : -1;
const want = new Set();
for (let i = first; i <= last; i++) want.add(rows.rowItem(i));
const visibleFocus = rows.indexOf(this.focused) >= 0 ? this.focused : null;
if (visibleFocus) want.add(visibleFocus);
const free = [];
const active = document.activeElement;
for (const [w, rowEl] of this.rendered) {
if (!want.has(w)) {
this.rendered.delete(w);
rowEl.remove();
if (rowEl.contains(active)) {
rowEl._w = null;
this.observeDetail(rowEl, false);
} else {
free.push(rowEl);
}
}
}
const tabRow = visibleFocus || rows.rowItem(n ? rows.rowAt(top) : 0) || null;
const fragment = document.createDocumentFragment();
for (const w of want) {
const index = rows.indexOf(w);
if (index < 0) continue;
let rowEl = this.rendered.get(w);
if (!rowEl) {
rowEl = free.pop() || this.pool.pop() || h("div");
fragment.appendChild(rowEl);
this.rendered.set(w, rowEl);
}
if (w._v !== this.version || rowEl._w !== w) {
this.fillRow(rowEl, w);
w._v = this.version;
} else if (!w.status) this.refreshRowState(rowEl, w);
const y = this.scaledScroll && (index < first || index > last) ?
(index < first ? -w.hpx - viewHeight : NATIVE_HEIGHT + viewHeight) : rows.rowTop(index) - shift;
if (rowEl._top !== y) {
rowEl.style.transform = "translateY(" + y + "px)";
rowEl._top = y;
}
if (rowEl._index !== index) {
rowEl.setAttribute("aria-rowindex", index + 2);
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
rowEl._w = null;
this.observeDetail(rowEl, false);
if (this.pool.length < 200) this.pool.push(rowEl);
}
if (fragment.firstChild) this.canvas.appendChild(fragment);
this.window = { first, last };
this.keepDomOrder(first, last, rows);
if (held) this.restoreCell(held);
this.trimInactiveCache();
}
};
Object.assign(TreeGrid.prototype, ROW_VIEWPORT);
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
this.stateChanged();
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
const top = this.logicalTop();
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
this.setLogicalTop(top + shift);
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
if (rowEl && e.key === "Tab" && e.shiftKey && !e.defaultPrevented) {
this.focusBeforeRows(e);
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
if (box.top < top) this.setLogicalTop(this.logicalTop() - (top - box.top));
else if (box.bottom > bottom) this.setLogicalTop(this.logicalTop() + Math.min(box.bottom - bottom, box.top - top));
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
focusBeforeRows(event) {
const previous = this.headRow.querySelector(".cx-hcell:last-child .cx-resize");
if (!previous) return;
event.preventDefault();
previous.focus();
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
this.rememberInactive(w);
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
const token = w.pageToken = {};
const controller = w.pageController = new AbortController();
const navigation = navigationScope(this, controller.signal);
const generation = w.dataGeneration || 0;
const obsolete = () => this.destroyed || w._invalidated || w.pageToken !== token || generation !== (w.dataGeneration || 0);
const run = (async () => {
let info = null;
let appliedCount = null;
let removedSelection = null;
let removed = false;
try {
const inlineItems = w === this.root ? this.root.inlineItems : w.inline ? w.h.children : null;
const page = inlineItems ? this.inlinePage(w, cursor) : await navigation.wait(this.source.page(w === this.root ? null : w.h, cursor, this.sourceRequest(controller.signal)));
if (obsolete()) return;
const existing = inlineItems ? new Map(this.keyMap) : this.keyMap;
if (inlineItems) for (const key of this.descendants(w).keys()) existing.delete(key);
const items = validatePage(page, existing, cursor ? (w.children || []).length : 0);
if (this.queryAware && !inlineItems) {
const revision = snapshotRevision(page, this.datasetRevision);
if (this.datasetRevision == null) this.datasetRevision = revision;
}
if (cursor != null && !items.length && page.next === cursor) {
throw new Error("CanopyX: page continuation did not advance.");
}
if (inlineItems) {
const prefix = cursor ? w.children || [] : [];
const combined = prefix.map(child => child.h).concat(items);
validateNodes(combined, existing, this.root.inlineItems != null);
this.reconcileList(w, combined, page.total, page.next || null, prefix.map(child => child.idx).concat(page.positions), true,
suppressInitial || restoration !== (this.restoreGeneration || 0));
} else {
if (!cursor || !w.children) {
w.children = [];
}
const base = w.children.length;
const suppressExpansion = suppressInitial || restoration !== (this.restoreGeneration || 0);
items.forEach((node, i) => w.children.push(this.wrap(node, w, base + i, suppressExpansion)));
w.total = typeof page.total === "number" ? page.total : page.next ? null : w.children.length;
w.next = page.next || null;
}
if (w !== this.root && !w.next && !w.children.length) {
w.h.hasChildren = false;
w.h.childCount = 0;
w.expanded = false;
}
this.applySort(w, false);
appliedCount = items.length;
} catch (err) {
if (obsolete()) return;
w.error = err && err.message ? err.message : String(err);
this.emit("error", { node: w.h, message: w.error });
} finally {
navigation.dispose();
controller.abort();
if (w.pageToken !== token) return;
w.pageToken = null;
w.pageController = null;
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
if (appliedCount != null && !this.destroyed && !w._invalidated && generation === (w.dataGeneration || 0) && w.children) {
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
try {
if (!this.destroyed && !w._invalidated && !w.error && (w !== this.root || !this.initializing) && (w === this.root || w.expanded) && !suppressInitial && restoration === (this.restoreGeneration || 0)) await this.expandInitial(w);
} finally {
if (!this.destroyed && !w._invalidated) { this.rememberInactive(w); this.scheduleRender(); }
}
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
this.cacheDirty = true;
this.ensureVisible(w);
if (this.render()) {
this.ensureVisible(w);
this.render();
}
const rowEl = this.rendered.get(w);
if (rowEl && domFocus !== false) {
rowEl.focus({ preventScroll: true });
}
this.stateChanged();
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
const before = this.logicalTop();
if (y < before) {
this.setLogicalTop(y);
} else if (y + height > before + viewHeight) {
this.setLogicalTop(y + height - viewHeight);
}
if (Math.abs(this.logicalTop() - before) > viewHeight) this.leanReveal();
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
this.cacheDirty = true;
this.filterExpand = !!(options && options.autoExpand);
this.keyMap.forEach((w) => { w.filterCollapsed = false; });
this.relayout();
},
setFilterActive(id, active) {
return this.updateActiveFilters(active ? { add: [id] } : { remove: [id] });
},
updateActiveFilters(change) {
const { add = [], remove = [] } = change || {};
if (!change || typeof change !== "object" || !Array.isArray(add) || !Array.isArray(remove)) throw new Error("CanopyX: filter changes need add/remove arrays.");
this.validateFilterIds(add.concat(remove));
const next = new Set(this.queryAware ? (this.pendingQuery || this.acceptedQuery).filters : this.activeFilters);
remove.forEach(id => next.delete(id)); add.forEach(id => next.add(id));
return this.setActiveFilters(Array.from(next));
},
setActiveFilters(ids) {
if (!Array.isArray(ids)) throw new Error("CanopyX: setActiveFilters needs an array of filter ids.");
if (this.queryAware) return this.setQuery({ version: 1, sort: (this.pendingQuery || this.acceptedQuery).sort, filters: ids });
this.applyActiveFilters(ids, new Set(ids));
},
validateFilterIds(ids) {
const declared = this.view.filters || [];
ids.forEach((id) => {
if (!declared.some((f) => f.id === id)) throw new Error("CanopyX: the view declares no filter '" + id + "'.");
});
},
applyActiveFilters(named, next) {
this.validateFilterIds(named);
const declared = this.view.filters || [];
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
this.stateChanged();
},
sort(columnId, direction) {
if (this.queryAware) return this.setQuery({ version: 1, sort: direction ? { column: columnId, direction } : null, filters: (this.pendingQuery || this.acceptedQuery).filters });
this.sortState = direction ? { column: columnId, direction: direction } : null;
this.inlineOrderVersion = (this.inlineOrderVersion || 0) + 1;
this.buildHeader();
this.applySort(this.root, true);
this.relayout();
this.stateChanged();
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
this.stateChanged();
}
});
function navigationScope(grid, signal, dataBound = false) {
const signals = Array.from(new Set([grid.lifetime.signal, dataBound && grid.dataLifetime.signal].concat(signal || []).filter(Boolean)));
const controller = new AbortController();
let abort;
const stopped = new Promise((resolve) => { abort = () => { controller.abort(); resolve(); }; });
signals.forEach((item) => item.addEventListener("abort", abort, { once: true }));
const cancelled = () => signals.some((item) => item.aborted);
if (cancelled()) abort();
return {
cancelled,
signal: controller.signal,
wait: (pending) => Promise.race([pending, stopped]),
dispose: () => { signals.forEach((item) => item.removeEventListener("abort", abort)); controller.abort(); }
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
const navigation = navigationScope(this, options && options.signal, true);
try { return await this.navigatePath(ids, options, navigation); }
finally { navigation.dispose(); }
},
async navigatePath(ids, options, navigation) {
const o = options || {};
const cancelled = navigation.cancelled;
if (cancelled()) return null;
await navigation.wait(this.rootsReady);
if (cancelled()) return null;
await navigation.wait(this.prefetchPath(ids, !!o.expandLast, navigation.signal));
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
if (!this.queryAware) this.clearDeclaredFilters();
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
async prefetchPath(ids, openLast, signal) {
if (typeof this.source.prefetch !== "function") return;
const opens = [];
const finds = [];
let parent = this.root;
ids.forEach((id, k) => {
if (k > 0 && !(parent && parent.children)) opens.push(ids[k - 1]);
const w = this.keyMap.get(id);
if (!(w && parent && w.parent === parent && !w._cached)) finds.push(id);
parent = w && w.parent === parent && !w._cached ? w : null;
});
if (openLast && ids.length && !(parent && parent.children)) opens.push(ids[ids.length - 1]);
if (!opens.length && !finds.length) return;
try {
await this.source.prefetch(opens, finds, this.sourceRequest(signal));
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
while ((!w || w.parent !== parent || w._cached) && parent.children && parent.next) {
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
if (!w || w.parent !== parent || w._cached) {
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
this.cacheDirty = true;
const revision = this.selectionRevision;
for (const [node, row] of this.rendered) {
if (!node.status) setAttr(row, "aria-selected", this.selected.has(node) ? "true" : "false");
}
this.scheduleRender();
const nodes = Array.from(this.selected).map((s) => s.h);
this.writeDeepLink(this.selected.has(w) ? w : Array.from(this.selected).pop(), revision);
if (this.destroyed || revision !== this.selectionRevision) return false;
this.stateChanged();
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
descendants(parent) {
const found = new Map(), pending = this.modelChildren(parent).slice();
while (pending.length) {
const w = pending.pop();
found.set(w.key, w);
for (const child of this.modelChildren(w)) pending.push(child);
}
return found;
},
retirePage(w, reloadOwner, clearDeferred = true) {
w.dataGeneration = (w.dataGeneration || 0) + 1;
w.pageToken = null;
if (w.pageController) w.pageController.abort();
w.pageController = null;
w._pending = null;
w.loading = false;
if (w.reloadController && w.reloadController !== reloadOwner) w.reloadController.abort();
if (clearDeferred) w.pendingChildCount = null;
},
reconcileList(parent, items, total, next, positions, ordering = false, suppressExpansion = false, resetLazy = false) {
const old = this.descendants(parent), retained = new Set(), incoming = new Set();
const pendingData = items.slice();
while (pendingData.length) {
const data = pendingData.pop(); incoming.add(data.id);
for (const child of data.children || []) pendingData.push(child);
}
if (!ordering) {
for (const w of [parent, ...old.values()]) w.countRevision = (w.countRevision || 0) + 1;
}
const pending = [{ owner: parent, items, total, next, positions }];
while (pending.length) {
const entry = pending.pop(), owner = entry.owner;
const replacement = owner.inline ? this.inlineReplacement(owner, entry.items, entry.positions) :
{ items: entry.items, positions: entry.positions, attached: entry.items.length };
const children = replacement.items.map((data, index) => {
const position = replacement.positions ? replacement.positions[index] : index;
let w = old.get(data.id);
const reused = !!w;
if (!w) w = this.createWrapper(data, owner, position);
else {
w.parent = owner; w.idx = position; w.level = owner.level + 1;
const content = nodeContent(data);
if (w.content !== content) w._v = 0;
w.h = data; w.content = content;
w.hpx = data.detail ? this.detailHeight(data.detail) : this.rowH;
w.auto = !!data.detail && !(data.detail.height > 0);
}
this.retainInline(w, index >= replacement.attached);
retained.add(w);
if (Array.isArray(data.children)) {
const count = Math.max(this.pageSize, reused && w.children ? w.children.length : 0);
this.retirePage(w); w.inline = true;
const first = this.inlinePage(w, null, count);
pending.push({ owner: w, items: first.items, total: first.total, next: first.next, positions: first.positions });
if (!reused) w.expanded = !suppressExpansion && !this.restoring && !!data.expanded && first.items.length > 0;
} else if (!data.hasChildren || data.detail) {
this.retirePage(w); w.inline = false; w.children = null; w.inlineCache = null; w.next = null; w.total = null; w.expanded = false;
} else {
w.inline = false;
const cached = this.descendants(w);
const conflict = Array.from(cached.keys()).some(id => incoming.has(id));
if (resetLazy || conflict || data.childCount != null && w.children &&
(data.childCount < w.children.length || !w.next && data.childCount !== w.children.length)) {
this.retirePage(w); w.children = null; w.inlineCache = null; w.next = null;
} else {
for (const child of cached.values()) { child.level = child.parent.level + 1; retained.add(child); }
}
w.total = data.childCount == null ? w.total : data.childCount;
if (!reused || resetLazy) w.autoExpand = !suppressExpansion && !this.restoring && !!(data.expanded || resetLazy && w.expanded);
}
return w;
});
owner.children = children.slice(0, replacement.attached);
owner.inlineCache = new Map(children.slice(replacement.attached).map(w => [w.key, w]));
owner.total = entry.total; owner.next = entry.next;
owner.error = null;
if (owner !== this.root && !children.length && !entry.next) owner.expanded = false;
}
let removedSelection = null;
for (const w of old.values()) {
if (retained.has(w)) continue;
const removed = this.retireWrapper(w);
if (!removedSelection) removedSelection = removed;
}
if (!ordering) this.applySort(parent, true);
for (const w of retained) this.rememberInactive(w);
this.rememberInactive(parent);
this.trimInlineCache();
if (parent !== this.root && !parent.inline) {
if (total != null) parent.h.childCount = total;
parent.h.hasChildren = !!(parent.children.length || next || total > 0);
}
this.relayout(true);
if (removedSelection) this.selectionChanged(null);
},
async reload(id, options) {
if (this.destroyed) return false;
if (id == null && this.queryAware) return this.setQuery(this.acceptedQuery, Object.assign({}, options, { force: true }));
const parent = id == null ? this.root : this.keyMap.get(id);
if (!parent || parent._invalidated) throw new Error("CanopyX: reload needs a loaded parent ID, or null for roots.");
if (parent !== this.root && !this.expandable(parent)) throw new Error("CanopyX: reload needs a node with children.");
if (parent.reloadController) parent.reloadController.abort();
const controller = parent.reloadController = new AbortController();
const navigation = navigationScope(this, [controller.signal, options && options.signal]);
this.retirePage(parent, controller, false);
const target = Math.max(this.pageSize, (parent.children || []).length);
const started = performance.now();
try {
const old = this.descendants(parent), outside = new Map(this.keyMap);
for (const key of old.keys()) outside.delete(key);
const items = [], positions = [], seen = new Set();
const inlineOnly = this.root.inlineItems != null;
const isInline = parent === this.root ? inlineOnly : parent.inline;
const inline = isInline ? parent === this.root ? this.view.roots : parent.h.children : null;
if (isInline) validateNodes(inline, outside, inlineOnly);
let cursor = null, total = null, next = null;
do {
if (navigation.cancelled() || parent._invalidated) return false;
const page = isInline ? this.inlinePage(parent, cursor, this.pageSize, inline) :
await navigation.wait(this.source.page(parent === this.root ? null : parent.h, cursor, this.sourceRequest(controller.signal)));
if (navigation.cancelled() || parent._invalidated) return false;
validatePage(page, outside, items.length);
if (this.queryAware && !isInline) snapshotRevision(page, this.datasetRevision);
const pending = page.items.slice();
while (pending.length) {
const node = pending.pop(); outside.set(node.id, true);
for (const child of node.children || []) pending.push(child);
}
if (page.positions) positions.push(...page.positions);
items.push(...page.items); total = page.total; next = page.next || null;
if (next && (seen.has(next) || next === cursor)) throw new Error("CanopyX: reload continuation did not advance.");
if (next) seen.add(next);
cursor = next;
} while (next && items.length < target);
if (navigation.cancelled() || parent._invalidated) return false;
const current = new Map(this.keyMap);
for (const key of this.descendants(parent).keys()) current.delete(key);
validateNodes(isInline ? inline : items, current, inlineOnly);
const anchor = this.captureScrollAnchor();
this.retirePage(parent, controller);
if (parent === this.root && inlineOnly) parent.inlineItems = inline;
this.reconcileList(parent, items, total == null ? next ? null : items.length : total, next, isInline ? positions : null);
this.restoreScrollAnchor(anchor);
this.stateChanged();
this.emit("reload", { node: parent.h, count: items.length, total: parent.total, ms: performance.now() - started });
return true;
} catch (error) {
if (navigation.cancelled() || parent._invalidated) return false;
this.emit("error", { node: parent.h, message: error.message || String(error) });
throw error;
} finally {
navigation.dispose(); controller.abort();
if (parent.reloadController === controller) parent.reloadController = null;
}
},
captureScrollAnchor() {
const top = this.logicalTop();
const index = this.rowAt(top);
const w = this.rows[Math.min(index, this.rows.length - 1)];
return w && !w.status ? { id: w.key, offset: top - this.tops[this.indexOf(w)] } : null;
},
restoreScrollAnchor(anchor) {
const w = anchor && this.keyMap.get(anchor.id), index = this.indexOf(w);
if (index >= 0) this.setLogicalTop(Math.max(0, this.tops[index] + anchor.offset));
}
});
Object.assign(TreeGrid.prototype, {
async setQuery(value, options, restoreOwner) {
if (this.destroyed) return false;
if (options && options.signal && options.signal.aborted) return false;
if (!this.queryAware) throw new Error("CanopyX: this source does not support view queries.");
const query = readQuery(this, value), force = !!(options && options.force);
if (this.restoreController && this.restoreController !== restoreOwner) this.restoreController.abort();
if (this.queryController) this.queryController.abort();
if (!force && this.datasetRevision != null && JSON.stringify(query) === JSON.stringify(this.acceptedQuery)) {
this.pendingQuery = null; this.syncQueryControls(); return true;
}
const controller = this.queryController = new AbortController();
const navigation = navigationScope(this, [controller.signal, options && options.signal]);
this.pendingQuery = query;
const started = performance.now(), target = force ? Math.max(this.pageSize, (this.root.children || []).length) : 1;
try {
const items = [], seen = new Set(), existing = new Map();
let cursor = null, next = null, total = null, revision = null;
do {
if (navigation.cancelled()) return false;
const page = await navigation.wait(this.source.page(null, cursor, { signal: controller.signal, query, revision }));
if (navigation.cancelled()) return false;
validatePage(page, existing, items.length);
revision = snapshotRevision(page, revision);
for (const node of page.items) {
const pending = [node];
while (pending.length) { const data = pending.pop(); existing.set(data.id, true); for (const child of data.children || []) pending.push(child); }
}
items.push(...page.items); total = page.total; next = page.next || null;
if (next && (next === cursor || seen.has(next))) throw new Error("CanopyX: query continuation did not advance.");
if (next) seen.add(next);
cursor = next;
} while (next && items.length < target);
if (navigation.cancelled()) return false;
const anchor = force ? this.captureScrollAnchor() : null;
const filtersChanged = JSON.stringify(query.filters) !== JSON.stringify(this.acceptedQuery.filters);
this.applyQuerySnapshot(query, revision, items, total, next, anchor);
if (navigation.cancelled()) return false;
this.emit("query", { query: this.getQuery(), revision });
if (filtersChanged && !navigation.cancelled()) this.emit("filter", { active: Array.from(this.activeFilters) });
if (force && !navigation.cancelled()) this.emit("reload", { node: null, count: items.length, total: this.root.total, ms: performance.now() - started });
if (!this.restoring && !navigation.cancelled()) await navigation.wait(this.expandInitial(this.root));
return !navigation.cancelled();
} catch (error) {
if (navigation.cancelled()) return false;
this.announce(fill(this.labels.queryFailed, { error: error.message || String(error) }));
this.emit("error", { node: null, message: error.message || String(error) });
throw error;
} finally {
navigation.dispose(); controller.abort();
if (this.queryController === controller) {
this.queryController = null; this.pendingQuery = null; this.syncQueryControls();
}
}
},
applyQuerySnapshot(query, revision, items, total, next, anchor) {
this.dataLifetime.abort(); this.dataLifetime = new AbortController();
if (this.cancelSearch) this.cancelSearch();
this.retirePage(this.root);
for (const node of this.keyMap.values()) this.retirePage(node);
if (this.inactiveCache) this.inactiveCache.clear();
this.acceptedQuery = query; this.datasetRevision = revision;
this.sortState = query.sort; this.activeFilters = new Set(query.filters);
this.filter = null; this.declaredFilter = null;
this.buildHeader(); this.syncQueryControls();
this.reconcileList(this.root, items, total == null ? next ? null : items.length : total, next, null, false, !!this.restoring, true);
this.rootsReady = Promise.resolve();
if (anchor) this.restoreScrollAnchor(anchor); else this.setLogicalTop(0);
const count = numberFormat(this.lang);
this.announce(this.root.total != null && items.length < this.root.total ? fill(this.labels.pageLoaded, { loaded: count.format(items.length), total: count.format(this.root.total) }) :
fill(this.labels.itemsLoaded, { count: count.format(items.length) }));
this.stateChanged();
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
input.addEventListener("change", () => {
const pending = this.setFilterActive(filter.id, input.checked);
if (pending && pending.catch) pending.catch(() => {});
});
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
this.stateChanged();
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
this.cancelSearch = () => { cancelNavigation(); sequence++; clearTimeout(timer); clearTimeout(blurTimer); hits = []; close(); };
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
function readStateColumn(c, seen) {
requireIdentifier(c && c.id, "state column ID");
if (seen.has(c.id) || !Number.isFinite(c.width) || c.width < 40 || c.width > MAX_COLUMN_WIDTH || typeof c.hidden !== "boolean")
throw new Error("CanopyX: invalid state column.");
seen.add(c.id); return { id: c.id, width: c.width, hidden: c.hidden };
}
function statePaths(value) {
if (!Array.isArray(value)) throw new Error("CanopyX: state paths must be arrays.");
return value.map(path => {
if (!Array.isArray(path) || !path.length) throw new Error("CanopyX: state paths cannot be empty.");
return path.map(id => { requireIdentifier(id, "state path ID"); return id; });
});
}
Object.assign(TreeGrid.prototype, {
getState() {
const anchor = this.captureScrollAnchor(), anchorNode = anchor && this.keyMap.get(anchor.id);
return { version: 1, expanded: this.getExpandedPaths(), selection: Array.from(this.selected, w => this.pathOf(w)),
columns: this.columns.map(c => ({ id: c.id, width: c.width, hidden: !!c.hidden })),
sort: this.sortState && Object.assign({}, this.sortState), filters: Array.from(this.activeFilters),
timeZone: this.local ? "local" : "utc", pinTreeColumn: this.host.classList.contains("cx-pin-tree"),
focus: this.focused && !this.focused.status && !this.focused._invalidated ? this.pathOf(this.focused) : null,
anchor: anchorNode ? { path: this.pathOf(anchorNode), offset: anchor.offset } : null };
},
readState(state) {
if (!state || typeof state !== "object") return null;
try {
const result = { expanded: statePaths(state.expanded) };
if (state.version === undefined) return result;
if (state.version !== 1) return null;
result.version = 1;
result.selection = statePaths(state.selection);
if (!this.multi && result.selection.length > 1) return null;
if (!Array.isArray(state.columns) || !Array.isArray(state.filters)) return null;
const seen = new Set();
result.columns = state.columns.map(c => readStateColumn(c, seen));
if (result.columns.some(c => c.id === this.columns[0].id && c.hidden)) return null;
result.filters = state.filters.map(id => { requireIdentifier(id, "state filter ID"); return id; })
.filter(id => (this.view.filters || []).some(f => f.id === id));
result.sort = null;
if (state.sort != null) {
requireIdentifier(state.sort.column, "state sort column");
if (state.sort.direction !== "asc" && state.sort.direction !== "desc") return null;
if (this.columns.some(c => c.id === state.sort.column)) result.sort = { column: state.sort.column, direction: state.sort.direction };
}
if (state.timeZone !== "utc" && state.timeZone !== "local" || typeof state.pinTreeColumn !== "boolean") return null;
result.timeZone = state.timeZone; result.pinTreeColumn = state.pinTreeColumn;
result.focus = state.focus == null ? null : statePaths([state.focus])[0];
result.anchor = null;
if (state.anchor != null) {
if (!Number.isFinite(state.anchor.offset) || state.anchor.offset < 0 || state.anchor.offset > MAX_PROTOCOL_INTEGER) return null;
result.anchor = { path: statePaths([state.anchor.path])[0], offset: state.anchor.offset };
}
return result;
} catch (error) { return null; }
},
applyStatePresentation(state) {
if (!state.version) return;
if (this.cancelResize) this.cancelResize();
for (const saved of state.columns) {
const column = this.columns.find(c => c.id === saved.id);
if (column) { column.width = saved.width; column.hidden = saved.hidden; }
}
this.toolbar.querySelectorAll("[data-cx-column]").forEach(input => {
const column = this.columns.find(c => c.id === input.getAttribute("data-cx-column"));
if (column) input.checked = !column.hidden;
});
this.sortState = state.sort;
this.inlineOrderVersion = (this.inlineOrderVersion || 0) + 1;
this.setTreeColumnPinned(state.pinTreeColumn);
this.setTimeZone(state.timeZone);
this.buildHeader();
this.applySort(this.root, true);
if (!this.queryAware) this.setActiveFilters(state.filters);
},
async loadStatePaths(state, current) {
const paths = state.selection.concat(state.focus ? [state.focus] : [], state.anchor ? [state.anchor.path] : []);
const attached = new Set([state.focus, state.anchor && state.anchor.path].filter(Boolean).map(path => JSON.stringify(path)));
for (const path of paths) {
if (this.destroyed || current.signal.aborted) return;
const existing = this.keyMap.get(path[path.length - 1]);
let cached = false;
for (let node = existing; node; node = node.parent) if (node._cached) cached = true;
if (existing && JSON.stringify(this.pathOf(existing)) === JSON.stringify(path) &&
(!attached.has(JSON.stringify(path)) || !cached)) continue;
try { await this.expandPath(path, { select: false, focus: false, reveal: false, signal: current.signal }); }
catch (error) { /* Nodes removed since the snapshot are skipped. */ }
}
},
applyStatePosition(state, current) {
if (!state.version) return;
const valid = path => {
const w = path && this.keyMap.get(path[path.length - 1]);
return w && JSON.stringify(this.pathOf(w)) === JSON.stringify(path) ? w : null;
};
this.setSelection(state.selection.map(valid).filter(Boolean).map(w => w.key));
if (this.destroyed || current.signal.aborted) return;
const focused = valid(state.focus);
if (focused && this.indexOf(focused) >= 0) this.setFocus(focused, false);
const anchor = state.anchor && valid(state.anchor.path);
if (anchor) this.restoreScrollAnchor({ id: anchor.key, offset: state.anchor.offset });
}
});
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
const pending = this.modelChildren(this.root).slice().reverse();
while (pending.length) {
const child = pending.pop();
if (child.expanded && this.expandable(child)) {
out.push(this.pathOf(child));
const children = this.modelChildren(child);
for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
}
}
return out;
},
async setState(state) {
if (this.destroyed) return false;
state = this.readState(state);
if (!state) return false;
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
if (this.queryAware && state.version && !await this.setQuery({ version: 1, sort: state.sort, filters: state.filters }, { signal: current.signal }, current)) return false;
if (this.destroyed || current.signal.aborted) return false;
this.applyStatePresentation(state);
if (state.version) await this.loadStatePaths(state, current);
if (this.destroyed || current.signal.aborted) return false;
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
if (!this.destroyed && !current.signal.aborted && state.version) {
this.flushLayout();
this.applyStatePosition(state, current);
}
return !this.destroyed && !current.signal.aborted;
} finally {
release();
if (this.restoreController === current) {
this.restoring = false;
this.keyMap.forEach(w => this.rememberInactive(w));
this.cacheDirty = true;
this.scheduleRender();
this.restoreController = null;
if (fallback && !this.initializing) await this.expandInitial(this.root);
if (!this.initializing) await this.flushPendingToggles();
if (!this.initializing) this.stateChanged();
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
this.cacheDirty = true;
this.scheduleRender();
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
sessionStorage.setItem(key, JSON.stringify(this.getState()));
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
const pending = this.modelChildren(w).slice();
let removedSelection = null;
while (pending.length) {
const child = pending.pop();
for (const descendant of this.modelChildren(child)) pending.push(descendant);
const removed = this.retireWrapper(child);
if (!removedSelection) removedSelection = removed;
}
w.children = null;
w.inlineCache = null;
w.inlineOrder = null;
if (this.inactiveCache) this.inactiveCache.delete(w);
w.next = null;
w.error = null;
w.expanded = false;
return removedSelection;
},
applyCounts(doc, fromRefresh = false) {
if (this.destroyed) return;
checkDocument(doc, "counts");
if (this.queryAware) snapshotRevision(doc, this.datasetRevision);
let removedSelection = null;
let removed = false;
doc.items.forEach((item) => {
const w = this.keyMap.get(item.id);
if (w && w.inline && item.childCount != null && item.childCount !== w.h.children.length) {
throw new Error("CanopyX: inline childCount must equal children length.");
}
});
if (!fromRefresh) {
for (const id of new Set(doc.items.map((item) => item.id))) {
const w = this.keyMap.get(id);
if (w) w.countRevision = (w.countRevision || 0) + 1;
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
w.content = nodeContent(w.h);
});
this.inlineOrderVersion = (this.inlineOrderVersion || 0) + 1;
this.cacheDirty = true;
this.applySort(this.root, true);
this.relayout(removed);
if (removedSelection) this.selectionChanged(removedSelection);
},
async refreshCounts(ids) {
if (this.destroyed || !this.source.counts) {
return null;
}
const wanted = Array.from(new Set(ids || this.rows.filter((w) => !w.status).map((w) => w.key)));
const mine = new Map();
for (const id of wanted) {
const w = this.keyMap.get(id);
if (w) { w.countRevision = (w.countRevision || 0) + 1; mine.set(id, { w, revision: w.countRevision }); }
}
const navigation = navigationScope(this, this.dataLifetime.signal);
let doc;
try { doc = await navigation.wait(this.source.counts(wanted, this.sourceRequest(this.dataLifetime.signal))); }
finally { navigation.dispose(); }
if (navigation.cancelled()) return null;
if (this.queryAware) snapshotRevision(doc, this.datasetRevision);
checkDocument(doc, "counts");
this.applyCounts(Object.assign({}, doc, { items: doc.items.filter(item => {
const captured = mine.get(item.id);
return captured && this.keyMap.get(item.id) === captured.w && captured.w.countRevision === captured.revision;
}) }), true);
return doc;
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
this.linkChanged = this.dataLifetime.signal;
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
const navigation = navigationScope(this, current.signal, true);
try {
const ids = this.opts.parseLink ? await navigation.wait(this.opts.parseLink(link)) : link.split("/").filter(Boolean).map(decodeURIComponent);
if (Array.isArray(ids) && ids.length && !navigation.cancelled() &&
!await this.navigatePath(ids, { select: true, focus: false }, navigation) && !navigation.cancelled()) {
this.link = null;
}
} catch (e) {
if (!navigation.cancelled()) {
this.link = null;
this.announce(e && e.message ? e.message : String(e));
}
} finally {
const cancelled = navigation.cancelled();
navigation.dispose();
if (this.linkOpening === current) {
if (cancelled && this.link === link) this.link = null;
this.linkOpening = null;
}
current.abort();
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
Object.assign(TreeGrid.prototype, {
destroy() {
if (this.destroyed) return;
this.destroyed = true;
this.lifetime.abort();
this.dataLifetime.abort();
if (this.queryController) this.queryController.abort();
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
this.grid.removeEventListener("wheel", this.onScaledWheel);
this.grid.removeEventListener("touchstart", this.onScaledTouchStart);
this.grid.removeEventListener("touchmove", this.onScaledTouchMove);
this.grid.removeEventListener("touchend", this.onScaledTouchEnd);
this.grid.removeEventListener("touchcancel", this.onScaledTouchEnd);
global.removeEventListener("beforeprint", this.onPrint);
global.removeEventListener("hashchange", this.onHash);
global.removeEventListener("popstate", this.onHash);
if (this.linkOpening) this.linkOpening.abort();
[this.toolbar, this.grid, this.live, this.outline].forEach(element => element.remove());
this.host.classList.remove("cx-pin-tree");
this.host.removeAttribute("data-cx-ready");
this.host.removeAttribute("data-canopyx-mounted");
this.keyMap.clear(); this.selected.clear(); this.rendered.clear(); this.pool.length = 0;
if (this.inactiveCache) this.inactiveCache.clear();
if (this.inlineRetained) this.inlineRetained.clear();
this.rows = []; this.tops = [0]; this.total = 0;
this.root.children = null; this.root.inlineCache = null; this.root.inlineOrder = null;
this.focused = null; this.anchor = null; this.source = null; this.touchScroll = null;
this.opts = {};
for (const column of this.columns) column.render = null;
this.filter = null; this.declaredFilter = null; this.pendingRestorationToggles = null;
this.scrolledCell = null; this.focusHandoff = null;
this.cancelResize = null; this.cancelSearch = null;
this.disposeColumnChooser = null; this.disposeSearchFlyout = null;
this.canvas.replaceChildren(); this.outline.replaceChildren();
}
});
const ROW_HELPERS = {};
const GRID_REPORTING = {};
for (const name of ["buildHeader", "visibleColumns", "applyWidths", "setColumnWidth", "startResize", "cell", "newCell", "paintSlot", "paintBadges",
"paintHostSlot", "setSlotContent", "setTimeZone", "rowCells", "heldCell", "restoreCell", "focusCell", "revealInRow", "revealInCell", "settleCell"])
ROW_HELPERS[name] = TreeGrid.prototype[name];
function gridPredicate(filter, columns, budget) {
if (++budget.predicates > 64) throw new Error("CanopyX: at most 64 grid predicates are supported across all groups.");
const column = filter && columns.get(filter.column), values = filter && filter.values;
if (!column || !["eq", "ne", "contains", "startsWith", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull"].includes(filter.operator) ||
!Array.isArray(values) || Object.keys(filter).some(name => !["column", "operator", "values"].includes(name)))
throw new Error("CanopyX: invalid grid predicate.");
const nullTest = filter.operator === "isNull" || filter.operator === "isNotNull";
if (nullTest ? values.length !== 0 : filter.operator === "in" ? values.length < 1 || values.length > 1000 : values.length !== 1)
throw new Error("CanopyX: invalid grid predicate arity.");
if (["contains", "startsWith"].includes(filter.operator) && (column.kind !== "text" || values.some(value => typeof value !== "string")) ||
["gt", "ge", "lt", "le"].includes(filter.operator) && !["number", "datetime"].includes(column.kind))
throw new Error("CanopyX: predicate does not match the column kind.");
values.forEach(value => { if (value == null || typeof value === "object") throw new Error("CanopyX: predicate operands are non-null raw values."); gridScalar(value, column); });
return Object.freeze({ column: column.id, operator: filter.operator, values: Object.freeze(values.slice()) });
}
function gridFilterGroup(group, columns, budget, depth) {
if (depth > 8 || ++budget.groups > 64) throw new Error("CanopyX: grid filter groups exceed their depth or count limit.");
if (!group || !["and", "or"].includes(group.operator) || !Array.isArray(group.filters) || !Array.isArray(group.groups) ||
!group.filters.length && !group.groups.length || Object.keys(group).some(name => !["operator", "filters", "groups"].includes(name)))
throw new Error("CanopyX: invalid or empty grid filter group.");
const filters = group.filters.map(filter => gridPredicate(filter, columns, budget));
const groups = group.groups.map(child => gridFilterGroup(child, columns, budget, depth + 1));
return Object.freeze({ operator: group.operator, filters: Object.freeze(filters), groups: Object.freeze(groups) });
}
function gridMatchesGroup(row, group, columns) {
if (!group) return true;
if (group.operator === "and") return group.filters.every(filter => gridMatches(row, filter, columns.get(filter.column))) &&
group.groups.every(child => gridMatchesGroup(row, child, columns));
return group.filters.some(filter => gridMatches(row, filter, columns.get(filter.column))) ||
group.groups.some(child => gridMatchesGroup(row, child, columns));
}
function gridSearchTerms(text, mode) {
if (mode !== "words") return text ? [foldText(text)] : [];
return [...text.matchAll(/"([^"]*)(?:"|$)|([^\s"]+)/g)].map(match => foldText(match[1] === undefined ? match[2] : match[1])).filter(Boolean);
}
function gridMatchesSearch(row, terms, columns) {
return terms.every(term => columns.some(column => {
const cell = row.cells[column.id], text = isCellObject(cell) && cell.searchText !== undefined ? cell.searchText : cellValue(cell);
return foldText(text).includes(term);
}));
}
function gridQueryStart(query, patch) { return { ...query, ...patch, offset: 0, cursor: undefined, revision: undefined }; }
function gridScalar(cell, column) {
const value = cellValue(cell);
if (value == null) return null;
if (column.kind === "number") {
if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
throw new Error("CanopyX: numeric grid cells need finite values within the safe integer magnitude.");
return value;
}
if (column.kind === "datetime") {
const date = typeof value === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
if (!Number.isFinite(date))
throw new Error("CanopyX: date grid cells need ISO dates with an explicit time zone.");
return date;
}
if (typeof value !== "string" && typeof value !== "boolean") throw new Error("CanopyX: text grid cells need strings or booleans.");
return value;
}
function validateGridRows(rows, columns) {
if (!Array.isArray(rows)) throw new Error("CanopyX: grid rows must be an array.");
const ids = new Set(), declared = new Map(columns.map(column => [column.id, column]));
for (const row of rows) {
requireIdentifier(row && row.id, "grid row ID");
if (ids.has(row.id)) throw new Error("CanopyX: duplicate grid row ID " + row.id);
ids.add(row.id);
if (Object.keys(row).some(name => !["id", "cells"].includes(name)) || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells))
throw new Error("CanopyX: flat rows contain only id and cells.");
for (const id of Object.keys(row.cells)) {
if (!declared.has(id)) throw new Error("CanopyX: undeclared grid column " + id);
const cell = row.cells[id];
if (isCellObject(cell)) {
if (Array.isArray(cell) || Object.keys(cell).some(name => !["value", "text", "searchText", "title", "tone", "badges"].includes(name)) ||
["text", "searchText", "title", "tone"].some(name => cell[name] !== undefined && typeof cell[name] !== "string") ||
cell.badges !== undefined && (!Array.isArray(cell.badges) || cell.badges.some(badge => !badge || typeof badge.text !== "string" ||
["tone", "title"].some(name => badge[name] !== undefined && typeof badge[name] !== "string"))))
throw new Error("CanopyX: malformed grid cell.");
}
gridScalar(cell, declared.get(id));
}
}
return rows;
}
function validateGridView(view) {
checkDocument(view, "grid"); requireIdentifier(view.id, "grid ID");
if (typeof view.label !== "string" || !view.label.trim() || !Array.isArray(view.columns) || !view.columns.length)
throw new Error("CanopyX: a grid needs a label and columns.");
if (view.reporting !== undefined) {
if (!GRID_REPORTING.validate) throw new Error("CanopyX: this view needs the reporting runtime.");
GRID_REPORTING.validate(view);
}
const ids = new Set();
for (const column of view.columns) {
requireIdentifier(column && column.id, "grid column ID");
if (ids.has(column.id) || typeof column.title !== "string" || !["text", "number", "datetime"].includes(column.kind) || column.editable ||
!Number.isInteger(column.width) || column.width < 40)
throw new Error("CanopyX: grid columns need unique IDs, supported kinds and valid widths.");
ids.add(column.id);
}
if (view.columns.every(column => column.hidden)) throw new Error("CanopyX: a grid needs a visible column.");
if (view.searchDelayMs !== undefined && (!Number.isInteger(view.searchDelayMs) || view.searchDelayMs < 0 || view.searchDelayMs > 5000))
throw new Error("CanopyX: search delay must be an integer from 0 to 5000 milliseconds.");
if (view.searchColumns !== undefined && (!Array.isArray(view.searchColumns) || !view.searchColumns.length ||
new Set(view.searchColumns).size !== view.searchColumns.length || view.searchColumns.some(id => !ids.has(id))))
throw new Error("CanopyX: search columns must identify unique declared columns.");
if (!Number.isInteger(view.rowHeight) || view.rowHeight < 20 || view.rowHeight > 64 ||
!Number.isInteger(view.pageSize) || view.pageSize < 1 || view.pageSize > 10000 ||
!["none", "single", "multiple"].includes(view.selection)) throw new Error("CanopyX: invalid grid sizing or selection.");
if (!view.source || !["inline", "host"].includes(view.source.kind)) throw new Error("CanopyX: grid source must be inline or host.");
if (view.source.navigation !== undefined && !["offset", "cursor"].includes(view.source.navigation))
throw new Error("CanopyX: invalid grid source navigation.");
if (view.source.navigation === "cursor" && (view.source.kind !== "host" || view.presentation !== "paged"))
throw new Error("CanopyX: cursors need a hosted paged grid.");
if (view.presentation !== undefined && !["continuous", "paged"].includes(view.presentation) ||
view.pageLength !== undefined && (!Number.isInteger(view.pageLength) || view.pageLength < 1 || view.pageLength > 10000))
throw new Error("CanopyX: invalid grid presentation or page length.");
if (view.source.kind === "inline") validateGridRows(view.rows, view.columns);
else if (view.rows !== undefined) throw new Error("CanopyX: host grids cannot discard inline rows.");
if (view.query !== undefined) gridQuery(view, view.query);
return view;
}
function gridQuery(view, input) {
input = input || {};
const cursor = view.source.navigation === "cursor", type = cursor ? "gridCursorQuery" : "gridQuery";
if (typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(name =>
!["protocol", "type", "view", "revision", "search", "searchMode", "sort", "filters", "filterGroup", "offset", "limit", "cursor"].includes(name)) ||
input.protocol !== undefined && input.protocol !== PROTOCOL || input.type !== undefined && input.type !== type ||
input.view !== undefined && input.view !== view.id) throw new Error("CanopyX: query belongs to a different grid or protocol.");
const query = { protocol: PROTOCOL, type: type, view: view.id,
limit: input.limit === undefined ? cursor ? view.pageLength || 50 : view.pageSize : input.limit, search: input.search === undefined ? "" : input.search };
if (cursor ? input.offset !== undefined && input.offset !== 0 : input.cursor !== undefined)
throw new Error("CanopyX: cursor and offset navigation cannot be mixed.");
if (!cursor) query.offset = input.offset === undefined ? 0 : input.offset;
if (!cursor && !validStructuralCount(query.offset) || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 10000 || typeof query.search !== "string")
throw new Error("CanopyX: invalid grid query window or search.");
if (input.revision !== undefined) { requireIdentifier(input.revision, "grid revision"); query.revision = input.revision; }
if (input.cursor !== undefined) {
gridCursor(input.cursor); if (!query.revision) throw new Error("CanopyX: a cursor requires its dataset revision.");
query.cursor = input.cursor;
}
if (input.searchMode !== undefined) {
if (!["substring", "words"].includes(input.searchMode)) throw new Error("CanopyX: invalid grid search mode.");
query.searchMode = input.searchMode;
}
const columns = new Map(view.columns.map(column => [column.id, column])), sorts = new Set();
if (input.sort !== undefined && !Array.isArray(input.sort) || input.filters !== undefined && !Array.isArray(input.filters))
throw new Error("CanopyX: grid sort and filters must be arrays.");
query.sort = (input.sort || []).map(sort => {
if (!sort || !columns.has(sort.column) || !columns.get(sort.column).sortable || sorts.has(sort.column) ||
!["asc", "desc"].includes(sort.direction) || Object.keys(sort).some(name => !["column", "direction"].includes(name)))
throw new Error("CanopyX: invalid grid sort column or direction.");
sorts.add(sort.column); return Object.freeze({ column: sort.column, direction: sort.direction });
});
const budget = { predicates: 0, groups: 0 };
query.filters = (input.filters || []).map(filter => gridPredicate(filter, columns, budget));
if (input.filterGroup !== undefined) query.filterGroup = gridFilterGroup(input.filterGroup, columns, budget, 1);
Object.freeze(query.sort); Object.freeze(query.filters); return Object.freeze(query);
}
function validateGridPage(page, view, query, accepted) {
checkDocument(page, "gridPage"); requireIdentifier(page.revision, "grid revision");
if (page.view !== view.id || page.offset !== query.offset || !validStructuralCount(page.total) || !validStructuralCount(page.matched) ||
page.matched > page.total || page.offset > page.matched || !Array.isArray(page.items) ||
page.items.length !== Math.min(query.limit, page.matched - page.offset)) throw new Error("CanopyX: grid page does not cover its requested window.");
return checkedGridPage(page, view, query, accepted);
}
function checkedGridPage(page, view, query, accepted) {
if (query.revision !== undefined && page.revision !== query.revision || accepted &&
(page.revision !== accepted.revision || accepted.total !== undefined && page.total !== accepted.total ||
accepted.matched !== undefined && page.matched !== accepted.matched)) throw new Error("CanopyX: grid page snapshot changed.");
validateGridRows(page.items, view.columns);
return { ...page, items: JSON.parse(JSON.stringify(page.items)) };
}
function gridOrder(left, right) { return left === right ? 0 : left < right ? -1 : 1; }
function gridCompare(left, right, column, direction) {
const a = gridScalar(left.cells[column.id], column), b = gridScalar(right.cells[column.id], column);
if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
const result = gridOrder(column.kind === "text" ? String(a) : a, column.kind === "text" ? String(b) : b);
return direction === "desc" ? -result : result;
}
function gridMatches(row, predicate, column) {
const scalar = gridScalar(row.cells[column.id], column), op = predicate.operator;
if (op === "isNull") return scalar === null;
if (op === "isNotNull") return scalar !== null;
if (scalar === null) return false;
const normalize = value => column.kind === "text" && typeof value === "string" ? foldText(value) : value;
const value = normalize(scalar), values = predicate.values.map(operand => normalize(gridScalar(operand, column))), operand = values[0];
switch (op) {
case "eq": return value === operand;
case "ne": return value !== operand;
case "in": return values.includes(value);
case "contains": return String(value).includes(String(operand));
case "startsWith": return String(value).startsWith(String(operand));
case "gt": return value > operand;
case "ge": return value >= operand;
case "lt": return value < operand;
case "le": return value <= operand;
}
return false;
}
function gridQueryRows(view, query, columns, compare = gridCompare) {
const terms = gridSearchTerms(query.search, query.searchMode),
searchColumns = view.searchColumns ? view.searchColumns.map(id => columns.get(id)) : view.columns;
const rows = view.rows.filter(row => gridMatchesSearch(row, terms, searchColumns) &&
query.filters.every(predicate => gridMatches(row, predicate, columns.get(predicate.column))) && gridMatchesGroup(row, query.filterGroup, columns));
return compare ? rows.sort((a, b) => {
for (const sort of query.sort) {
const compared = compare(a, b, columns.get(sort.column), sort.direction);
if (compared) return compared;
}
return gridOrder(a.id, b.id);
}) : rows;
}
function inlineGridSource(view) {
const columns = new Map(view.columns.map(column => [column.id, column]));
const compare = GRID_REPORTING.compare?.(view);
let lastShape = null, ordered = null;
return {
query(query, options) {
if (options.signal.aborted) throw new DOMException("Grid cancelled.", "AbortError");
const shape = gridResultShape(query);
if (shape !== lastShape) {
ordered = gridQueryRows(view, query, columns, compare);
lastShape = shape;
}
return { protocol: PROTOCOL, type: "gridPage", view: view.id, revision: "inline", offset: query.offset,
total: view.rows.length, matched: ordered.length, items: ordered.slice(query.offset, query.offset + query.limit) };
}
};
}
function gridCursor(cursor) {
requireIdentifier(cursor, "grid cursor");
if (cursor.length > 4096) throw new Error("CanopyX: cursor exceeds 4096 code units.");
}
function validateGridCursorPage(page, view, query, accepted) {
checkDocument(page, "gridCursorPage"); requireIdentifier(page.revision, "grid revision");
if (page.view !== view.id || !validStructuralCount(page.offset) ||
page.total !== null && !validStructuralCount(page.total) || page.matched !== null && !validStructuralCount(page.matched) ||
!Array.isArray(page.items) || page.items.length > query.limit) throw new Error("CanopyX: invalid cursor page.");
const end = page.offset + page.items.length, next = page.nextCursor !== undefined, previous = page.previousCursor !== undefined;
if (!validStructuralCount(end) || page.total !== null && end > page.total || page.matched !== null && end > page.matched ||
page.total !== null && page.matched !== null && page.matched > page.total ||
!page.items.length && (page.offset !== 0 || next) || !page.offset && previous ||
page.matched !== null && next !== (end < page.matched) || page.total !== null && next && end >= page.total ||
query.cursor === undefined && page.offset !== 0) throw new Error("CanopyX: inconsistent cursor page.");
const tokens = [page.nextCursor, page.previousCursor].filter(token => token !== undefined);
tokens.forEach(gridCursor);
if (new Set(tokens).size !== tokens.length || tokens.includes(query.cursor)) throw new Error("CanopyX: repeated cursor.");
return checkedGridPage(page, view, query, accepted);
}
class DataGrid {
constructor(host, options) {
const definition = validateGridView(options.view);
this.view = JSON.parse(JSON.stringify(definition));
this.host = host; this.opts = options; this.id = "cx" + ++instanceSeq;
this.lifetime = new AbortController(); this.dataLifetime = new AbortController();
this.source = options.source || (this.view.source.kind === "inline" ? inlineGridSource(this.view) : null);
if (!this.source || typeof this.source.query !== "function") throw new Error("CanopyX: host grids need a query source.");
this.cursor = this.view.source.navigation === "cursor";
if (this.source.navigation !== undefined && this.source.navigation !== (this.cursor ? "cursor" : "offset"))
throw new Error("CanopyX: source navigation must match the grid definition.");
this.pageSize = this.view.pageSize; this.rowH = this.view.rowHeight;
this.paged = this.view.presentation === "paged"; this.pageLength = this.view.pageLength || 50; this.pageOffset = 0;
this.searchDelayMs = options.searchDelayMs === undefined ? this.view.searchDelayMs === undefined ?
this.view.source.kind === "inline" ? 0 : 300 : this.view.searchDelayMs : options.searchDelayMs;
if (!Number.isInteger(this.searchDelayMs) || this.searchDelayMs < 0 || this.searchDelayMs > 5000)
throw new Error("CanopyX: search delay must be an integer from 0 to 5000 milliseconds.");
this.cachePageLimit = options.cachePageLimit === undefined ? 40 : options.cachePageLimit;
this.requestTimeoutMs = options.requestTimeoutMs === undefined ? 30000 : options.requestTimeoutMs;
if (!Number.isInteger(this.cachePageLimit) || this.cachePageLimit < 2 || this.cachePageLimit > 1000 ||
!Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1 || this.requestTimeoutMs > 2147483647)
throw new Error("CanopyX: invalid grid cache or request timeout.");
const renderers = options.renderers || {};
if (!renderers || typeof renderers !== "object" || Array.isArray(renderers) || Object.keys(renderers).some(id =>
!this.view.columns.some(column => column.id === id) || typeof renderers[id] !== "function"))
throw new Error("CanopyX: grid renderers are functions by declared column ID.");
this.columns = this.view.columns.map(column => Object.assign({}, column, {
width: Math.min(MAX_COLUMN_WIDTH, column.width), render: Object.prototype.hasOwnProperty.call(renderers, column.id) ? renderers[column.id] : null
}));
this.lang = document.documentElement.lang || undefined;
this.labels = labelsFor(this.view.labels, options.labels); this.local = this.view.timeZone === "local";
this.fmt = formatting(this.lang, this.local, this.labels); this.multi = this.view.selection === "multiple";
this.queryAware = true; this.queryEpoch = 0; this.version = 1; this.total = 0;
this.pages = new Map(); this.rowCache = new Map(); this.placeholders = new Map(); this.pendingPages = new Map();
this.rendered = new Map(); this.pool = []; this.selected = new Set(); this.focused = null; this.rafId = 0;
this.prepareState();
this.build();
this.ready = this.initializeState();
}
emit(name, detail) {
this.host.dispatchEvent(new CustomEvent("canopyx:" + name, { detail: detail }));
const callback = this.opts["on" + name[0].toUpperCase() + name.slice(1)];
if (typeof callback === "function") {
try { callback(detail); } catch (error) { if (global.console) global.console.error(error); }
}
}
stateChanged() {
if (this.destroyed || this.restoringEpoch === this.queryEpoch) return;
clearTimeout(this.stateTimer);
this.stateTimer = setTimeout(() => {
if (this.destroyed) return;
const state = this.getState(); this.writeStoredState(state); this.emit("state", { query: this.getQuery(), state: state });
}, 200);
}
getQuery() { return this.acceptedQuery || null; }
queryForChange(includeQueuedInput) {
const query = this.pendingQuery || this.acceptedQuery || {};
return includeQueuedInput && this.searchTimer != null && !this.searchComposing ?
gridQueryStart(query, { search: this.searchInput.value }) : query;
}
async setQuery(input, paging) {
if (this.destroyed) throw new DOMException("Grid was destroyed.", "AbortError");
const length = paging ? paging.pageLength : this.pageLength;
const initial = gridQuery(this.view, this.cursor ? { ...input, limit: length } : input);
const desired = this.cursor ? 0 : Math.floor(initial.offset / length) * length;
const same = this.acceptedQuery && gridResultShape(initial) === gridResultShape(this.acceptedQuery) && initial.revision === this.acceptedQuery.revision;
let query = this.paged && !this.cursor ? gridQuery(this.view, { ...initial, offset: same ? Math.min(desired, Math.max(0, Math.ceil(this.rowCount() / length) - 1) * length) : 0 }) : initial;
const epoch = ++this.queryEpoch;
clearTimeout(this.searchTimer); this.searchTimer = null;
this.dataLifetime.abort(); this.dataLifetime = new AbortController();
const lifetime = this.dataLifetime;
this.pendingPages.clear(); this.pendingQuery = query; this.setNotice(this.labels.loading, false);
this.grid.setAttribute("aria-busy", "true");
this.syncPager();
try {
let page = (this.cursor ? validateGridCursorPage : validateGridPage)(await this.requestPage(query, lifetime.signal), this.view, query, same ? this.snapshot : null);
if (this.cursor && paging && paging.direction) this.validateCursorTransition(page, paging);
if (this.paged && !this.cursor && !same && desired) {
gridOperationActive(this, lifetime.signal);
const offset = Math.min(desired, Math.max(0, Math.ceil(page.matched / length) - 1) * length);
if (offset) {
const snapshot = { revision: page.revision, total: page.total, matched: page.matched };
query = gridQuery(this.view, { ...query, offset, revision: page.revision });
page = validateGridPage(await this.requestPage(query, lifetime.signal), this.view, query, snapshot);
}
}
gridOperationActive(this, lifetime.signal);
const hadFocus = this.canvas.contains(document.activeElement), previousId = this.focused && this.focused.key;
this.pages.clear(); this.rowCache.clear(); this.placeholders.clear(); this.focused = null;
this.acceptedQuery = gridQuery(this.view, { ...query, revision: page.revision });
this.snapshot = { revision: page.revision, total: page.total, matched: page.matched };
this.pageLength = length; this.pageOffset = this.cursor ? page.offset : this.paged ? query.offset : 0;
if (this.cursor) this.cursorWindow = { end: page.offset + page.items.length, next: page.nextCursor, previous: page.previousCursor };
this.storePage(page); this.pendingQuery = null; this.lastFailedQuery = null; this.lastFailedPaging = null; this.version++;
const hasRows = this.cursor ? page.items.length : page.matched;
this.total = (this.cursor ? page.items.length : this.paged ? Math.min(length, page.matched - this.pageOffset) : page.matched) * this.rowH;
this.grid.setAttribute("aria-rowcount", page.matched === null ? "-1" : String(page.matched + 1));
this.grid.tabIndex = hasRows ? -1 : 0;
this.syncScrollRange(this.paged ? 0 : query.offset * this.rowH); this.buildHeader();
this.setNotice(hasRows ? "" : this.labels.searchNoResults, false); this.grid.setAttribute("aria-busy", "false");
if (hadFocus) {
this.focused = [...this.rowCache.values()].find(row => row.key === previousId) || this.rowCache.get(this.cursor ? page.offset : query.offset) || null;
}
this.render();
if (hadFocus) { const element = this.focused && this.rendered.get(this.focused); (element || this.grid).focus({ preventScroll: true }); }
this.host.setAttribute("data-cx-ready", "true");
if (this.searchInput && !this.searchComposing && this.searchTimer == null) this.searchInput.value = query.search;
this.syncQuerySummary();
this.syncPager();
this.emit("query", { query: this.acceptedQuery, revision: page.revision, total: page.total, matched: page.matched });
this.stateChanged(); return this.getQuery();
} catch (error) {
if (epoch === this.queryEpoch && !this.destroyed) {
this.pendingQuery = null; this.lastFailedQuery = initial; this.lastFailedPaging = { ...paging, pageLength: length };
this.dataLifetime.abort(); this.dataLifetime = new AbortController();
this.grid.setAttribute("aria-busy", "false"); this.setNotice(fill(this.labels.queryFailed, { error: error.message }), true);
this.syncPager();
this.emit("error", { error: error });
}
throw error;
}
}
querySortHeader(id, event) {
const previous = gridQuery(this.view, this.queryForChange(true)), sorts = previous.sort.slice();
const found = sorts.findIndex(sort => sort.column === id), old = found >= 0 ? sorts[found].direction : null;
const next = old === "asc" ? "desc" : old === "desc" ? null : "asc";
const changed = event && event.shiftKey ? sorts.filter(sort => sort.column !== id) : [];
if (next) changed.splice(event && event.shiftKey && found >= 0 ? Math.min(found, changed.length) : changed.length, 0, { column: id, direction: next });
this.setQuery(gridQueryStart(previous, { sort: changed })).catch(() => {});
}
sort(sorts) {
return this.setQuery(gridQueryStart(this.queryForChange(true), { sort: sorts }));
}
rowCount() { return this.cursor ? this.cursorWindow ? this.cursorWindow.end : 0 : this.snapshot ? this.snapshot.matched : 0; }
rowBounds() { return { first: this.pageOffset, last: this.paged ? Math.min(this.rowCount(), this.pageOffset + this.pageLength) - 1 : this.rowCount() - 1 }; }
rowTop(index) { return (index - this.pageOffset) * this.rowH; }
rowAt(top) { const bounds = this.rowBounds(); return Math.max(bounds.first, Math.min(bounds.last, bounds.first + Math.floor(top / this.rowH))); }
indexOf(row) {
if (!row || this.paged && (row._ri < this.pageOffset || row._ri >= this.pageOffset + this.pageLength)) return -1;
return this.rowCache.get(row._ri) === row || this.placeholders.get(row._ri) === row ? row._ri : -1;
}
rowItem(index) {
if (index < 0 || index >= this.rowCount() || this.paged && (index < this.pageOffset || index >= this.pageOffset + this.pageLength)) return null;
if (this.rowCache.has(index)) return this.rowCache.get(index);
if (!this.placeholders.has(index)) this.placeholders.set(index, { _ri: index, hpx: this.rowH, status: "loading", h: { cells: {} } });
const row = this.placeholders.get(index), page = this.pages.get(Math.floor(index / this.pageSize) * this.pageSize);
row.status = page && page.error ? "error" : "loading"; return row;
}
render() {
if (this.destroyed) return;
this.renderPass();
for (const [index, row] of this.placeholders) if (!this.rendered.has(row) && this.focused !== row) this.placeholders.delete(index);
this.loadWindow();
}
observeDetail() {}
trimInactiveCache() { this.trimPages(); }
setSelection(ids) {
if (this.destroyed) return;
if (!Array.isArray(ids)) throw new Error("CanopyX: selection must be an array of row IDs.");
ids.forEach(id => requireIdentifier(id, "selection ID"));
const next = new Set(ids);
if (this.view.selection === "none" && next.size || !this.multi && next.size > 1) throw new Error("CanopyX: selection exceeds the view's mode.");
this.selected = next; this.version++; this.scheduleRender(); this.emit("select", { ids: [...next] });
this.stateChanged();
}
setColumnVisible(id, visible) {
const column = this.columns.find(item => item.id === id);
if (!column || typeof visible !== "boolean") throw new Error("CanopyX: visibility needs a declared column and boolean.");
if (!visible && this.visibleColumns().length === 1 && !column.hidden) throw new Error("CanopyX: keep at least one column visible.");
column.hidden = !visible; this.buildHeader(); this.scheduleRender(); this.stateChanged();
this.syncColumnControls();
}
destroy() {
if (this.destroyed) return;
this.writeStoredState(this.getState());
this.destroyed = true; this.queryEpoch++; this.lifetime.abort(); this.dataLifetime.abort();
if (this.rafId) cancelAnimationFrame(this.rafId);
clearTimeout(this.searchTimer); this.searchTimer = null;
clearTimeout(this.stateTimer);
if (this.disposeControls) this.disposeControls();
if (this.cancelResize) this.cancelResize();
this.resizeObserver.disconnect();
this.restoreHeight();
this.host.classList.remove("cx-data-grid");
this.grid.removeEventListener("wheel", this.onScaledWheel); this.grid.removeEventListener("touchstart", this.onScaledTouchStart);
this.grid.removeEventListener("touchmove", this.onScaledTouchMove); this.grid.removeEventListener("touchend", this.onScaledTouchEnd);
this.grid.removeEventListener("touchcancel", this.onScaledTouchEnd);
this.pages.clear(); this.rowCache.clear(); this.placeholders.clear(); this.pendingPages.clear(); this.rendered.clear(); this.pool.length = 0;
this.toolbar.remove(); this.grid.remove(); this.notice.remove(); this.live.remove();
if (this.pager) this.pager.remove();
this.host.removeAttribute("data-cx-ready"); this.host.removeAttribute("data-canopyx-mounted");
}
}
Object.assign(DataGrid.prototype, ROW_SCROLLING, ROW_DOM_ORDER, ROW_VIEWPORT, ROW_HELPERS);
Object.assign(DataGrid.prototype, {
requestPage(query, signal) { return this.runGridHook(signal => this.source.query(query, { signal }), signal); },
storePage(page) {
const rows = page.items.map((item, i) => ({ key: item.id, h: item, _ri: page.offset + i, hpx: this.rowH }));
const incoming = new Map(rows.map(row => [row.key, row._ri]));
for (const cached of this.rowCache.values()) if (incoming.has(cached.key) && incoming.get(cached.key) !== cached._ri)
throw new Error("CanopyX: inconsistent grid row identity.");
for (const row of rows) {
const existing = this.rowCache.get(row._ri);
if (existing && existing.key !== row.key) throw new Error("CanopyX: inconsistent grid row identity.");
}
const retained = rows.map(row => this.rowCache.get(row._ri) || row);
let restoreFocus = false;
for (const row of retained) {
const placeholder = this.placeholders.get(row._ri);
if (this.focused === placeholder) {
const element = this.rendered.get(placeholder);
restoreFocus = !!(element && element.contains(document.activeElement));
this.focused = row;
}
this.placeholders.delete(row._ri); this.rowCache.set(row._ri, row);
}
this.pages.set(page.offset, { rows: retained, offset: page.offset }); this.version++;
return restoreFocus;
},
trimPages() {
if (!this.window || this.pages.size <= this.cachePageLimit) return;
const ranges = this.window.ranges || [this.window];
const retained = page => page.rows?.includes(this.focused) || ranges.some(range => page.offset <= range.last &&
page.offset + (page.rows?.length ?? this.pageSize) > range.first);
const center = (this.window.first + this.window.last) / 2;
const removable = [...this.pages.values()].filter(page => !retained(page));
removable.sort((a, b) => Math.abs(b.offset - center) - Math.abs(a.offset - center));
while (this.pages.size > this.cachePageLimit && removable.length) {
const page = removable.shift(); this.pages.delete(page.offset);
for (const row of page.rows || []) if (this.rowCache.get(row._ri) === row) this.rowCache.delete(row._ri);
}
},
loadWindow() {
if (this.cursor || !this.window || !this.snapshot || this.pendingQuery || this.destroyed) return;
const offsets = new Set();
const bounds = this.rowBounds();
for (const range of this.window.ranges || [this.window])
for (let index = Math.max(bounds.first, range.first); index <= Math.min(bounds.last, range.last); index++)
if (!this.rowCache.has(index)) offsets.add(Math.floor(index / this.pageSize) * this.pageSize);
if (this.focused?.status && this.focused._ri >= 0) offsets.add(Math.floor(this.focused._ri / this.pageSize) * this.pageSize);
for (const offset of offsets) {
if (this.pendingPages.size >= 4) break;
if (!this.pendingPages.has(offset) && !this.pages.get(offset)?.error) this.loadPage(offset);
}
},
loadPage(offset) {
if (this.pendingPages.has(offset)) return this.pendingPages.get(offset).promise;
const { queryEpoch: epoch, dataLifetime: lifetime, snapshot } = this;
const query = gridQuery(this.view, { ...this.acceptedQuery, offset, limit: this.pageSize, revision: snapshot.revision });
const token = {}; this.pendingPages.set(offset, token);
token.promise = this.requestPage(query, lifetime.signal).then(page => {
if (this.destroyed || epoch !== this.queryEpoch || lifetime !== this.dataLifetime) return;
const restoreFocus = this.storePage(validateGridPage(page, this.view, query, snapshot));
if (restoreFocus) {
this.render();
const active = document.activeElement, element = this.rendered.get(this.focused);
if (element && (!active || active === document.body)) element.focus({ preventScroll: true });
} else this.scheduleRender();
}).catch(error => {
if (this.destroyed || epoch !== this.queryEpoch || lifetime !== this.dataLifetime || lifetime.signal.aborted) return;
this.pages.set(offset, { error, offset }); this.version++;
this.setNotice(fill(this.labels.loadError, { error: error.message }), true); this.emit("error", { error }); this.scheduleRender();
}).finally(() => {
if (this.pendingPages.get(offset) === token) { this.pendingPages.delete(offset); this.loadWindow(); }
});
return token.promise;
},
async waitForRow(index, epoch) {
while (!this.destroyed && epoch === this.queryEpoch) {
const row = this.rowItem(index);
if (!row || row.status !== "loading") return row;
const offset = Math.floor(index / this.pageSize) * this.pageSize, pending = this.pendingPages.get(offset);
if (pending) await pending.promise;
else if (this.pendingPages.size < 4) await this.loadPage(offset);
else await Promise.race([...this.pendingPages.values()].map(token => token.promise));
}
throw new DOMException("Grid navigation was superseded.", "AbortError");
},
retry() {
if (this.lastFailedQuery) return this.setQuery(this.lastFailedQuery, this.lastFailedPaging);
for (const [offset, page] of this.pages) if (page.error) this.pages.delete(offset);
this.version++; this.setNotice("", false); this.scheduleRender(); return Promise.resolve();
}
});
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridPaging: "Result pages", gridPageRange: "{first}–{last} of {count} rows",
gridPageNumber: "Page", gridPageLength: "Rows per page", gridFirstPage: "First page",
gridPreviousPage: "Previous page", gridNextPage: "Next page", gridLastPage: "Last page",
gridUnknownCount: "Result count unavailable", gridMatchedCount: "{count} matching rows", gridCursorRange: "Rows {first}–{last}"
}));
function gridResultShape(query) { return JSON.stringify([query.search, query.searchMode, query.filters, query.filterGroup, query.sort]); }
Object.assign(DataGrid.prototype, {
getPaging() {
const window = this.cursorWindow, count = this.cursor ? window ? window.end - this.pageOffset : 0 : this.rowCount();
return Object.freeze({ presentation: this.paged ? "paged" : "continuous", pageLength: this.pageLength,
first: count ? this.pageOffset + 1 : 0, last: this.cursor ? count ? window.end : 0 :
this.paged ? Math.min(count, this.pageOffset + this.pageLength) : count,
matched: this.snapshot ? this.snapshot.matched : this.cursor ? null : 0,
total: this.snapshot ? this.snapshot.total : this.cursor ? null : 0,
...this.cursor ? { navigation: "cursor", pageIndex: null, pageCount: null,
hasNext: !!(window && window.next !== undefined), hasPrevious: !!(window && window.previous !== undefined) } : {
pageIndex: this.paged ? Math.floor(this.pageOffset / this.pageLength) : 0,
pageCount: this.paged ? Math.ceil(count / this.pageLength) : count ? 1 : 0 } });
},
goToPage(index) {
if (this.cursor || !this.paged || !this.acceptedQuery || !Number.isInteger(index) || index < 0)
throw new Error("CanopyX: choose a nonnegative page in an accepted paged result.");
const query = this.queryForChange(true), queuedSearch = query.search !== this.acceptedQuery.search;
const page = queuedSearch ? 0 : Math.min(index, Math.max(0, this.getPaging().pageCount - 1));
const request = gridQuery(this.view, Object.assign({}, query, { offset: page * this.pageLength, limit: this.pageSize,
revision: queuedSearch ? undefined : query.revision }));
return this.navigatePageQuery(request);
},
navigatePageQuery(request, paging) {
const key = JSON.stringify(request);
const pending = this.pendingPageNavigation;
if (pending && pending.epoch === this.queryEpoch && pending.key === key) return pending.promise;
const operation = this.setQuery(request, paging), navigation = { epoch: this.queryEpoch, key: key };
navigation.promise = operation.finally(() => { if (this.pendingPageNavigation === navigation) this.pendingPageNavigation = null; });
this.pendingPageNavigation = navigation; return navigation.promise;
},
setPageLength(length) {
if (!this.paged || !this.acceptedQuery || !Number.isInteger(length) || length < 1 || length > 10000)
throw new Error("CanopyX: visible page length is an integer from 1 to 10000 for an accepted paged result.");
const query = this.queryForChange(true), queuedSearch = query.search !== this.acceptedQuery.search;
if (this.cursor) return this.setQuery(gridQueryStart(query), { pageLength: length });
return this.setQuery(Object.assign({}, query, { offset: queuedSearch ? 0 : Math.floor(this.pageOffset / length) * length,
limit: this.pageSize, revision: queuedSearch ? undefined : query.revision }), { pageLength: length });
},
validateCursorTransition(page, paging) {
const end = page.offset + page.items.length;
if (paging.direction === "first" && page.offset !== 0 || paging.direction === "next" && page.offset !== paging.edge ||
paging.direction === "previous" && end !== paging.edge)
throw new Error("CanopyX: cursor pages must be contiguous.");
if (paging.direction !== "first") {
const identities = new Set([...this.rowCache.values()].map(row => row.key));
if (page.items.some(row => identities.has(row.id))) throw new Error("CanopyX: cursor pages repeat a row ID.");
}
},
navigateCursor(direction) {
if (!this.acceptedQuery || !this.cursorWindow || !this.cursor)
throw new Error("CanopyX: no accepted cursor page.");
const query = this.queryForChange(true), changed = gridResultShape(query) !== gridResultShape(this.acceptedQuery);
let cursor = direction === "next" ? this.cursorWindow.next : direction === "previous" ? this.cursorWindow.previous : undefined;
if (changed) { direction = "first"; cursor = undefined; }
if (direction !== "first" && cursor === undefined) {
if (!this.pendingQuery) return Promise.resolve(this.acceptedQuery);
direction = "first";
}
const request = gridQuery(this.view, { ...query, cursor, limit: this.pageLength,
revision: changed ? undefined : this.snapshot.revision });
const paging = { pageLength: this.pageLength, direction: direction,
edge: direction === "next" ? this.cursorWindow.end : this.pageOffset };
return this.navigatePageQuery(request, paging);
},
firstPage() { return this.cursor ? this.navigateCursor("first") : this.goToPage(0); },
previousPage() { return this.cursor ? this.navigateCursor("previous") : this.goToPage(Math.max(0, this.getPaging().pageIndex - 1)); },
nextPage() { return this.cursor ? this.navigateCursor("next") : this.goToPage(this.getPaging().pageIndex + 1); },
buildPager() {
if (!this.paged) return;
const pager = this.pager = h("form", "cx-grid-pager"), signal = this.lifetime.signal;
pager.hidden = this.opts.toolbar === false;
pager.setAttribute("aria-label", this.labels.gridPaging);
this.pageRange = h("span", "cx-grid-page-range"); this.pageRange.setAttribute("role", "status"); pager.appendChild(this.pageRange);
const run = action => { try { Promise.resolve(action()).catch(() => {}); } catch (error) { this.emit("error", { error: error }); } };
this.pageButtons = [
gridButton(this.labels.gridFirstPage, () => run(() => this.firstPage())),
gridButton(this.labels.gridPreviousPage, () => run(() => this.previousPage())),
gridButton(this.labels.gridNextPage, () => run(() => this.nextPage()))
];
if (!this.cursor) this.pageButtons.push(gridButton(this.labels.gridLastPage, () => run(() => this.goToPage(Math.max(0, this.getPaging().pageCount - 1)))));
pager.append(this.pageButtons[0], this.pageButtons[1]);
if (!this.cursor) {
const number = this.pageNumber = h("input"); number.type = "number"; number.min = "1"; number.step = "1"; number.required = true;
pager.appendChild(gridInputLabel(this.labels.gridPageNumber, number));
}
pager.append(...this.pageButtons.slice(2));
const length = this.pageLengthChoice = h("select");
pager.appendChild(gridInputLabel(this.labels.gridPageLength, length));
length.addEventListener("change", () => run(() => this.setPageLength(Number(length.value))), { signal: signal });
pager.addEventListener("submit", event => { event.preventDefault();
if (this.pageNumber && this.pageNumber.checkValidity()) run(() => this.goToPage(Number(this.pageNumber.value) - 1)); }, { signal: signal });
this.host.appendChild(pager); this.syncPager();
},
syncPager() {
if (!this.pager) return;
const paging = this.getPaging(), busy = !this.acceptedQuery || !!this.pendingQuery;
const numbers = numberFormat(this.lang);
setText(this.pageRange, fill(paging.matched === null ? this.labels.gridCursorRange : this.labels.gridPageRange,
{ first: numbers.format(paging.first), last: numbers.format(paging.last), count: numbers.format(paging.matched) }));
if (this.pageNumber) {
this.pageNumber.value = String(paging.pageCount ? paging.pageIndex + 1 : 1);
this.pageNumber.max = String(Math.max(1, paging.pageCount)); this.pageNumber.disabled = busy || !paging.pageCount;
}
this.pageButtons.forEach((button, index) => { button.disabled = busy || (this.cursor ? index === 0 ? this.pageOffset === 0 :
index === 1 ? !paging.hasPrevious : !paging.hasNext : !paging.pageCount || (index < 2 ? paging.pageIndex === 0 : paging.pageIndex >= paging.pageCount - 1)); });
this.pageLengthChoice.replaceChildren();
[...new Set([25, 50, 100, 250, this.pageLength])].sort((a, b) => a - b)
.forEach(value => this.pageLengthChoice.appendChild(gridOption(value, numbers.format(value))));
this.pageLengthChoice.value = String(this.pageLength); this.pageLengthChoice.disabled = busy;
const active = document.activeElement;
const fallback = this.pageNumber || this.pageLengthChoice;
if (!busy && this.pageButtons.includes(active) && active.disabled && !fallback.disabled) fallback.focus({ preventScroll: true });
},
async focusResult(index, focus, column, control) {
const columnId = column >= 0 && this.visibleColumns()[column] ? this.visibleColumns()[column].id : null;
const navigation = { index: index, columnId: columnId, epoch: this.queryEpoch, focus: focus };
this.pendingNavigation = navigation;
try {
const pendingPage = this.pendingPageNavigation;
if (this.cursor && (index < this.rowBounds().first || index > this.rowBounds().last))
throw new Error("CanopyX: cursor keys stay inside the accepted page.");
if (this.paged && !this.cursor && (index < this.rowBounds().first || index > this.rowBounds().last ||
this.pendingQuery && pendingPage && pendingPage.epoch === this.queryEpoch)) {
const request = gridQuery(this.view, Object.assign({}, this.acceptedQuery, {
offset: Math.floor(index / this.pageLength) * this.pageLength, limit: this.pageSize }));
const operation = this.navigatePageQuery(request);
navigation.epoch = this.queryEpoch; await operation;
}
if (this.pendingNavigation !== navigation) return;
if (this.destroyed || this.pendingQuery) throw new DOMException("Grid navigation was superseded.", "AbortError");
if (index < this.rowBounds().first || index > this.rowBounds().last)
throw new Error("CanopyX: row position is outside the accepted result page.");
const epoch = this.queryEpoch, ownsFocus = focus && this.canvas.contains(document.activeElement);
this.setFocus(this.rowItem(index), ownsFocus);
navigation.epoch = epoch; this.pendingNavigation = navigation;
const navigationTop = this.logicalTop();
const row = await this.waitForRow(index, epoch);
if (this.destroyed || epoch !== this.queryEpoch || this.pendingQuery) throw new DOMException("Grid navigation was superseded.", "AbortError");
if (this.pendingNavigation !== navigation) return;
if (focus && (!ownsFocus || !this.canvas.contains(document.activeElement) || !this.focused || this.focused._ri !== index)) return;
const currentColumn = columnId ? this.visibleColumns().findIndex(item => item.id === columnId) : -1;
if (!focus || currentColumn < 0 || !row || row.status) {
if (this.logicalTop() === navigationTop) this.setFocus(row, focus);
} else {
const currentTop = this.logicalTop();
this.focusCell(row, currentColumn, control);
if (currentTop !== navigationTop) { this.setLogicalTop(currentTop); this.render(); }
}
} finally { if (this.pendingNavigation === navigation) this.pendingNavigation = null; }
}
});
Object.assign(DataGrid.prototype, {
build() {
const host = this.host, style = host.style, signal = this.lifetime.signal;
const minimum = style.getPropertyValue("--cx-min-h"), priority = style.getPropertyPriority("--cx-min-h");
this.restoreHeight = () => style.setProperty("--cx-min-h", minimum, priority);
style.removeProperty("--cx-min-h");
host.classList.add("cx-host", "cx-data-grid");
if (!host.hasAttribute("data-cx-theme")) host.setAttribute("data-cx-theme", "auto");
style.setProperty("--cx-row-h", this.rowH + "px");
this.toolbar = h("div", "cx-toolbar"); this.toolbar.hidden = this.opts.toolbar === false;
if (this.view.search) this.buildGridSearch();
this.buildGridControls();
this.buildQuerySummary();
const grid = this.grid = h("div", "cx-grid"); grid.id = this.id; grid.tabIndex = -1;
grid.setAttribute("role", "grid"); grid.setAttribute("aria-label", this.view.label);
if (this.multi) grid.setAttribute("aria-multiselectable", "true");
this.head = h("div", "cx-head"); this.head.setAttribute("role", "rowgroup");
this.headRow = h("div", "cx-hrow"); this.headRow.setAttribute("role", "row"); this.headRow.setAttribute("aria-rowindex", "1");
this.head.appendChild(this.headRow); this.canvas = h("div", "cx-canvas"); this.canvas.setAttribute("role", "rowgroup");
grid.appendChild(this.head); grid.appendChild(this.canvas);
this.notice = h("div", "cx-grid-notice"); this.notice.hidden = true;
this.live = h("div", "cx-live cx-sr-only"); this.live.setAttribute("aria-live", "polite");
host.appendChild(this.toolbar); host.appendChild(grid); host.appendChild(this.notice); host.appendChild(this.live);
this.buildPager();
this.buildHeader();
grid.addEventListener("scroll", () => { this.scheduleRender(); this.stateChanged(); }, { passive: true, signal: signal });
grid.addEventListener("click", event => this.onClick(event), { signal: signal });
grid.addEventListener("dblclick", event => {
const element = event.target.closest(".cx-row"), row = element && element._w;
if (row && !row.status && typeof this.opts.onDetails === "function" && !event.target.closest("a,button,input,select,textarea,[contenteditable]"))
Promise.resolve().then(() => this.openDetails(row.key)).catch(error => this.emit("error", { error: error }));
}, { signal: signal });
grid.addEventListener("keydown", event => this.onKey(event), { signal: signal });
this.canvas.addEventListener("focusin", event => {
const element = event.target.closest(".cx-row");
if (element && element._w && this.pendingNavigation && this.pendingQuery && element._w._ri !== this.pendingNavigation.index)
this.pendingNavigation = null;
if (element && element._w && this.focused !== element._w) {
this.pendingNavigation = null; this.focused = element._w; this.scheduleRender();
}
}, { signal: signal });
document.addEventListener("focusin", event => {
if (this.pendingNavigation && this.pendingNavigation.focus && !this.canvas.contains(event.target)) this.pendingNavigation = null;
}, { signal: signal });
this.canvas.addEventListener("focusout", event => this.settleCell(event.relatedTarget), { signal: signal });
this.resizeObserver = new ResizeObserver(() => {
style.setProperty("--cx-min-h", (this.toolbar.hidden ? 0 : [...host.children].reduce((height, child) =>
height + (child === grid ? 0 : child.offsetHeight), this.rowH * 4 + 2)) + "px");
this.applyWidths(); this.scheduleRender();
});
this.resizeObserver.observe(grid);
},
setNotice(text, error) {
this.notice.textContent = ""; this.notice.hidden = !text;
this.notice.setAttribute("role", error ? "alert" : "status");
if (error) {
const retry = h("button", "cx-button cx-grid-retry"); retry.type = "button"; setText(retry, text);
retry.addEventListener("click", () => this.retry().catch(() => {}), { signal: this.lifetime.signal }); this.notice.appendChild(retry);
} else setText(this.notice, text);
},
buildHeader() {
const sorts = this.acceptedQuery ? this.acceptedQuery.sort : [];
this.sortState = sorts[0] || null; ROW_HELPERS.buildHeader.call(this);
for (const cell of this.headCells) {
const index = sorts.findIndex(sort => sort.column === cell.getAttribute("data-cx-column"));
if (index >= 0) {
cell.setAttribute("aria-sort", sorts.length === 1 ? sorts[index].direction === "asc" ? "ascending" : "descending" : "other");
cell.setAttribute("data-cx-sort", sorts[index].direction); cell.setAttribute("data-cx-sort-priority", String(index + 1));
const button = cell.querySelector(".cx-sort");
button.setAttribute("data-cx-sort-priority", String(index + 1));
button.setAttribute("aria-label", cell.getAttribute("aria-label") + ", " + sorts[index].direction + ", " + (index + 1));
}
}
},
cellOf(row, column) { return row.cells[column.id]; },
refreshRowState(element, row) { setAttr(element, "aria-selected", row.status || this.view.selection === "none" ? null : String(this.selected.has(row.key))); },
fillRow(element, row) {
const kind = row.status ? "status" : "node";
element._w = row;
if (element._kind !== kind || element._layout !== this.layout) {
element.textContent = ""; element._kind = kind; element._layout = this.layout; element._attrs = {}; element._cls = null;
element.setAttribute("role", "row"); element.style.height = this.rowH + "px"; element.style.width = this.rowWidth + "px";
element._cells = (row.status ? [null] : this.cols).map((column, index) => {
const cell = this.cell(element, index, column ? column.width : this.rowWidth, column ? column.kind : null);
if (!column) cell.setAttribute("aria-colspan", String(this.cols.length));
const slot = { cell: cell, content: cell, base: cell.className, cls: null, title: null, badges: [], mode: "default" };
slot.textSpan = cell.appendChild(h("span", "cx-text")); slot.text = slot.textSpan.appendChild(document.createTextNode("")); return slot;
});
}
setClass(element, "cx-row" + (row.status ? " cx-status cx-" + row.status : ""));
setAttr(element, "data-cx-id", row.key || null); setAttr(element, "data-cx-status", row.status || null);
setAttr(element, "aria-busy", row.status === "loading" ? "true" : null); this.refreshRowState(element, row);
if (row.status) element._cells[0].text.data = row.status === "error" ? fill(this.labels.loadError, {
error: ((this.pages.get(Math.floor(row._ri / this.pageSize) * this.pageSize) || {}).error || {}).message || ""
}) : this.labels.loading;
else for (let i = 0; i < this.cols.length; i++) this.paintSlot(element._cells[i], row.h, this.cols[i], this.columnIndex[i], row);
}
});
Object.assign(DataGrid.prototype, {
setFocus(row, focus) {
this.pendingNavigation = null;
if (!row || this.indexOf(row) < 0 || this.destroyed) return;
this.focused = row;
const top = this.rowTop(row._ri), viewport = this.grid.clientHeight - this.head.offsetHeight;
if (top < this.logicalTop()) this.setLogicalTop(top);
else if (top + this.rowH > this.logicalTop() + viewport) this.setLogicalTop(top + this.rowH - viewport);
this.render();
if (focus) { const element = this.rendered.get(row); if (element) element.focus({ preventScroll: true }); }
},
onClick(event) {
const element = event.target.closest(".cx-row"), row = element && element._w;
if (!row || event.defaultPrevented || event.target.closest("a,button,input,select,textarea,[contenteditable]")) return;
this.setFocus(row, true);
if (row.status) { if (row.status === "error") this.retry().catch(() => {}); return; }
if (this.view.selection === "none") return;
const next = this.multi && (event.ctrlKey || event.metaKey) ? new Set(this.selected) : new Set();
if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
this.setSelection([...next]);
},
onKey(event) {
const element = event.target.closest(".cx-row"), row = element && element._w;
if (!row || event.defaultPrevented || event.isComposing || event.altKey) return;
const cells = this.rowCells(element), navigation = this.pendingNavigation;
const pendingPage = navigation && navigation.focus && navigation.epoch === this.queryEpoch && this.pendingQuery &&
this.pendingPageNavigation && this.pendingPageNavigation.epoch === this.queryEpoch && this.focused === row;
let column = cells.findIndex(cell => cell.contains(event.target));
if (pendingPage || row.status && navigation && navigation.epoch === this.queryEpoch && navigation.index === row._ri && navigation.focus)
column = this.visibleColumns().findIndex(item => item.id === navigation.columnId);
const columnCount = row.status && column >= 0 ? this.visibleColumns().length : cells.length;
const cell = column >= 0 ? cells[column] : null, control = cell && event.target !== cell ? event.target : null;
if (!control && !row.status && (event.ctrlKey || event.metaKey)) {
if (event.key.toLowerCase() === "c" && !(global.getSelection() || "").toString()) {
event.preventDefault(); Promise.resolve().then(() => this.copyFocused(row, cell)).catch(error => this.emit("error", { error: error })); return;
}
if (event.key === "Enter" && typeof this.opts.onDetails === "function") {
event.preventDefault(); Promise.resolve().then(() => this.openDetails(row.key)).catch(error => this.emit("error", { error: error })); return;
}
}
const controls = cell ? cellControls(cell) : [];
if (control && control.matches(OWN_ARROWS)) {
if (event.key !== "Escape") return;
this.focusCell(row, column, null); cell._cxAt = controls.indexOf(control);
event.preventDefault(); event.stopPropagation(); return;
}
const at = control ? controls.indexOf(control) : cell && cell._cxAt >= 0 && cell._cxAt < controls.length ? cell._cxAt : -1;
let index = pendingPage ? navigation.index : row._ri, nextColumn = column, nextControl = null;
switch (event.key) {
case "ArrowUp": index--; break;
case "ArrowDown": index++; break;
case "PageUp": index -= Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)); break;
case "PageDown": index += Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)); break;
case "Home": if (event.ctrlKey || event.metaKey) index = this.cursor ? this.rowBounds().first : 0; else nextColumn = 0; break;
case "End": if (event.ctrlKey || event.metaKey) index = this.rowCount() - 1; else nextColumn = columnCount - 1; break;
case "ArrowLeft":
if (at > 0) nextControl = at - 1;
else if (column > 0) { nextColumn--; nextControl = -1; }
else { this.setFocus(row, true); event.preventDefault(); return; }
break;
case "ArrowRight":
if (at >= 0 && at < controls.length - 1) nextControl = at + 1;
else nextColumn = Math.min(columnCount - 1, column + 1);
break;
case "Escape": this.setFocus(row, true); event.preventDefault(); return;
case "F2":
if (column >= 0) { this.setFocus(row, true); event.preventDefault(); return; }
case "Enter":
if (row.status) { if (row.status === "error") this.retry().catch(() => {}); }
else if (!control) this.focusCell(row, Math.max(0, column), Math.max(0, at), true);
else return;
event.preventDefault(); return;
case " ":
if (control || row.status || this.view.selection === "none") return;
{ const next = this.multi ? new Set(this.selected) : new Set();
if (next.has(row.key)) next.delete(row.key); else next.add(row.key); this.setSelection([...next]); }
event.preventDefault(); return;
default: return;
}
index = Math.max(this.cursor ? this.rowBounds().first : 0, Math.min(this.rowCount() - 1, index));
this.focusResult(index, true, nextColumn, nextControl).catch(error => { if (error.name !== "AbortError") this.emit("error", { error: error }); });
event.preventDefault(); event.stopPropagation();
}
});
function gridStateColumn(column) { return { id: column.id, width: column.width, hidden: !!column.hidden }; }
function gridStateColumns(grid, input) {
if (!Array.isArray(input)) throw new Error("CanopyX: state columns must be an array.");
const seen = new Set(), declared = new Set(grid.columns.map(column => column.id));
const columns = input.map(column => readStateColumn(column, seen)).filter(column => declared.has(column.id));
for (const column of grid.columns) if (!seen.has(column.id)) columns.push(gridStateColumn(column));
if (!columns.some(column => !column.hidden)) throw new Error("CanopyX: keep at least one column visible.");
return columns;
}
Object.assign(DataGrid.prototype, {
prepareState() {
this.storageKey = this.view.stateKey ? "cx:grid:" + this.view.stateKey + ":" + this.view.id : null;
this.savedViews = new Map();
this.defaultState = { version: 1, view: this.view.id,
columns: this.columns.map(gridStateColumn),
query: gridQuery(this.view, gridQueryStart(this.view.query)),
timeZone: this.local ? "local" : "utc", selection: [], scrollTop: 0 };
if (this.paged) this.defaultState.paging = { pageLength: this.pageLength, offset: 0 };
const stored = this.readStoredState();
if (stored && Array.isArray(stored.views)) {
for (const entry of stored.views.slice(0, 20)) {
try { this.savedViews.set(this.viewName(entry.name), this.readGridState(entry.state)); } catch (_) { /* Removed or invalid saved views are skipped. */ }
}
}
try { this.initialState = stored && stored.current ? this.readGridState(stored.current) : null; } catch (_) { this.initialState = null; }
},
initializeState() { return this.initialState ? this.setState(this.initialState) : this.setQuery(this.view.query || {}); },
getState() {
const query = this.getQuery() || this.defaultState.query;
const state = { version: 1, view: this.view.id,
columns: this.columns.map(gridStateColumn),
query: JSON.parse(JSON.stringify(Object.assign({}, query, { offset: this.cursor ? undefined : 0, cursor: undefined, revision: undefined }))),
timeZone: this.local ? "local" : "utc", selection: [...this.selected], scrollTop: this.grid ? this.logicalTop() : 0 };
if (this.paged) state.paging = { pageLength: this.pageLength, offset: this.cursor ? 0 : this.pageOffset };
return state;
},
readGridState(state) {
if (!state || state.version !== 1 || state.view !== this.view.id || !["utc", "local"].includes(state.timeZone) ||
!Number.isFinite(state.scrollTop) || state.scrollTop < 0 || state.scrollTop > MAX_PROTOCOL_INTEGER * this.rowH || !Array.isArray(state.selection))
throw new Error("CanopyX: invalid grid state.");
const columns = gridStateColumns(this, state.columns);
const selection = [...new Set(state.selection.map(id => { requireIdentifier(id, "state selection ID"); return id; }))];
if (this.view.selection === "none" && selection.length || !this.multi && selection.length > 1) throw new Error("CanopyX: invalid state selection.");
const input = state.query;
if (!input || typeof input !== "object" || !Array.isArray(input.sort) || !Array.isArray(input.filters)) throw new Error("CanopyX: invalid state query.");
const known = id => this.columns.some(column => column.id === id);
const query = gridQuery(this.view, gridQueryStart(input, {
sort: input.sort.filter(sort => sort && known(sort.column)), filters: input.filters.filter(filter => filter && known(filter.column)) }));
const parsed = { version: 1, view: this.view.id, columns: columns, query: query,
timeZone: state.timeZone, selection: selection, scrollTop: state.scrollTop };
if (this.paged || state.paging) {
const paging = state.paging || this.defaultState.paging;
if (!paging || !Number.isInteger(paging.pageLength) || paging.pageLength < 1 || paging.pageLength > 10000 ||
!Number.isInteger(paging.offset) || paging.offset < 0 || paging.offset > MAX_PROTOCOL_INTEGER || this.cursor && paging.offset !== 0)
throw new Error("CanopyX: invalid paged view state.");
if (this.paged) {
parsed.paging = { pageLength: paging.pageLength, offset: paging.offset };
if (!state.paging) parsed.scrollTop = 0;
} else parsed.scrollTop = Math.min(MAX_PROTOCOL_INTEGER * this.rowH, paging.offset * this.rowH + state.scrollTop);
}
return parsed;
},
async setState(input) {
const state = this.readGridState(input);
clearTimeout(this.searchTimer); this.searchTimer = null;
const pending = this.setQuery(Object.assign({}, state.query, { offset: state.paging ? state.paging.offset : 0 }), state.paging), epoch = this.queryEpoch;
this.restoringEpoch = epoch;
try {
await pending;
if (this.destroyed || epoch !== this.queryEpoch) throw new DOMException("Grid state was superseded.", "AbortError");
this.applyStatePresentation(state);
return this.getQuery();
} finally {
if (this.restoringEpoch === epoch) { this.restoringEpoch = null; this.stateChanged(); }
}
},
applyStatePresentation(state) {
if (this.cancelResize) this.cancelResize();
const current = new Map(this.columns.map(column => [column.id, column]));
this.columns = state.columns.map(saved => Object.assign(current.get(saved.id), saved));
this.setTimeZone(state.timeZone); this.setSelection(state.selection);
this.buildHeader(); this.syncColumnControls(); this.setLogicalTop(state.scrollTop); this.render();
},
setColumnOrder(ids) {
if (!Array.isArray(ids) || ids.length !== this.columns.length || new Set(ids).size !== ids.length ||
ids.some(id => !this.columns.some(column => column.id === id))) throw new Error("CanopyX: name each column once.");
if (this.cancelResize) this.cancelResize();
const columns = new Map(this.columns.map(column => [column.id, column]));
this.columns = ids.map(id => columns.get(id)); this.buildHeader(); this.syncColumnControls(); this.scheduleRender(); this.stateChanged();
},
viewName(name) {
if (typeof name !== "string" || !name.trim() || name.trim().length > 100) throw new Error("CanopyX: view names need 1 to 100 nonblank characters.");
return name.trim();
},
getSavedViews() { return [...this.savedViews.keys()]; },
saveView(name) {
name = this.viewName(name);
if (!this.getQuery()) throw new Error("CanopyX: saving needs an accepted query.");
if (!this.savedViews.has(name) && this.savedViews.size >= 20) throw new Error("CanopyX: maximum 20 saved views.");
this.savedViews.set(name, this.getState()); this.writeStoredState(this.getState()); this.syncSavedViews();
if (this.savedChoice) this.savedChoice.value = name;
},
applySavedView(name) {
const state = this.savedViews.get(this.viewName(name));
if (!state) throw new Error("CanopyX: the saved view does not exist.");
return this.setState(state);
},
removeSavedView(name) { this.savedViews.delete(this.viewName(name)); this.writeStoredState(this.getState()); this.syncSavedViews(); },
resetView() { return this.setState(this.defaultState); },
readStoredState() {
if (!this.storageKey) return null;
try { return JSON.parse(global.sessionStorage.getItem(this.storageKey)); } catch (_) { return null; }
},
writeStoredState(state) {
if (!this.storageKey || this.destroyed) return;
try { global.sessionStorage.setItem(this.storageKey, JSON.stringify({ current: state, views: [...this.savedViews].map(([name, value]) => ({ name: name, state: value })) })); }
catch (_) { /* A disabled or full storage leaves the current session usable. */ }
}
});
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridResultCount: "{count} of {total} rows", gridClearQuery: "Clear search and filters",
gridRemoveSearch: "Clear search: {search}", gridGroupedFilters: "Grouped filters ({count} conditions)",
gridRemoveGroup: "Clear grouped filters", gridRemoveCondition: "Remove condition: {condition}"
}));
Object.assign(DataGrid.prototype, {
buildGridSearch() {
const search = h("div", "cx-search"), input = this.searchInput = h("input", "cx-search-input"), signal = this.lifetime.signal;
input.type = "search"; input.placeholder = this.labels.searchPlaceholder; input.setAttribute("aria-label", this.labels.searchPlaceholder);
const update = () => {
clearTimeout(this.searchTimer); this.searchTimer = null;
if (this.destroyed || this.searchComposing) return;
if (this.queryForChange().search === input.value) return;
this.setQuery(gridQueryStart(this.queryForChange(), { search: input.value })).catch(() => {});
};
GRID_REPORTING.search?.(this, update);
const schedule = () => {
clearTimeout(this.searchTimer); this.searchTimer = null;
if (this.searchComposing) return;
if (this.searchDelayMs === 0) update(); else this.searchTimer = setTimeout(update, this.searchDelayMs);
};
input.addEventListener("compositionstart", () => { this.searchComposing = true; clearTimeout(this.searchTimer); this.searchTimer = null; }, { signal: signal });
input.addEventListener("compositionend", () => { this.searchComposing = false; schedule(); }, { signal: signal });
input.addEventListener("input", event => { if (!event.isComposing) schedule(); }, { signal: signal });
input.addEventListener("keydown", event => {
if (event.key === "Enter" && !this.searchComposing && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); update(); }
}, { signal: signal });
search.appendChild(input); this.toolbar.appendChild(search);
},
buildQuerySummary() {
this.querySummary = h("div", "cx-grid-query-summary");
this.resultCount = h("span", "cx-grid-result-count"); this.resultCount.setAttribute("role", "status");
this.queryChips = h("div", "cx-grid-query-chips");
this.querySummary.append(this.resultCount, this.queryChips); this.toolbar.appendChild(this.querySummary);
},
syncQuerySummary() {
if (!this.acceptedQuery || !this.querySummary) return;
const query = this.acceptedQuery, active = document.activeElement, focused = this.queryChips.contains(active);
const key = focused && active.getAttribute("data-cx-condition");
const numbers = numberFormat(this.lang);
setText(this.resultCount, this.snapshot.matched === null ? this.labels.gridUnknownCount : fill(this.snapshot.total === null ?
this.labels.gridMatchedCount : this.labels.gridResultCount, { count: numbers.format(this.snapshot.matched), total: numbers.format(this.snapshot.total) }));
this.queryChips.textContent = "";
const apply = patch => {
this.setQuery(gridQueryStart(this.queryForChange(true), patch)).catch(() => {});
};
const chip = (text, label, id, run) => {
const button = gridButton(text + " ×", () => { button.focus({ preventScroll: true }); run(); }); button.classList.add("cx-grid-chip");
button.title = text;
button.setAttribute("aria-label", label); button.setAttribute("data-cx-condition", id); this.queryChips.appendChild(button);
};
if (query.search) chip(query.search, fill(this.labels.gridRemoveSearch, { search: query.search }), "search", () => {
if (this.searchInput) this.searchInput.value = ""; apply({ search: "" });
});
query.filters.forEach((filter, index) => {
const column = this.columns.find(item => item.id === filter.column), name = GRID_FILTER_LABELS[filter.operator];
const condition = column.title + " " + (this.labels[name] || name) + (filter.values.length ? " " + filter.values.join(", ") : "");
chip(condition, fill(this.labels.gridRemoveCondition, { condition: condition }), "filter-" + index, () => {
const filters = this.queryForChange().filters.slice(), at = filters.findIndex(item => JSON.stringify(item) === JSON.stringify(filter));
if (at >= 0) { filters.splice(at, 1); apply({ filters: filters }); }
});
});
if (query.filterGroup) {
const count = group => group.filters.length + group.groups.reduce((total, child) => total + count(child), 0);
chip(fill(this.labels.gridGroupedFilters, { count: numbers.format(count(query.filterGroup)) }), this.labels.gridRemoveGroup, "group", () => {
if (JSON.stringify(this.queryForChange().filterGroup) === JSON.stringify(query.filterGroup)) apply({ filterGroup: undefined });
});
}
if (query.search || query.filters.length || query.filterGroup) {
const clear = gridButton(this.labels.gridClearQuery, () => {
clear.focus({ preventScroll: true });
if (this.searchInput) this.searchInput.value = ""; apply({ search: "", filters: [], filterGroup: undefined });
});
clear.setAttribute("data-cx-condition", "clear"); this.queryChips.appendChild(clear);
}
if (focused) {
const target = [...this.queryChips.children].find(button => button.getAttribute("data-cx-condition") === key);
(target || this.queryChips.lastElementChild || this.searchInput || this.grid).focus({ preventScroll: true });
}
}
});
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridFilters: "Filters", gridColumn: "Column", gridOperator: "Condition", gridValue: "Value (UTC for dates)",
gridValueType: "Raw value type", gridText: "Text", gridBoolean: "Boolean", gridAddFilter: "Add filter",
gridRemoveFilter: "Remove {column} filter", gridApply: "Apply", gridClearFilters: "Clear filters",
gridMoveEarlier: "Move {column} earlier", gridMoveLater: "Move {column} later",
gridViews: "Saved views", gridViewName: "View name", gridSaveView: "Save view", gridRemoveView: "Remove view",
gridResetView: "Reset view", gridChooseView: "Choose a saved view", gridInvalidFilter: "Enter a valid filter value.",
gridContains: "contains", gridStartsWith: "starts with", gridIn: "is any of (one per line)", gridIsNull: "is missing", gridIsNotNull: "is present"
}));
function gridButton(text, run) {
const button = h("button", "cx-button"); button.type = "button"; setText(button, text);
button.addEventListener("click", run); return button;
}
function gridInputLabel(text, input) {
const label = h("label", "cx-grid-field"); label.appendChild(document.createTextNode(text)); label.appendChild(input); return label;
}
function gridOption(value, text) {
const option = h("option"); option.value = value; setText(option, text); return option;
}
Object.assign(DataGrid.prototype, {
buildGridControls() {
this.controlFlyouts = [];
this.buildGridColumns(); this.buildGridFilters(); this.buildSavedViews();
this.buildExportControls();
this.toolbar.appendChild(gridButton(this.labels.gridResetView, () => this.resetView().catch(() => {})));
this.disposeControls = () => this.controlFlyouts.forEach(flyout => flyout.dispose());
document.addEventListener("pointerdown", event => {
for (const details of this.toolbar.children) if (details.open && !details.contains(event.target)) details.open = false;
}, { signal: this.lifetime.signal });
},
controlPanel(title, className, onOpen) {
const details = h("details", "cx-columns " + className), summary = h("summary"), panel = h("div", "cx-columns-list cx-grid-panel");
setText(summary, title); details.append(summary, panel); this.toolbar.appendChild(details);
const flyout = watchFlyout(details, panel, () => details.open); this.controlFlyouts.push(flyout);
details.addEventListener("toggle", () => { if (details.open) { if (onOpen) onOpen(panel); flyout.position(); } });
details.addEventListener("keydown", event => {
if (event.key === "Escape" && details.open) { details.open = false; summary.focus(); event.preventDefault(); event.stopPropagation(); }
});
return { details: details, panel: panel };
},
buildGridColumns() {
this.columnPanel = this.controlPanel(this.labels.columns, "cx-grid-columns", () => this.syncColumnControls()).panel;
this.syncColumnControls();
},
syncColumnControls() {
if (!this.columnPanel) return;
const active = document.activeElement, columnId = active && active.getAttribute("data-cx-layout-column"), action = active && active.getAttribute("data-cx-layout-action");
this.columnPanel.textContent = "";
this.columns.forEach((column, index) => {
const row = h("div", "cx-grid-column-choice"), input = h("input"); input.type = "checkbox"; input.checked = !column.hidden;
input.disabled = !column.hidden && this.visibleColumns().length === 1;
input.setAttribute("data-cx-layout-column", column.id); input.setAttribute("data-cx-layout-action", "visible");
input.addEventListener("change", () => this.setColumnVisible(column.id, input.checked));
row.appendChild(gridInputLabel(column.title, input));
for (const [delta, label] of [[-1, "gridMoveEarlier"], [1, "gridMoveLater"]]) {
const move = gridButton(delta < 0 ? "↑" : "↓", () => {
const ids = this.columns.map(item => item.id), at = ids.indexOf(column.id), next = at + delta;
if (next >= 0 && next < ids.length) { [ids[at], ids[next]] = [ids[next], ids[at]]; this.setColumnOrder(ids); }
});
move.disabled = index + delta < 0 || index + delta >= this.columns.length;
move.setAttribute("aria-label", fill(this.labels[label], { column: column.title }));
move.setAttribute("data-cx-layout-column", column.id); move.setAttribute("data-cx-layout-action", delta < 0 ? "earlier" : "later"); row.appendChild(move);
}
this.columnPanel.appendChild(row);
});
if (columnId) {
const target = [...this.columnPanel.querySelectorAll("[data-cx-layout-column]")].find(input =>
input.getAttribute("data-cx-layout-column") === columnId && input.getAttribute("data-cx-layout-action") === action && !input.disabled);
const available = [...this.columnPanel.querySelectorAll("[data-cx-layout-column]")].filter(input =>
input.getAttribute("data-cx-layout-column") === columnId && !input.disabled);
const fallback = available.find(input => input.getAttribute("data-cx-layout-action") !== "visible") || available[0];
(target || fallback || this.columnPanel.parentNode.querySelector("summary")).focus({ preventScroll: true });
}
},
buildSavedViews() {
const panel = this.controlPanel(this.labels.gridViews, "cx-grid-views").panel;
const choice = this.savedChoice = h("select"), name = h("input"); name.type = "text"; name.maxLength = 100;
choice.setAttribute("aria-label", this.labels.gridChooseView);
panel.appendChild(choice); panel.appendChild(gridInputLabel(this.labels.gridViewName, name));
const error = h("p", "cx-grid-control-error"); error.setAttribute("role", "status");
const run = action => {
try { Promise.resolve(action()).then(() => setText(error, ""), failure => setText(error, failure.message)); }
catch (failure) { setText(error, failure.message); }
};
panel.appendChild(gridButton(this.labels.gridApply, () => run(() => this.applySavedView(choice.value))));
panel.appendChild(gridButton(this.labels.gridSaveView, () => run(() => this.saveView(name.value))));
panel.appendChild(gridButton(this.labels.gridRemoveView, () => run(() => this.removeSavedView(choice.value)))); panel.appendChild(error);
this.syncSavedViews();
},
syncSavedViews() {
if (!this.savedChoice) return;
const selected = this.savedChoice.value; this.savedChoice.textContent = "";
this.savedChoice.appendChild(gridOption("", this.labels.gridChooseView));
this.getSavedViews().forEach(name => this.savedChoice.appendChild(gridOption(name, name)));
if (this.savedViews.has(selected)) this.savedChoice.value = selected;
}
});
const GRID_FILTER_LABELS = { eq: "=", ne: "≠", contains: "gridContains", startsWith: "gridStartsWith", in: "gridIn",
gt: ">", ge: "≥", lt: "<", le: "≤", isNull: "gridIsNull", isNotNull: "gridIsNotNull" };
Object.assign(DataGrid.prototype, {
buildGridFilters() {
this.controlPanel(this.labels.gridFilters, "cx-grid-filters", panel => this.renderGridFilters(panel));
},
renderGridFilters(panel) {
panel.textContent = "";
const form = h("form", "cx-grid-filter-form"), rows = h("div"), error = h("p", "cx-grid-control-error");
error.setAttribute("role", "status");
const add = predicate => this.addGridFilter(rows, predicate);
(this.queryForChange().filters || []).forEach(add);
form.appendChild(rows); form.appendChild(gridButton(this.labels.gridAddFilter, () => add(null)));
const apply = h("button", "cx-button"); apply.type = "submit"; setText(apply, this.labels.gridApply); form.appendChild(apply);
form.appendChild(gridButton(this.labels.gridClearFilters, () => {
rows.textContent = ""; this.setQuery(gridQueryStart(this.queryForChange(true), { filters: [], filterGroup: undefined })).catch(failure => setText(error, failure.message));
}));
form.appendChild(error); panel.appendChild(form);
form.addEventListener("submit", event => {
event.preventDefault();
try {
const filters = [...rows.children].map(row => this.readGridFilter(row));
this.setQuery(gridQueryStart(this.queryForChange(true), { filters: filters }))
.then(() => setText(error, ""), failure => setText(error, failure.message));
} catch (failure) { setText(error, failure.message); }
});
},
addGridFilter(parent, predicate) {
if (parent.children.length >= 64) return;
const row = h("fieldset", "cx-grid-filter"), column = h("select"), operator = h("select"),
multiple = h("textarea", "cx-grid-filter-value"), type = h("select");
let remove, input = h("textarea", "cx-grid-filter-value");
const legend = h("legend", "cx-sr-only"); setText(legend, this.labels.gridFilters); row.appendChild(legend);
multiple.rows = 2; input.rows = 2;
for (const item of this.columns) column.appendChild(gridOption(item.id, item.title));
if (predicate) column.value = predicate.column;
for (const [value, name] of [["string", "gridText"], ["boolean", "gridBoolean"]]) {
type.appendChild(gridOption(value, this.labels[name]));
}
if (predicate && predicate.values.length && predicate.values.some(value => typeof value === "boolean")) {
if (predicate.values.every(value => typeof value === "boolean")) type.value = "boolean";
else {
type.appendChild(gridOption("mixed", this.labels.gridText + " / " + this.labels.gridBoolean)); type.value = "mixed";
}
}
const columnField = gridInputLabel(this.labels.gridColumn, column), conditionField = gridInputLabel(this.labels.gridOperator, operator);
const typeField = gridInputLabel(this.labels.gridValueType, type), valueField = gridInputLabel(this.labels.gridValue, input),
multipleField = gridInputLabel(this.labels.gridValue, multiple);
multipleField.hidden = true; row.append(columnField, conditionField, typeField, valueField, multipleField);
const change = () => {
const definition = this.columns.find(item => item.id === column.value), previous = operator.value;
const operators = definition.kind === "text" ? ["eq", "ne", "contains", "startsWith", "in", "isNull", "isNotNull"] :
["eq", "ne", "in", "gt", "ge", "lt", "le", "isNull", "isNotNull"];
operator.textContent = "";
operators.forEach(name => operator.appendChild(gridOption(name, this.labels[GRID_FILTER_LABELS[name]] || GRID_FILTER_LABELS[name])));
if (operators.includes(previous)) operator.value = previous;
const raw = input.value, next = h(definition.kind === "text" ? "textarea" : "input", "cx-grid-filter-value");
if (definition.kind === "text") next.rows = 2;
else { next.type = definition.kind === "number" ? "number" : "datetime-local"; next.step = "any"; }
next.value = raw; input.replaceWith(next); input = next;
input.addEventListener("input", () => { row._filter.edited = true; });
if (row._filter) row._filter.input = input;
if (remove) setText(remove, fill(this.labels.gridRemoveFilter, { column: definition.title }));
typeField.hidden = definition.kind !== "text"; update();
};
const update = () => {
const raw = multipleField.hidden ? input.value : multiple.value, none = ["isNull", "isNotNull"].includes(operator.value), many = operator.value === "in";
valueField.hidden = none || many; multipleField.hidden = none || !many;
input.disabled = none || many; multiple.disabled = none || !many; type.disabled = none || typeField.hidden;
if (many) multiple.value = raw; else input.value = raw;
};
column.addEventListener("change", change); operator.addEventListener("change", update); change();
if (predicate) {
operator.value = predicate.operator;
if (operator.value === "in") {
multipleField.hidden = false; multiple.value = predicate.values.join("\n");
} else input.value = input.type === "datetime-local" && predicate.values.length ? new Date(predicate.values[0]).toISOString().slice(0, -1) : predicate.values.join("\n");
update();
}
remove = gridButton(fill(this.labels.gridRemoveFilter, { column: this.columns.find(item => item.id === column.value).title }), () => row.remove());
row.appendChild(remove); row._filter = { column: column, operator: operator, input: input, multiple: multiple, type: type,
original: predicate && { column: predicate.column, operator: predicate.operator, values: predicate.values.slice() }, edited: false };
for (const field of [column, operator, type, multiple]) {
field.addEventListener("change", () => { row._filter.edited = true; });
field.addEventListener("input", () => { row._filter.edited = true; });
}
parent.appendChild(row);
},
readGridFilter(row) {
const fields = row._filter, column = this.columns.find(item => item.id === fields.column.value), operator = fields.operator.value;
if (fields.original && !fields.edited) return fields.original;
const value = operator === "in" ? fields.multiple.value : fields.input.value;
const values = ["isNull", "isNotNull"].includes(operator) ? [] : (operator === "in" ? value.split(/\r?\n/) : [value]).map(raw => {
if (column.kind === "number") {
if (!raw.trim() || !Number.isFinite(Number(raw))) throw new Error(this.labels.gridInvalidFilter);
return Number(raw);
}
if (column.kind === "datetime") {
const text = /(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw + "Z";
gridScalar(text, column); return text;
}
if (fields.type.value === "boolean") {
if (!["true", "false"].includes(raw)) throw new Error(this.labels.gridInvalidFilter);
return raw === "true";
}
if (fields.type.value === "mixed") throw new Error(this.labels.gridInvalidFilter);
return raw;
});
return { column: column.id, operator: operator, values: values };
}
});
function gridFreeze(value) {
if (value && typeof value === "object" && !Object.isFrozen(value)) {
Object.values(value).forEach(gridFreeze); Object.freeze(value);
}
return value;
}
function gridExportField(value, delimiter) {
if (value == null) return "";
let text = String(value);
if (typeof value !== "number" && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = "'" + text;
return text.includes(delimiter) || /["\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function gridOperationActive(grid, signal) {
if (grid.destroyed || signal?.aborted) throw new DOMException("Grid cancelled.", "AbortError");
}
Object.assign(DataGrid.prototype, {
prepareExport(options) {
if (!this.view.reporting && ["fileName", "locale", "timeZone", "onProgress"].some(key => options?.[key] !== undefined))
throw new Error("CanopyX: export metadata requires reporting.");
if (this.destroyed || !this.acceptedQuery) throw new Error("CanopyX: export needs an accepted query.");
if (!options || !["filtered", "selected", "all"].includes(options.scope)) throw new Error("CanopyX: explicit export scope required.");
const { scope, values, signal } = options, filtered = scope === "filtered";
const columnIds = options.columns === undefined ? this.visibleColumns().map(column => column.id) : options.columns;
const columns = Array.isArray(columnIds) ? columnIds.map(id => this.columns.find(column => column.id === id)) : [];
if (!Array.isArray(columnIds) || !columnIds.length || new Set(columnIds).size !== columnIds.length ||
columns.some(column => !column)) throw new Error("CanopyX: invalid export columns.");
if (values !== undefined && !["raw", "display"].includes(values)) throw new Error("CanopyX: export values must be raw/display.");
if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error("CanopyX: export requires AbortSignal.");
const query = gridQuery(this.view, { ...this.acceptedQuery, offset: 0, cursor: undefined, limit: this.pageSize,
search: filtered ? this.acceptedQuery.search : "",
filterGroup: filtered ? this.acceptedQuery.filterGroup : undefined,
filters: filtered ? this.acceptedQuery.filters : [] });
const request = gridFreeze({ scope, query, revision: this.snapshot.revision,
total: this.snapshot.total, matched: this.snapshot.matched, selection: scope === "selected" ? [...this.selected] : [],
columns: columns.map(({ id, title, kind }) => ({ id, title, kind })),
values: values || "display", timeZone: this.local ? "local" : "utc" });
return Object.freeze({ request, rows: () => this.exportRows(request, signal) });
},
async *exportRows(request, signal) {
const { scope } = request;
gridOperationActive(this, signal);
const remaining = new Set(request.selection), seen = new Set();
if (scope === "selected" && !remaining.size) return;
const expected = { revision: request.revision, total: request.total,
matched: scope === "filtered" ? request.matched : this.cursor ? undefined : request.total };
const tokens = new Set(); let cursor, offset = 0;
while (this.cursor || offset < expected.matched) {
gridOperationActive(this, signal);
const query = gridQuery(this.view, { ...request.query, offset: this.cursor ? undefined : offset, cursor });
const page = (this.cursor ? validateGridCursorPage : validateGridPage)(await this.requestPage(query, signal), this.view, query, expected);
if (this.cursor && (page.offset !== offset || scope !== "filtered" && page.total !== null &&
(page.matched !== null && page.matched !== page.total || page.nextCursor === undefined && page.offset + page.items.length !== page.total)))
throw new Error("CanopyX: incomplete cursor export.");
expected.matched = page.matched;
for (const row of page.items) {
gridOperationActive(this, signal);
if (seen.has(row.id)) throw new Error("CanopyX: repeated export row ID.");
seen.add(row.id);
if (scope !== "selected" || remaining.delete(row.id)) {
const cells = Object.create(null);
for (const column of request.columns) if (Object.hasOwn(row.cells, column.id)) cells[column.id] = row.cells[column.id];
yield gridFreeze({ id: row.id, cells });
}
}
offset += this.cursor ? page.items.length : request.query.limit;
if (this.cursor) {
cursor = page.nextCursor; if (cursor === undefined) break;
if (tokens.has(cursor)) throw new Error("CanopyX: cursor export repeated a token.");
tokens.add(cursor);
}
}
gridOperationActive(this, signal);
if (remaining.size) throw new Error("CanopyX: selected IDs absent from revision.");
},
async exportText(exported, maxRows = 50000, delimiter, signal) {
if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 1000000) throw new Error("CanopyX: export row limit is 1 to 1000000.");
const request = exported.request, expected = request.scope === "selected" ? request.selection.length : request.scope === "all" ? request.total : request.matched;
if (expected > maxRows) throw new Error("CanopyX: client row limit exceeded.");
const fmt = formatting(request.locale || this.lang, request.timeZone === "local", this.labels);
const lines = [request.columns.map(column => gridExportField(column.title, delimiter)).join(delimiter)];
let count = 0;
for await (const row of exported.rows()) {
if (++count > maxRows) throw new Error("CanopyX: client row limit exceeded.");
lines.push(request.columns.map(column => gridExportField(request.values === "raw" ? cellValue(row.cells[column.id]) :
cellText(row.cells[column.id], column, fmt), delimiter)).join(delimiter));
}
gridOperationActive(this, signal);
return lines.join("\r\n") + "\r\n";
},
toCsv(options) { return this.exportText(this.prepareExport(options), options.maxRows, ",", options.signal); },
exportToHost(format, options) {
const { request } = this.prepareExport(options);
if (typeof format !== "string" || !format.trim() || typeof this.opts.onExport !== "function") throw new Error("CanopyX: format and onExport required.");
return this.runGridHook(signal => this.opts.onExport({ format, request, signal }), options.signal);
}
});
Object.assign(DataGrid.prototype, {
scrollToRow(index) {
if (this.destroyed || !this.acceptedQuery || this.pendingQuery || !Number.isInteger(index) ||
index < (this.cursor ? this.pageOffset : 0) || index >= this.rowCount())
throw new Error("CanopyX: invalid accepted row position.");
return this.focusResult(index, false);
},
async runGridHook(run, signal) {
const controller = new AbortController(); let rejectHook;
const cancelled = new Promise((resolve, reject) => { rejectHook = reject; });
const abort = () => { controller.abort(); rejectHook(new DOMException("Grid cancelled.", "AbortError")); };
this.lifetime.signal.addEventListener("abort", abort, { once: true });
signal?.addEventListener("abort", abort, { once: true });
const timer = setTimeout(() => { controller.abort(); rejectHook(new Error("CanopyX: operation timed out.")); }, this.requestTimeoutMs);
try {
if (this.destroyed || signal?.aborted) abort();
return await Promise.race([Promise.resolve().then(() => {
gridOperationActive(this, controller.signal);
return run(controller.signal);
}), cancelled]);
} finally {
clearTimeout(timer); controller.abort(); this.lifetime.signal.removeEventListener("abort", abort);
signal?.removeEventListener("abort", abort);
}
},
async copy(options) {
const exported = this.prepareExport(options);
const text = await this.exportText(exported, options.maxRows === undefined ? 10000 : options.maxRows, "\t", options.signal);
await this.writeClipboard(text, options.signal); return text;
},
writeClipboard(text, signal) {
return this.runGridHook(() => {
const clipboard = global.navigator.clipboard;
if (typeof clipboard?.writeText !== "function") throw new Error("CanopyX: clipboard unavailable.");
return clipboard.writeText(text);
}, signal);
},
copyFocused(row, cell) {
if (this.selected.size) return this.copy({ scope: "selected" });
const columns = this.visibleColumns(), index = cell ? this.rowCells(this.rendered.get(row)).indexOf(cell) : -1;
const text = index >= 0 ? gridExportField(cellText(row.h.cells[columns[index].id], columns[index], this.fmt), "\t") :
columns.map(column => gridExportField(cellText(row.h.cells[column.id], column, this.fmt), "\t")).join("\t");
return this.writeClipboard(text);
},
openDetails(id) {
requireIdentifier(id, "detail row ID");
if (this.destroyed || !this.acceptedQuery || this.pendingQuery || typeof this.opts.onDetails !== "function")
throw new Error("CanopyX: details require accepted query and onDetails.");
const row = [...this.rowCache.values()].find(item => item.key === id);
if (!row) throw new Error("CanopyX: details require a loaded record.");
if (this.detailController) this.detailController.abort();
const controller = this.detailController = new AbortController(), dataSignal = this.dataLifetime.signal;
const abort = () => controller.abort(); dataSignal.addEventListener("abort", abort, { once: true });
const record = gridFreeze(JSON.parse(JSON.stringify(row.h))), query = this.acceptedQuery, returnFocus = document.activeElement;
return this.runGridHook(signal => this.opts.onDetails({ row: record, query, signal, returnFocus }), controller.signal)
.finally(() => { dataSignal.removeEventListener("abort", abort); if (this.detailController === controller) this.detailController = null; });
}
});
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridExport: "Export", gridFilteredResults: "Filtered results", gridSelectedRows: "Selected rows",
gridAllResults: "All results", gridDownloadCsv: "Download CSV", gridCopy: "Copy", gridDetails: "Record details"
}));
Object.assign(DataGrid.prototype, {
buildExportControls() {
const panel = this.controlPanel(this.labels.gridExport, "cx-grid-export").panel, scope = h("select");
scope.setAttribute("aria-label", this.labels.gridExport);
for (const [value, label] of [["filtered", "gridFilteredResults"], ["selected", "gridSelectedRows"], ["all", "gridAllResults"]]) {
scope.appendChild(gridOption(value, this.labels[label]));
}
panel.appendChild(scope);
const status = h("p", "cx-grid-control-error"); status.setAttribute("role", "status");
const run = action => {
buttons.forEach(button => button.disabled = true); setText(status, this.labels.loading);
Promise.resolve().then(action).then(() => setText(status, ""), error => {
setText(status, error.message); this.emit("error", { error: error });
}).finally(() => { if (!this.destroyed) buttons.forEach(button => button.disabled = false); });
};
const csv = gridButton(this.labels.gridDownloadCsv, () => run(async () => {
const text = await this.toCsv({ scope: scope.value }), url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
try {
if (this.destroyed) return;
const link = h("a"); link.href = url; link.download = this.view.id.replace(/[^a-z0-9_-]/gi, "_") + ".csv";
document.body.appendChild(link); link.click(); link.remove();
} finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}));
const copy = gridButton(this.labels.gridCopy, () => run(() => this.copy({ scope: scope.value })));
const buttons = [csv, copy]; panel.append(csv, copy, status);
if (typeof this.opts.onDetails === "function") this.toolbar.appendChild(gridButton(this.labels.gridDetails, () => {
try {
const row = this.focused || [...this.rowCache.values()].find(item => this.selected.has(item.key));
if (!row || row.status) throw new Error("CanopyX: focus a record for details.");
this.openDetails(row.key).catch(error => this.emit("error", { error: error }));
} catch (error) { this.emit("error", { error: error }); }
}));
}
});
function createDataGrid(host, options) {
if (!host || !options || !options.view) throw new Error("CanopyX: createDataGrid needs a host element and a grid document.");
const existing = activeGrids.get(host);
if (existing) return existing;
const grid = new DataGrid(host, options);
const api = {
element: host, view: grid.view, ready: grid.ready,
getTimeZone: () => grid.local ? "local" : "utc",
getSelection: () => [...grid.selected], clearSelection: () => grid.setSelection([]),
focus: () => grid.setFocus(grid.focused || grid.rowItem(grid.rowAt(grid.logicalTop())), true),
refresh: () => { grid.version++; grid.scheduleRender(); },
destroy: () => { grid.destroy(); if (activeGrids.get(host) === api) activeGrids.delete(host); if (host.canopyx === api) delete host.canopyx; }
};
for (const name of ["getQuery", "setQuery", "sort", "getPaging", "goToPage", "setPageLength", "firstPage", "previousPage", "nextPage",
"setColumnWidth", "setColumnVisible", "setColumnOrder", "getState", "setState", "resetView", "getSavedViews", "saveView",
"applySavedView", "removeSavedView", "setTimeZone", "setSelection", "prepareExport", "toCsv", "copy", "exportToHost", "openDetails", "scrollToRow", "retry"])
api[name] = grid[name].bind(grid);
GRID_REPORTING.api?.(api, grid);
Object.freeze(api);
activeGrids.set(host, api); host.setAttribute("data-canopyx-mounted", "true"); host.canopyx = api; return api;
}
function checkIntentPath(path) {
if (!Array.isArray(path) || !path.length) throw new Error("CanopyX: checking needs a complete node-ID path.");
const seen = new Set();
return path.map(id => {
requireIdentifier(id, "checking path ID");
if (seen.has(id)) throw new Error("CanopyX: a checking path cannot repeat an ID.");
seen.add(id);
return id;
});
}
function checkBranch() { return { value: null, mask: 0, children: new Map() }; }
class CheckIntents {
constructor(items, mode) {
if (!Array.isArray(items)) throw new Error("CanopyX: checkIntents must be an array.");
this.mode = mode;
this.root = checkBranch();
for (const item of items) {
if (!item || typeof item.checked !== "boolean") throw new Error("CanopyX: a checking intent needs a boolean checked value.");
const path = checkIntentPath(item.path);
let branch = this.root;
for (const id of path) {
if (!branch.children.has(id)) branch.children.set(id, checkBranch());
branch = branch.children.get(id);
}
if (branch.value !== null) throw new Error("CanopyX: a checking path cannot have duplicate intents.");
branch.value = item.checked;
}
const pending = [{ branch: this.root, inherited: false, visited: false }];
while (pending.length) {
const frame = pending.pop(), branch = frame.branch;
if (frame.visited) {
branch.mask = branch.value === null ? 0 : branch.value ? 1 : 2;
for (const child of branch.children.values()) branch.mask |= child.mask;
continue;
}
if (mode === "hierarchical" && branch.value === frame.inherited) branch.value = null;
const inherited = branch.value === null ? frame.inherited : branch.value;
pending.push({ branch, inherited, visited: true });
for (const child of branch.children.values()) pending.push({ branch: child, inherited, visited: false });
}
}
snapshot() {
const result = [], pending = [{ branch: this.root, path: [] }];
while (pending.length) {
const { branch, path } = pending.pop();
if (branch.value !== null) result.push({ path, checked: branch.value });
const children = Array.from(branch.children).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
for (let i = children.length - 1; i >= 0; i--) pending.push({ branch: children[i][1], path: path.concat(children[i][0]) });
}
return result;
}
state(path) {
let branch = this.root, checked = false;
for (const id of path) {
branch = branch && branch.children.get(id);
if (branch && branch.value !== null && this.mode === "hierarchical") checked = branch.value;
}
if (this.mode === "independent") return !!branch && branch.value === true;
return branch && (branch.mask & (checked ? 2 : 1)) ? "mixed" : checked;
}
with(path, checked) {
const samePrefix = rule => path.every((id, index) => rule.path[index] === id);
const items = this.snapshot().filter(rule => !(samePrefix(rule) && (this.mode === "hierarchical" || rule.path.length === path.length)));
items.push({ path: path.slice(), checked });
return new CheckIntents(items, this.mode);
}
}
TreeGrid = class extends TreeGrid {
constructor(host, options) {
const mode = options.view && options.view.checkboxes;
if (mode !== undefined && mode !== "independent" && mode !== "hierarchical") throw new Error("CanopyX: unknown checkbox mode.");
if (!mode && options.view && options.view.checkIntents !== undefined) throw new Error("CanopyX: checking intents require checkboxes.");
if (mode) new CheckIntents(options.view.checkIntents === undefined ? [] : options.view.checkIntents, mode);
for (const name of ["isCheckable", "beforeCheck", "onCheck"]) {
if (options[name] !== undefined && typeof options[name] !== "function") throw new Error("CanopyX: " + name + " must be a function.");
}
super(host, options);
}
async init() {
this.checkMode = this.view.checkboxes || null;
this.checkRevision = 0;
this.checks = new CheckIntents(this.view.checkIntents === undefined ? [] : this.view.checkIntents, this.checkMode);
await super.init();
this.paintCheckedRows();
}
interactionApi() {
return {
getCheckState: id => {
const w = this.keyMap.get(id);
return !this.destroyed && this.checkMode && w && !w.status && !w.h.detail ? this.checks.state(this.pathOf(w)) : null;
},
getCheckIntents: () => !this.destroyed && this.checkMode ? this.checks.snapshot() : [],
setChecked: (id, checked) => this.setChecked(id, checked),
setCheckIntents: items => this.setCheckIntents(items)
};
}
canCheck(w) {
return !!this.checkMode && !w.status && !w.h.detail && !w._invalidated &&
(!this.opts.isCheckable || this.opts.isCheckable(w.h) !== false);
}
checkSnapshot(model) {
return Object.freeze(model.snapshot().map(item => Object.freeze({ path: Object.freeze(item.path), checked: item.checked })));
}
voteCheck(next, w, reason, revision) {
const intents = this.checkSnapshot(next), previous = this.checkSnapshot(this.checks);
const node = w ? w.h : null, context = Object.freeze({ previous, reason });
if (this.opts.beforeCheck) {
const decision = this.opts.beforeCheck(node, intents, context);
if (decision && typeof decision.then === "function") {
Promise.resolve(decision).catch(() => {});
throw new Error("CanopyX: beforeCheck must return synchronously.");
}
if (decision === false) return false;
}
const event = new CustomEvent("canopyx:beforecheck", { bubbles: true, cancelable: true,
detail: Object.freeze({ node, intents, previous, reason }) });
return this.host.dispatchEvent(event) && !this.destroyed && revision === this.checkRevision &&
(!w || !w._invalidated && this.keyMap.get(w.key) === w && this.canCheck(w)) && revision === this.checkRevision;
}
commitCheck(next, w, reason, revision) {
if (!this.voteCheck(next, w, reason, revision)) return false;
this.checks = next;
this.checkRevision++;
this.paintCheckedRows();
this.stateChanged();
this.notifyCheck(w, reason);
return true;
}
notifyCheck(w, reason) {
const model = this.checks;
const detail = Object.freeze({ node: w ? w.h : null, intents: this.checkSnapshot(model), reason });
if (this.opts.onCheck) this.opts.onCheck(detail.node, detail.intents, { reason });
if (!this.destroyed && this.checks === model) this.emit("check", detail);
}
setCheckIntents(items) {
if (this.destroyed || !this.checkMode || this.initializing || this.restoring) return false;
const revision = this.checkRevision;
return this.commitCheck(new CheckIntents(items, this.checkMode), null, "api", revision);
}
setChecked(id, checked, reason) {
if (typeof checked !== "boolean") throw new Error("CanopyX: checked must be a boolean.");
if (this.destroyed || !this.checkMode || this.initializing || this.restoring) return false;
const revision = this.checkRevision, w = this.keyMap.get(id);
if (!w || !this.canCheck(w) || revision !== this.checkRevision) return false;
let next = this.checks.with(this.pathOf(w), checked);
if (this.checkMode === "hierarchical" && !(this.queryAware && this.acceptedQuery.filters.length)) {
for (let parent = w.parent; parent && parent !== this.root; parent = parent.parent) {
if (!parent.children || parent.next || !parent.children.length || parent.total != null && parent.total !== parent.children.length ||
parent.children.some(child => child.h.detail)) break;
const values = parent.children.map(child => next.state(this.pathOf(child)));
if (values.some(value => value === "mixed") || !values.every(value => value === values[0])) break;
next = next.with(this.pathOf(parent), values[0]);
}
}
return this.commitCheck(next, w, reason || "api", revision);
}
toggleCheck(w, reason) {
return this.setChecked(w.key, this.checks.state(this.pathOf(w)) !== true, reason);
}
paintTreeSlot(slot, w) {
super.paintTreeSlot(slot, w);
if (!this.checkMode) return;
if (!slot.check) {
slot.check = h("input", "cx-check");
slot.check.type = "checkbox";
slot.check.tabIndex = -1;
}
if (slot.check.nextSibling !== slot.content) slot.cell.insertBefore(slot.check, slot.content);
this.paintCheck(slot.check, w);
}
paintCheck(input, w) {
const value = this.checks.state(this.pathOf(w));
input.checked = value === true;
input.indeterminate = value === "mixed";
setAttr(input, "aria-checked", value === "mixed" ? "mixed" : String(value));
setAttr(input, "aria-label", w.h.label);
input.disabled = this.initializing || this.restoring || !this.canCheck(w);
}
paintCheckedRows() {
if (this.destroyed || !this.checkMode) return;
for (const [w, row] of this.rendered) {
const input = row._kind === "node" && row._cells[0].check;
if (input) this.paintCheck(input, w);
}
}
onClick(event) {
if (!event.defaultPrevented && event.target.classList.contains("cx-check")) {
event.preventDefault();
event.stopPropagation();
const w = this.rowFromEvent(event);
if (w) { this.setFocus(w, false); this.toggleCheck(w, "pointer"); this.scheduleRender(); }
return;
}
super.onClick(event);
}
onKey(event) {
const row = event.target.closest(".cx-row");
const w = row && row === event.target && this.rowFromEvent(event);
if (!event.defaultPrevented && !event.isComposing && this.checkMode && row === event.target && event.key === " " &&
w && !w.status && !w.h.detail &&
!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
!(this.typeBuf && performance.now() - this.typeAt <= TYPEAHEAD_MS)) {
event.preventDefault();
event.stopPropagation();
this.toggleCheck(w, "keyboard");
return;
}
super.onKey(event);
}
getState() {
const state = super.getState();
if (this.checkMode) { state.checkboxes = this.checkMode; state.checkIntents = this.checks.snapshot(); }
return state;
}
toOutline() {
const model = this.checks, items = this.rows.filter(w => !w.status).map(w =>
({ path: this.pathOf(w), label: w.h.label, detail: !!w.h.detail }));
const markup = super.toOutline();
if (!this.checkMode) return markup;
const holder = h("div");
holder.innerHTML = markup;
const rows = holder.querySelector("table").tBodies[0].rows;
items.forEach((item, index) => {
if (item.detail) return;
const value = model.state(item.path), marker = h("span");
marker.setAttribute("role", "checkbox");
marker.setAttribute("aria-readonly", "true");
marker.setAttribute("aria-label", item.label);
marker.setAttribute("aria-checked", value === "mixed" ? "mixed" : String(value));
marker.style.marginRight = "6px";
marker.textContent = value === "mixed" ? "▣ " : value ? "☑ " : "☐ ";
rows[index].cells[0].prepend(marker);
});
return holder.innerHTML;
}
readState(state) {
const result = super.readState(state);
if (!result || !result.version) return result;
if (state.checkboxes !== undefined && state.checkboxes !== this.checkMode) return null;
try {
if (this.checkMode) {
result.checkboxes = this.checkMode;
result.checkIntents = new CheckIntents(state.checkIntents === undefined ? [] : state.checkIntents, this.checkMode).snapshot();
} else if (state.checkIntents !== undefined && (!Array.isArray(state.checkIntents) || state.checkIntents.length)) return null;
return result;
} catch (error) { return null; }
}
async setState(state) {
const parsed = this.readState(state);
if (!parsed || this.destroyed) return false;
const revision = ++this.checkRevision;
if (parsed.checkIntents && !this.voteCheck(new CheckIntents(parsed.checkIntents, this.checkMode), null, "restore", revision)) return false;
const operation = super.setState(parsed);
this.paintCheckedRows();
try {
return await operation;
}
finally { this.paintCheckedRows(); }
}
applyStatePresentation(state) {
const owner = this.restoreController;
super.applyStatePresentation(state);
if (this.destroyed || this.restoreController !== owner || owner && owner.signal.aborted) return;
if (state.checkIntents) {
this.checks = new CheckIntents(state.checkIntents, this.checkMode); this.checkRevision++;
this.paintCheckedRows(); this.notifyCheck(null, "restore");
}
}
destroy() {
this.checkRevision++;
super.destroy();
this.checks = null;
}
};
function interactionSettings(options) {
const view = options.view, ids = new Set();
if (view.dragDrop !== undefined && typeof view.dragDrop !== "boolean") throw new Error("CanopyX: dragDrop must be a boolean.");
for (const column of view.columns || []) {
if (column.editable !== undefined && typeof column.editable !== "boolean") throw new Error("CanopyX: editable must be a boolean.");
}
if (view.contextActions !== undefined && !Array.isArray(view.contextActions)) throw new Error("CanopyX: contextActions must be an array.");
const actions = (view.contextActions || []).map(action => {
requireIdentifier(action && action.id, "action ID");
if (ids.has(action.id) || typeof action.label !== "string" || !action.label.trim()) throw new Error("CanopyX: actions need unique IDs and visible labels.");
ids.add(action.id);
return Object.freeze({ id: action.id, label: action.label });
});
for (const name of ["onEdit", "onDrop", "onAction", "canEdit", "canDrag", "canDrop", "isActionEnabled"]) {
if (options[name] != null && typeof options[name] !== "function") throw new Error("CanopyX: " + name + " must be a function.");
}
const timeout = options.interactionTimeoutMs === undefined ? 30000 : options.interactionTimeoutMs;
if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_PROTOCOL_INTEGER) throw new Error("CanopyX: interactionTimeoutMs must be a positive protocol integer.");
return { actions, timeout };
}
function frozenPath(path) { return Object.freeze(path.slice()); }
function scalarValue(value) {
return value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value);
}
TreeGrid = class extends TreeGrid {
constructor(host, options) {
const settings = interactionSettings(options);
super(host, options);
this.interactions = settings;
this.interactionRevision = 0;
this.interactionPins = new Set();
}
interactionApi() {
return Object.assign(super.interactionApi(), {
requestEdit: (id, column, value, options) => this.requestEdit(id, column, value, options),
requestDrop: (ids, target, placement, options) => this.requestDrop(ids, target, placement, options),
requestAction: (id, action, options) => this.requestAction(id, action, options),
cancelInteraction: () => this.cancelInteraction()
});
}
cachePinned(w) {
return super.cachePinned(w) || !!(this.interactionPins && this.interactionPins.has(w));
}
reconcileList(parent, items, total, next, positions, ordering = false, suppressExpansion = false, resetLazy = false) {
if (!ordering && this.pendingInteraction) {
const replaced = this.descendants(parent);
if (this.interactionPins.has(parent) || Array.from(this.interactionPins).some(w => replaced.get(w.key) === w)) this.cancelInteraction();
}
return super.reconcileList(parent, items, total, next, positions, ordering, suppressExpansion, resetLazy);
}
retireWrapper(w) {
if (this.interactionPins && this.interactionPins.has(w)) this.cancelInteraction();
return super.retireWrapper(w);
}
applyCounts(doc, fromRefresh = false) {
const operation = this.pendingInteraction;
const result = super.applyCounts(doc, fromRefresh);
if (operation && this.pendingInteraction === operation && doc.items.some(item =>
Array.from(this.interactionPins).some(w => w.key === item.id))) this.cancelInteraction();
return result;
}
refreshCounts(ids) {
if (!this.destroyed && this.source.counts && this.pendingInteraction) {
const wanted = new Set(ids || this.rows.filter(w => !w.status).map(w => w.key));
if (Array.from(this.interactionPins).some(w => wanted.has(w.key))) this.cancelInteraction();
}
return super.refreshCounts(ids);
}
interactionNode(id) {
requireIdentifier(id, "interaction node ID");
const w = this.keyMap.get(id);
return w && !w._invalidated && !w.h.detail ? w : null;
}
eligible(name, ...args) {
const predicate = this.opts[name];
if (!predicate) return true;
const result = predicate(...args);
if (result && typeof result.then === "function") {
Promise.resolve(result).catch(() => {});
throw new Error("CanopyX: " + name + " must return synchronously.");
}
return result !== false;
}
async requestEdit(id, columnId, value, options) {
if (this.destroyed || this.interactionClosing || options && options.signal && options.signal.aborted) return false;
if (!scalarValue(value)) throw new Error("CanopyX: an edit value must be a finite JSON scalar.");
const revision = this.interactionRevision, w = this.interactionNode(id);
const index = this.columns.findIndex(column => column.id === columnId), column = this.columns[index];
if (!w || !column || !column.editable || !this.eligible("canEdit", w.h, column)) return false;
const raw = this.cellOf(w.h, column, index), previous = isCellObject(raw) ? raw.value : raw;
const proposal = Object.freeze({ nodeId: id, path: frozenPath(this.pathOf(w)), column: columnId,
previous: previous === undefined ? null : previous, value });
return this.dispatchProposal("edit", proposal, [w], revision, options, () => this.eligible("canEdit", w.h, column));
}
async requestDrop(ids, targetId, placement = "inside", options) {
if (this.destroyed || this.interactionClosing || options && options.signal && options.signal.aborted) return false;
const revision = this.interactionRevision, prepared = this.prepareDrop(ids, targetId, placement);
if (!prepared) return false;
const { proposal, roots, target } = prepared;
return this.dispatchProposal("drop", proposal, roots.concat(target || []), revision, options,
() => roots.every(w => this.eligible("canDrag", w.h)) && this.eligible("canDrop", proposal));
}
prepareDrop(ids, targetId, placement) {
if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error("CanopyX: a drop needs unique loaded node IDs.");
if (!["inside", "before", "after"].includes(placement)) throw new Error("CanopyX: drop placement is inside, before, or after.");
const revision = this.interactionRevision, nodes = ids.map(id => this.interactionNode(id));
const target = targetId === null ? null : this.interactionNode(targetId);
if (!this.view.dragDrop || nodes.some(w => !w) || targetId !== null && !target || targetId === null && placement !== "inside") return false;
const targetPath = target ? this.pathOf(target) : [];
if (nodes.some(w => targetPath.includes(w.key) || !this.eligible("canDrag", w.h))) return false;
const roots = nodes.filter(w => !this.pathOf(w).slice(0, -1).some(id => ids.includes(id)));
const proposal = Object.freeze({ nodes: Object.freeze(roots.map(w => Object.freeze({ nodeId: w.key, path: frozenPath(this.pathOf(w)) }))),
target: Object.freeze({ nodeId: targetId, path: frozenPath(targetPath) }), placement });
if (!this.eligible("canDrop", proposal)) return false;
if (this.destroyed || this.interactionClosing || revision !== this.interactionRevision ||
nodes.concat(target || []).some(w => w._invalidated || this.keyMap.get(w.key) !== w)) return false;
return { proposal, roots, target };
}
async requestAction(id, actionId, options) {
if (this.destroyed || this.interactionClosing || options && options.signal && options.signal.aborted) return false;
const revision = this.interactionRevision, w = this.interactionNode(id);
const action = this.interactions.actions.find(item => item.id === actionId);
if (!w || !action || !this.eligible("isActionEnabled", w.h, action)) return false;
const proposal = Object.freeze({ nodeId: id, path: frozenPath(this.pathOf(w)), action: actionId });
return this.dispatchProposal("action", proposal, [w], revision, options, () => this.eligible("isActionEnabled", w.h, action));
}
async dispatchProposal(kind, proposal, nodes, revision, options, eligible) {
const handler = this.opts["on" + kind[0].toUpperCase() + kind.slice(1)];
if (!handler || this.destroyed || this.interactionClosing || this.initializing || this.restoring || revision !== this.interactionRevision ||
options && options.signal && options.signal.aborted) return false;
const versions = nodes.map(w => ({ w, count: w.countRevision || 0, path: this.pathOf(w) }));
const afterCancellation = this.interactionRevision + (this.pendingInteraction ? 1 : 0);
this.cancelInteraction();
if (this.destroyed || this.interactionClosing || this.interactionRevision !== afterCancellation) return false;
const controller = new AbortController(), operation = { controller, proposal, kind };
this.pendingInteraction = operation;
this.interactionRevision++;
this.interactionPins = new Set(nodes); this.cacheDirty = true;
const navigation = navigationScope(this, [controller.signal, options && options.signal]);
const live = () => !navigation.cancelled() && this.pendingInteraction === operation && versions.every(({ w, count, path }) => {
const current = this.pathOf(w);
return !w._invalidated && this.keyMap.get(w.key) === w && (w.countRevision || 0) === count &&
current.length === path.length && current.every((id, index) => id === path[index]);
});
const reason = options && options.reason || "api";
let timer, timedOut = false;
try {
const event = new CustomEvent("canopyx:before" + kind, { bubbles: true, cancelable: true, detail: proposal });
if (!this.host.dispatchEvent(event) || !live() || !eligible() || !live()) return false;
timer = setTimeout(() => {
timedOut = true;
if (this.pendingInteraction === operation) this.cancelInteraction();
else controller.abort();
}, this.interactions.timeout);
const context = Object.freeze({ signal: navigation.signal, reason,
query: this.queryAware ? this.getQuery() : null, revision: this.datasetRevision == null ? null : this.datasetRevision });
const accepted = await navigation.wait(handler(proposal, context));
if (timedOut) throw new Error("CanopyX: interaction timed out after " + this.interactions.timeout + " milliseconds.");
if (!live()) return false;
if (typeof accepted !== "boolean") throw new Error("CanopyX: a host interaction hook must return a boolean acceptance result.");
this.emit(kind, { proposal, accepted, reason });
return accepted;
} catch (error) {
if (timedOut) throw new Error("CanopyX: interaction timed out after " + this.interactions.timeout + " milliseconds.");
if (navigation.cancelled()) return false;
throw error;
} finally {
clearTimeout(timer);
if (this.pendingInteraction === operation) {
this.pendingInteraction = null; this.interactionPins.clear(); this.cacheDirty = true;
this.scheduleRender();
}
navigation.dispose(); controller.abort();
}
}
cancelInteraction() {
const operation = this.pendingInteraction;
if (!operation) return false;
this.pendingInteraction = null;
this.interactionRevision++; this.interactionPins.clear(); this.cacheDirty = true;
this.scheduleRender();
this.abortInteractionController(operation.controller);
return true;
}
abortInteractionController(controller) {
if (!controller || controller.signal.aborted) return;
if (this.interactionReplacementDepth) {
if (!this.interactionAbortQueue) this.interactionAbortQueue = new Set();
this.interactionAbortQueue.add(controller);
} else controller.abort();
}
withInteractionReplacement(work) {
this.interactionReplacementDepth = (this.interactionReplacementDepth || 0) + 1;
try { return work(); }
finally {
this.interactionReplacementDepth--;
if (!this.interactionReplacementDepth) {
const controllers = this.interactionAbortQueue; this.interactionAbortQueue = null;
if (controllers) for (const controller of controllers) controller.abort();
}
}
}
destroy() {
this.interactionClosing = true;
this.cancelInteraction();
super.destroy();
this.interactions = null;
if (this.interactionPins) this.interactionPins.clear();
}
};
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
actions: "Actions", editValue: "Edit {column}", saveEdit: "Save", cancelEdit: "Cancel", invalidEdit: "Enter a valid {column} value.",
interactionPending: "Waiting for the host…", interactionRejected: "The host declined the operation.",
interactionFailed: "Operation failed: {error}", markMove: "Move this node", moveHere: "Move here",
moveBefore: "Move before", moveAfter: "Move after", cancelMove: "Cancel move"
}));
TreeGrid = class extends TreeGrid {
build() {
super.build();
this.interactionUiLifetime = new AbortController();
const signal = this.interactionUiLifetime.signal;
this.grid.addEventListener("scroll", () => this.closeInteractionPanel(false), { signal, passive: true });
global.addEventListener("resize", () => this.closeInteractionPanel(), { signal });
document.addEventListener("pointerdown", event => {
if (this.interactionPanel && !this.interactionPanel.contains(event.target)) this.closeInteractionPanel(false);
}, { signal });
this.grid.addEventListener("contextmenu", event => {
const row = event.target.closest(".cx-row");
if (row && row._w && !hostControl(event.target) && this.openActionMenu(row._w, row)) event.preventDefault();
}, { signal });
}
interactionApi() {
return Object.assign(super.interactionApi(), {
beginEdit: (id, column) => this.beginEdit(id, column),
openActions: id => { const w = this.interactionNode(id); return !!w && this.openActionMenu(w, this.rendered.get(w)); }
});
}
openInteractionPanel(w, anchor, role, label) {
const revision = (this.uiWorkRevision || 0) + (this.interactionPanel ? 1 : 0);
this.closeInteractionPanel(false);
if (this.destroyed || this.interactionClosing || this.interactionPanel || (this.uiWorkRevision || 0) !== revision) return null;
this.render();
anchor = this.rendered.get(w);
if (this.destroyed || this.interactionClosing || this.interactionPanel || (this.uiWorkRevision || 0) !== revision || !anchor || !anchor.isConnected) return null;
const panel = this.interactionPanel = h("div", "cx-interaction-panel");
panel.setAttribute("role", role); panel.setAttribute("aria-label", label);
this.panelNode = w;
this.host.appendChild(panel);
panel.addEventListener("pointerdown", () => { panel._cxPointerFocus = panel.contains(document.activeElement); });
return panel;
}
placeInteractionPanel(anchor) {
const panel = this.interactionPanel;
if (!panel) return;
const rect = anchor.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
panel.style.left = Math.max(8, Math.min(rect.left, global.innerWidth - bounds.width - 8)) + "px";
const below = global.innerHeight - rect.bottom - 8, above = rect.top - 8;
const top = below >= Math.min(bounds.height, 120) || below >= above ? rect.bottom : rect.top - bounds.height;
panel.style.top = Math.max(8, Math.min(top, global.innerHeight - bounds.height - 8)) + "px";
}
closeInteractionPanel(restoreFocus = true) {
const panel = this.interactionPanel, controller = this.editorController, w = this.panelNode;
if (!panel) return null;
const active = document.activeElement;
const owned = panel.contains(active) || panel._cxPointerFocus && (active === document.body || active === document.documentElement);
if (controller && this.uiPendingOperation && this.uiPendingOperation.controller === controller) {
this.uiPendingOperation = null;
setText(this.live, "");
}
this.uiWorkRevision = (this.uiWorkRevision || 0) + 1;
const focus = owned ? { node: w, revision: this.uiWorkRevision } : null;
this.interactionPanel = null; this.panelNode = null; this.editorController = null;
panel.remove();
this.abortInteractionController(controller);
if (restoreFocus) this.restoreInteractionFocus(focus);
return focus;
}
restoreInteractionFocus(focus) {
if (!focus || this.destroyed || this.interactionClosing || this.interactionPanel || focus.revision !== this.uiWorkRevision) return;
const active = document.activeElement;
if (active && active !== document.body && active !== document.documentElement && active.isConnected) return;
const visible = w => w && !w._invalidated && this.keyMap.get(w.key) === w && this.indexOf(w) >= 0;
const target = visible(focus.node) ? focus.node : visible(this.focused) ? this.focused : this.rows.find(visible);
if (target) this.setFocus(target, true);
else { this.grid.tabIndex = 0; this.grid.focus({ preventScroll: true }); }
}
async performInteraction(work, controller = null) {
this.uiWorkRevision = (this.uiWorkRevision || 0) + 1;
const operation = this.uiPendingOperation = { controller };
setText(this.live, this.labels.interactionPending);
try {
const accepted = await work();
if (!this.destroyed && this.uiPendingOperation === operation) setText(this.live, accepted ? "" : this.labels.interactionRejected);
return accepted;
} catch (error) {
if (!this.destroyed && this.uiPendingOperation === operation) setText(this.live, fill(this.labels.interactionFailed, { error: error && error.message || String(error) }));
return false;
} finally {
if (this.uiPendingOperation === operation) this.uiPendingOperation = null;
}
}
beginEdit(id, columnId) {
if (this.destroyed || this.interactionClosing || this.initializing || this.restoring || !this.opts.onEdit) return false;
const w = this.interactionNode(id), index = this.columns.findIndex(column => column.id === columnId), column = this.columns[index];
if (!w || !column || !column.editable || column.hidden || !this.eligible("canEdit", w.h, column)) return false;
const row = this.rendered.get(w);
if (!row || !row.isConnected) return false;
const label = fill(this.labels.editValue, { column: column.title });
const panel = this.openInteractionPanel(w, row, "dialog", label);
if (!panel) return false;
const controller = this.editorController = new AbortController();
const raw = this.cellOf(w.h, column, index), value = isCellObject(raw) ? raw.value : raw;
const input = h("input", "cx-editor");
input.type = column.kind === "number" || typeof value === "number" ? "number" : typeof value === "boolean" ? "checkbox" : "text";
if (input.type === "number") { input.step = "any"; input.required = true; }
input.checked = value === true;
input.value = value == null ? "" : String(value); input.setAttribute("aria-label", label);
input.addEventListener("input", () => input.setCustomValidity(""));
const controls = h("div", "cx-interaction-buttons");
const save = h("button", "cx-save"), cancel = h("button"); save.type = cancel.type = "button";
setText(save, this.labels.saveEdit); setText(cancel, this.labels.cancelEdit);
const title = h("div", "cx-interaction-title"); setText(title, label);
controls.append(save, cancel); panel.append(title, input, controls);
const submit = async () => {
if (save.disabled) return;
let next = input.type === "checkbox" ? input.checked : input.value;
if (input.type === "number") {
if (!input.value.trim() || !Number.isFinite(Number(input.value))) {
input.setCustomValidity(fill(this.labels.invalidEdit, { column: column.title })); input.reportValidity(); return;
}
next = Number(input.value);
}
input.setCustomValidity(""); input.disabled = save.disabled = true;
cancel.focus();
const accepted = await this.performInteraction(() => this.requestEdit(id, columnId, next, { signal: controller.signal, reason: "editor" }), controller);
if (this.interactionPanel !== panel) return;
if (accepted) this.closeInteractionPanel();
else { input.disabled = save.disabled = false; input.focus(); }
};
save.addEventListener("click", submit);
cancel.addEventListener("click", () => this.closeInteractionPanel());
panel.addEventListener("keydown", event => {
if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.closeInteractionPanel(); }
else if (event.key === "Enter" && event.target === input) { event.preventDefault(); submit(); }
});
this.placeInteractionPanel(row); input.focus(); if (input.type !== "checkbox") input.select();
return true;
}
onKey(event) {
if (!event.defaultPrevented && !event.isComposing && !hostControl(event.target)) {
const row = event.target.closest(".cx-row"), w = row && row._w;
if (w && !w.status && !w.h.detail) {
if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) {
if (this.openActionMenu(w, row)) { event.preventDefault(); event.stopPropagation(); return; }
}
if (event.key === "Enter" && event.altKey) {
const cell = event.target.closest(".cx-cell"), column = cell && cell.getAttribute("data-cx-column");
const editable = this.columns.find(item => item.editable && !item.hidden && this.eligible("canEdit", w.h, item));
if (this.beginEdit(w.key, column || editable && editable.id)) { event.preventDefault(); event.stopPropagation(); return; }
}
}
}
super.onKey(event);
}
destroy() {
this.interactionClosing = true;
this.closeInteractionPanel(false);
if (this.interactionUiLifetime) this.interactionUiLifetime.abort();
super.destroy();
this.interactionUiLifetime = null;
}
};
TreeGrid = class extends TreeGrid {
cachePinned(w) {
return super.cachePinned(w) || this.panelNode === w || !!(this.moveNodes && this.moveNodes.includes(w));
}
refreshCounts(ids) {
return this.withInteractionReplacement(() => super.refreshCounts(ids));
}
sort(...args) {
return this.withInteractionReplacement(() => super.sort(...args));
}
setColumnVisible(...args) {
return this.withInteractionReplacement(() => super.setColumnVisible(...args));
}
applyQuerySnapshot(...args) {
return this.withInteractionReplacement(() => {
this.cancelInteraction();
return super.applyQuerySnapshot(...args);
});
}
relayout(now) {
return this.withInteractionReplacement(() => {
const focus = this.closeInteractionPanel(false);
const result = super.relayout(now);
this.restoreInteractionFocus(focus);
return result;
});
}
buildHeader(...args) {
return this.withInteractionReplacement(() => {
const focus = this.closeInteractionPanel(false);
const result = super.buildHeader(...args);
this.restoreInteractionFocus(focus);
return result;
});
}
reconcileList(parent, ...args) {
return this.withInteractionReplacement(() => {
const ordering = args[4] === true;
let focus;
if (!ordering) {
this.moveNodes = null;
if (this.panelNode && (parent === this.root || parent === this.panelNode || this.pathOf(this.panelNode).includes(parent.key)))
focus = this.closeInteractionPanel(false);
}
const result = super.reconcileList(parent, ...args);
focus = focus || this.interactionFocusHandoff; this.interactionFocusHandoff = null;
this.restoreInteractionFocus(focus);
return result;
});
}
retireWrapper(w) {
return this.withInteractionReplacement(() => {
if (this.panelNode === w) this.interactionFocusHandoff = this.closeInteractionPanel(false) || this.interactionFocusHandoff;
if (this.moveNodes && this.moveNodes.includes(w)) this.moveNodes = null;
return super.retireWrapper(w);
});
}
applyCounts(doc, fromRefresh = false) {
return this.withInteractionReplacement(() => {
const panel = this.interactionPanel, node = this.panelNode, moving = this.moveNodes;
const result = super.applyCounts(doc, fromRefresh);
const focus = node && this.interactionPanel === panel && doc.items.some(item => item.id === node.key) ? this.closeInteractionPanel(false) : null;
if (moving && this.moveNodes === moving && doc.items.some(item => moving.some(w => w.key === item.id))) this.moveNodes = null;
const handoff = focus || this.interactionFocusHandoff; this.interactionFocusHandoff = null;
this.restoreInteractionFocus(handoff);
return result;
});
}
applyStatePresentation(state) {
const focus = this.closeInteractionPanel(false); this.moveNodes = null; this.cancelInteraction();
const result = super.applyStatePresentation(state);
this.restoreInteractionFocus(focus);
return result;
}
moveSources(w) {
if (!this.view.dragDrop || !this.opts.onDrop || this.destroyed || this.interactionClosing || this.initializing || this.restoring || !w || w.status || w.h.detail) return false;
const nodes = this.selected.has(w) ? Array.from(this.selected).filter(node => !node.h.detail) : [w];
if (!nodes.length || !nodes.every(node => this.keyMap.get(node.key) === node && !node._invalidated && this.eligible("canDrag", node.h))) return false;
return nodes;
}
markMove(w) {
const nodes = this.moveSources(w);
if (!nodes) return false;
this.moveNodes = nodes; this.cacheDirty = true;
setText(this.live, this.labels.markMove);
return true;
}
moveTarget(w, placement = "inside") {
if (!this.moveNodes || !w || w.status || w.h.detail || this.destroyed) return false;
const nodes = this.moveNodes;
if (nodes.some(node => node._invalidated || this.keyMap.get(node.key) !== node)) return false;
return !!this.prepareDrop(nodes.map(node => node.key), w.key, placement) && this.moveNodes === nodes;
}
async moveTo(w, placement, reason = "menu") {
if (!this.moveTarget(w, placement)) return false;
const nodes = this.moveNodes; this.moveNodes = null; this.cacheDirty = true;
return this.performInteraction(() => this.requestDrop(nodes.map(node => node.key), w.key, placement, { reason }));
}
openActionMenu(w, anchor) {
if (this.destroyed || this.interactionClosing || this.initializing || this.restoring || !w || w.status || w.h.detail || !anchor || !anchor.isConnected) return false;
const items = [];
if (this.opts.onEdit) for (const column of this.columns) {
if (column.editable && !column.hidden) items.push({ label: fill(this.labels.editValue, { column: column.title }),
disabled: !this.eligible("canEdit", w.h, column), run: () => this.beginEdit(w.key, column.id) });
}
if (this.opts.onAction) for (const action of this.interactions.actions) items.push({ label: action.label,
disabled: !this.eligible("isActionEnabled", w.h, action),
run: () => this.performInteraction(() => this.requestAction(w.key, action.id, { reason: "menu" })) });
if (this.view.dragDrop && this.opts.onDrop) {
items.push({ label: this.labels.markMove, disabled: !this.moveSources(w), run: () => this.markMove(w) });
if (this.moveNodes) {
for (const [placement, label] of [["inside", "moveHere"], ["before", "moveBefore"], ["after", "moveAfter"]])
items.push({ label: this.labels[label], disabled: !this.moveTarget(w, placement), run: () => this.moveTo(w, placement) });
items.push({ label: this.labels.cancelMove, run: () => { this.moveNodes = null; this.cacheDirty = true; } });
}
}
if (!items.length || this.destroyed || w._invalidated || this.keyMap.get(w.key) !== w) return false;
const panel = this.openInteractionPanel(w, anchor, "menu", this.labels.actions);
if (!panel) return false;
const buttons = items.map(item => {
const button = h("button", "cx-action-item"); button.type = "button"; button.tabIndex = -1;
button.setAttribute("role", "menuitem");
if (item.disabled) button.setAttribute("aria-disabled", "true");
setText(button, item.label);
button.addEventListener("click", () => {
if (item.disabled) return;
this.closeInteractionPanel(); item.run();
});
panel.appendChild(button); return button;
});
panel.addEventListener("keydown", event => {
const index = buttons.indexOf(document.activeElement);
let target;
if (event.key === "ArrowDown") target = buttons[(index + 1) % buttons.length];
else if (event.key === "ArrowUp") target = buttons[(index + buttons.length - 1) % buttons.length];
else if (event.key === "Home") target = buttons[0];
else if (event.key === "End") target = buttons[buttons.length - 1];
else if (event.key === "Escape") this.closeInteractionPanel();
else if (event.key === "Tab") { this.closeInteractionPanel(); return; }
else return;
event.preventDefault(); event.stopPropagation(); if (target) target.focus();
});
this.placeInteractionPanel(anchor); buttons[0].focus();
return true;
}
onKey(event) {
if (!event.defaultPrevented && !event.isComposing && !hostControl(event.target) && event.ctrlKey && event.shiftKey && !event.altKey) {
const row = event.target.closest(".cx-row"), w = row && row._w;
if (event.key.toLowerCase() === "x" && this.markMove(w)) { event.preventDefault(); event.stopPropagation(); return; }
if (event.key.toLowerCase() === "v" && this.moveTarget(w)) {
event.preventDefault(); event.stopPropagation(); this.moveTo(w, "inside", "keyboard"); return;
}
}
super.onKey(event);
}
destroy() { this.moveNodes = null; super.destroy(); }
};
TreeGrid = class extends TreeGrid {
build() {
super.build();
const signal = this.interactionUiLifetime.signal;
this.grid.addEventListener("scroll", () => this.clearDropRow(), { signal, passive: true });
this.grid.addEventListener("dragstart", event => {
const row = event.target.closest(".cx-row");
if (!row || hostControl(event.target) || !event.dataTransfer || !this.markMove(row._w)) { event.preventDefault(); return; }
this.dragLease = this.moveNodes;
event.dataTransfer.effectAllowed = "move";
event.dataTransfer.setData("application/x-canopyx-move", this.id);
}, { signal });
this.grid.addEventListener("dragover", event => {
const row = event.target.closest(".cx-row");
const placement = row && this.dropPlacement(event, row);
if (this.dragLease && event.dataTransfer && Array.from(event.dataTransfer.types).includes("application/x-canopyx-move") && row && this.moveTarget(row._w, placement)) {
event.preventDefault(); event.dataTransfer.dropEffect = "move";
if (this.dropRow !== row) { this.clearDropRow(); this.dropRow = row; row.classList.add("cx-drop-target"); }
row.setAttribute("data-cx-drop-placement", placement);
} else { this.clearDropRow(); if (event.dataTransfer) event.dataTransfer.dropEffect = "none"; }
}, { signal });
this.grid.addEventListener("drop", event => {
const row = event.target.closest(".cx-row");
const placement = row && this.dropPlacement(event, row);
if (!this.dragLease || !event.dataTransfer || event.dataTransfer.getData("application/x-canopyx-move") !== this.id || !row || !this.moveTarget(row._w, placement)) return;
event.preventDefault();
this.clearDropRow(); this.dragLease = null; this.moveTo(row._w, placement, "pointer");
}, { signal });
this.grid.addEventListener("dragend", () => {
this.clearDropRow();
if (this.dragLease) { this.moveNodes = null; this.cacheDirty = true; }
this.dragLease = null;
}, { signal });
}
paintRowState(row, w) {
super.paintRowState(row, w);
row.draggable = !!(this.view.dragDrop && this.opts.onDrop && !w.status && !w.h.detail);
}
clearDropRow() {
if (this.dropRow) { this.dropRow.classList.remove("cx-drop-target"); this.dropRow.removeAttribute("data-cx-drop-placement"); }
this.dropRow = null;
}
dropPlacement(event, row) {
const bounds = row.getBoundingClientRect(), fraction = (event.clientY - bounds.top) / bounds.height;
return fraction < 0.25 ? "before" : fraction > 0.75 ? "after" : "inside";
}
destroy() { this.clearDropRow(); this.dragLease = null; super.destroy(); }
};
function reportingTextOrder(policy) {
if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
Object.keys(policy).some(key => !["text", "categories"].includes(key)) ||
!["ordinal", "foldedOrdinal", "natural", "foldedNatural"].includes(policy.text) ||
policy.categories !== undefined && (!Array.isArray(policy.categories) || policy.categories.length > 512 ||
policy.categories.some(value => typeof value !== "string" || value.length > 4096)))
throw new Error("CanopyX: invalid reporting text order.");
const fold = policy.text.startsWith("folded"), natural = policy.text === "natural" || policy.text === "foldedNatural";
const key = value => fold ? foldText(value) : value, categories = new Map();
for (const value of policy.categories || []) {
const canonical = key(value);
if (categories.has(canonical)) throw new Error("CanopyX: repeated category after case folding.");
categories.set(canonical, categories.size);
}
const digit = code => code >= 48 && code <= 57;
return (left, right) => {
const a = key(left), b = key(right);
if (categories.size) {
const ai = categories.get(a) ?? categories.size, bi = categories.get(b) ?? categories.size;
if (ai !== bi) return gridOrder(ai, bi);
}
if (!natural) return gridOrder(a, b);
let i = 0, j = 0;
while (i < a.length && j < b.length) {
if (digit(a.charCodeAt(i)) && digit(b.charCodeAt(j))) {
let endA = i, endB = j;
while (endA < a.length && digit(a.charCodeAt(endA))) endA++;
while (endB < b.length && digit(b.charCodeAt(endB))) endB++;
while (i + 1 < endA && a[i] === "0") i++;
while (j + 1 < endB && b[j] === "0") j++;
const length = gridOrder(endA - i, endB - j);
if (length) return length;
while (i < endA) {
const compared = gridOrder(a.charCodeAt(i++), b.charCodeAt(j++));
if (compared) return compared;
}
i = endA; j = endB;
} else {
const compared = gridOrder(a.charCodeAt(i++), b.charCodeAt(j++));
if (compared) return compared;
}
}
return gridOrder(a.length - i, b.length - j);
};
}
GRID_REPORTING.validate = view => {
const options = view.reporting;
if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(key => !["ordering", "headerFilters", "filterGroups", "facetColumns", "presenters", "layout", "columnReorder", "responsive", "minimumCenterWidth", "viewStorage", "selectionControls", "grouping", "aggregates"].includes(key)) ||
["headerFilters", "filterGroups"].some(key => options[key] !== undefined && typeof options[key] !== "boolean"))
throw new Error("CanopyX: invalid reporting options.");
if (options.selectionControls !== undefined && typeof options.selectionControls !== "boolean" || options.selectionControls && view.selection === "none")
throw new Error("CanopyX: reporting selection controls need an enabled selection mode.");
if (options.viewStorage !== undefined && !["session", "local"].includes(options.viewStorage) || options.viewStorage === "local" &&
(typeof view.stateKey !== "string" || !view.stateKey.trim() || view.stateKey.length > 512))
throw new Error("CanopyX: durable reporting preferences need session/local storage and an explicit bounded state key.");
if (options.facetColumns !== undefined && (!Array.isArray(options.facetColumns) ||
new Set(options.facetColumns).size !== options.facetColumns.length || options.facetColumns.some(id => !view.columns.some(column => column?.id === id))))
throw new Error("CanopyX: facets need unique declared column identities.");
if (options.ordering === undefined) return;
if (!options.ordering || typeof options.ordering !== "object" || Array.isArray(options.ordering))
throw new Error("CanopyX: reporting ordering is keyed by column identity.");
for (const [id, policy] of Object.entries(options.ordering)) {
const column = view.columns.find(item => item && item.id === id);
if (!column || column.kind !== "text" || !column.sortable) throw new Error("CanopyX: ordering needs a sortable text column.");
reportingTextOrder(policy);
}
};
GRID_REPORTING.compare = view => {
const policies = new Map(Object.entries(view.reporting && view.reporting.ordering || {}).map(([id, policy]) => [id, reportingTextOrder(policy)]));
if (!policies.size) return gridCompare;
return (left, right, column, direction) => {
const compare = policies.get(column.id);
if (!compare) return gridCompare(left, right, column, direction);
const a = gridScalar(left.cells[column.id], column), b = gridScalar(right.cells[column.id], column);
if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
const result = compare(String(a), String(b));
return direction === "desc" ? -result : result;
};
};
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridBetween: "between (inclusive)", gridRangeEnd: "Upper value (UTC for dates)",
gridInvalidRange: "Enter an upper value greater than or equal to the lower value.",
gridSuggestedCategory: "Suggested category", gridChooseCategory: "Choose a category", gridBooleanValue: "Boolean value",
gridTrue: "True", gridFalse: "False", gridHeaderFilter: "Filter {column}"
}));
const REPORT_FILTER_BASE = {};
for (const method of ["buildGridFilters", "renderGridFilters", "addGridFilter", "readGridFilter", "buildHeader"])
REPORT_FILTER_BASE[method] = DataGrid.prototype[method];
REPORT_FILTER_BASE.syncQuerySummary = DataGrid.prototype.syncQuerySummary;
function reportingFilterShape(query) { return JSON.stringify([query?.filters || [], query?.filterGroup || null]); }
function reportingRangeRows(filters) {
const rows = [];
for (let index = 0; index < filters.length; index++) {
const lower = filters[index], upper = filters[index + 1];
if (lower.operator === "ge" && upper && upper.operator === "le" && lower.column === upper.column) {
rows.push({ column: lower.column, operator: "between", values: [lower.values[0], upper.values[0]] }); index++;
} else rows.push(lower);
}
return rows;
}
function reportingRangeValue(raw, column, labels) {
if (column.kind === "number") {
if (!raw.trim()) throw new Error(labels.gridInvalidFilter);
const value = Number(raw); gridScalar(value, column); return value;
}
const value = /(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : raw + "Z";
gridScalar(value, column); return value;
}
function reportingFilterError(element, message) {
setText(element, message);
if (message && element.getClientRects().length) element.scrollIntoView({ block: "nearest", inline: "nearest" });
}
Object.assign(DataGrid.prototype, {
syncQuerySummary() {
REPORT_FILTER_BASE.syncQuerySummary.call(this);
const controls = this.reportingFilters, shape = reportingFilterShape(this.getQuery());
if (!controls?.details.open || shape === this.reportingFilterDraftBase) return;
if (this.reportingFilterSubmitEpoch === this.queryEpoch) this.reportingFilterDraftBase = shape;
else {
const hadFocus = controls.panel.contains(document.activeElement);
controls.details.open = false;
if (hadFocus) controls.details.querySelector("summary").focus({ preventScroll: true });
}
},
applyReportingFilterQuery(query, error) {
const pending = this.setQuery(query), epoch = this.queryEpoch;
this.reportingFilterSubmitEpoch = epoch;
pending.then(() => setText(error, ""), failure => reportingFilterError(error, failure.message)).finally(() => {
if (this.reportingFilterSubmitEpoch === epoch) this.reportingFilterSubmitEpoch = null;
});
},
buildGridFilters() {
if (!this.view.reporting) return REPORT_FILTER_BASE.buildGridFilters.call(this);
this.reportingFilters = this.controlPanel(this.labels.gridFilters, "cx-grid-filters", panel => this.renderGridFilters(panel));
this.reportingFilters.panel.id = this.id + "-filters";
this.reportingFilters.details.addEventListener("keydown", event => {
if (event.key === "Escape" && this.reportingFilterReturn) {
this.focusReportingFilterHeader(); this.reportingFilterReturn = null;
}
});
this.reportingFilters.details.addEventListener("toggle", () => this.syncReportingFilterHeaders());
},
renderGridFilters(panel) {
if (!this.view.reporting) return REPORT_FILTER_BASE.renderGridFilters.call(this, panel);
panel.textContent = "";
this.reportingFilterDraftBase = reportingFilterShape(this.queryForChange());
const form = h("form", "cx-grid-filter-form"), rows = h("div"), error = h("p", "cx-grid-control-error");
panel.classList.toggle("cx-grid-group-editor", !!this.view.reporting.filterGroups);
error.setAttribute("role", "status");
reportingRangeRows(this.queryForChange().filters || []).forEach(filter => this.addGridFilter(rows, filter));
form.appendChild(rows); form.appendChild(gridButton(this.labels.gridAddFilter, () => this.addGridFilter(rows, null)));
const groups = this.view.reporting.filterGroups ? this.buildReportingFilterGroups(form, error) : null;
const apply = h("button", "cx-button"); apply.type = "submit"; setText(apply, this.labels.gridApply); form.appendChild(apply);
form.appendChild(gridButton(this.labels.gridClearFilters, () => {
rows.textContent = "";
if (groups) { groups.textContent = ""; groups._sync(); }
this.applyReportingFilterQuery(gridQueryStart(this.queryForChange(true), { filters: [], filterGroup: undefined }), error);
}));
form.appendChild(error); panel.appendChild(form);
form.addEventListener("submit", event => {
event.preventDefault();
try {
const filters = [...rows.children].flatMap(row => this.readGridFilter(row));
const filterGroup = groups ? this.readReportingFilterGroups(groups) : this.queryForChange().filterGroup;
this.applyReportingFilterQuery(gridQueryStart(this.queryForChange(true), { filters, filterGroup }), error);
} catch (failure) { reportingFilterError(error, failure.message); }
});
const requested = this.reportingFilterColumn;
if (requested) {
let row = [...rows.children].find(item => item._filter.column.value === requested);
if (!row && rows.children.length < 64) {
this.addGridFilter(rows, null); row = rows.lastElementChild;
row._filter.column.value = requested; row._filter.column.dispatchEvent(new Event("change"));
}
const target = row ? [row._filter.boolean, row._filter.input, row._filter.multiple, row._filter.operator]
.find(control => control && !control.disabled && !control.closest("[hidden]")) : apply;
target.focus({ preventScroll: true });
queueMicrotask(() => {
if (!this.destroyed && target.isConnected && this.reportingFilters.details.open && document.activeElement === target)
target.scrollIntoView({ block: "nearest", inline: "nearest" });
});
this.reportingFilterColumn = null;
}
},
addGridFilter(parent, predicate) {
if (!this.view.reporting) return REPORT_FILTER_BASE.addGridFilter.call(this, parent, predicate);
const count = parent.children.length, range = predicate && predicate.operator === "between";
REPORT_FILTER_BASE.addGridFilter.call(this, parent, range ? { column: predicate.column, operator: "ge", values: [predicate.values[0]] } : predicate);
if (parent.children.length === count) return;
const row = parent.lastElementChild, fields = row._filter, upper = h("input", "cx-grid-filter-value"), choices = h("select"), boolean = h("select");
const upperField = gridInputLabel(this.labels.gridRangeEnd, upper), categoryField = gridInputLabel(this.labels.gridSuggestedCategory, choices),
booleanField = gridInputLabel(this.labels.gridBooleanValue, boolean);
boolean.append(gridOption("true", this.labels.gridTrue), gridOption("false", this.labels.gridFalse));
row.insertBefore(upperField, row.lastElementChild); row.insertBefore(categoryField, row.lastElementChild); row.insertBefore(booleanField, row.lastElementChild);
fields.upper = upper; fields.boolean = boolean;
const refresh = () => {
const column = this.columns.find(item => item.id === fields.column.value), rangeKind = column.kind === "number" || column.kind === "datetime";
if (rangeKind && ![...fields.operator.options].some(option => option.value === "between"))
fields.operator.appendChild(gridOption("between", this.labels.gridBetween));
upper.type = column.kind === "datetime" ? "datetime-local" : "number"; upper.step = "any";
upperField.hidden = fields.operator.value !== "between"; upper.disabled = upperField.hidden;
const categories = this.view.reporting.ordering && this.view.reporting.ordering[column.id];
categoryField.hidden = column.kind !== "text" || !categories || !categories.categories || !categories.categories.length ||
fields.type.value !== "string" || !["eq", "ne"].includes(fields.operator.value);
choices.textContent = ""; choices.appendChild(gridOption("", this.labels.gridChooseCategory));
for (const value of categories && categories.categories || []) choices.appendChild(gridOption(value, value));
booleanField.hidden = column.kind !== "text" || fields.type.value !== "boolean" || !["eq", "ne"].includes(fields.operator.value);
if (!booleanField.hidden) {
boolean.value = ["true", "false"].includes(fields.input.value) ? fields.input.value : "true";
fields.input.value = boolean.value;
}
fields.input.closest("label").hidden = !booleanField.hidden || ["isNull", "isNotNull", "in"].includes(fields.operator.value);
};
fields.column.addEventListener("change", refresh); fields.operator.addEventListener("change", refresh); fields.type.addEventListener("change", refresh);
upper.addEventListener("input", () => { fields.edited = true; });
choices.addEventListener("change", () => { fields.input.value = choices.value; fields.edited = true; });
boolean.addEventListener("change", () => { fields.input.value = boolean.value; fields.edited = true; });
refresh();
if (range) {
fields.operator.value = "between";
upper.value = upper.type === "datetime-local" ? new Date(predicate.values[1]).toISOString().slice(0, -1) : String(predicate.values[1]); refresh();
fields.rangeOriginal = { column: predicate.column, values: predicate.values.slice(), inputs: [fields.input.value, upper.value] };
}
},
readGridFilter(row) {
const fields = row._filter;
if (!this.view.reporting || fields.operator.value !== "between") return REPORT_FILTER_BASE.readGridFilter.call(this, row);
const column = this.columns.find(item => item.id === fields.column.value);
const original = fields.rangeOriginal, inputs = [fields.input.value, fields.upper.value];
const values = inputs.map((raw, index) => original && original.column === column.id && raw === original.inputs[index] ?
original.values[index] : reportingRangeValue(raw, column, this.labels));
if (gridScalar(values[0], column) > gridScalar(values[1], column)) throw new Error(this.labels.gridInvalidRange);
return [{ column: column.id, operator: "ge", values: [values[0]] }, { column: column.id, operator: "le", values: [values[1]] }];
}
});
function reportingColumnFiltered(query, id) {
const has = group => group && (group.filters.some(filter => filter.column === id) || group.groups.some(has));
return !!query && (query.filters.some(filter => filter.column === id) || !!has(query.filterGroup));
}
Object.assign(DataGrid.prototype, {
buildHeader() {
const active = document.activeElement, focused = active && this.headRow.contains(active) && active.getAttribute("data-cx-filter-column");
REPORT_FILTER_BASE.buildHeader.call(this);
if (!this.view.reporting || !this.view.reporting.headerFilters || this.opts.toolbar === false) return;
for (const cell of this.headCells) {
const id = cell.getAttribute("data-cx-column"), column = this.columns.find(item => item.id === id);
const button = gridButton("⌕", () => this.openReportingColumnFilter(id)); button.classList.add("cx-grid-header-filter");
button.setAttribute("data-cx-filter-column", id); button.setAttribute("aria-label", fill(this.labels.gridHeaderFilter, { column: column.title }));
button.title = button.getAttribute("aria-label"); button.setAttribute("aria-controls", this.reportingFilters.panel.id);
cell.insertBefore(button, cell.querySelector(".cx-resize"));
if (focused === id) button.focus({ preventScroll: true });
}
this.syncReportingFilterHeaders();
},
syncReportingFilterHeaders() {
if (!this.reportingFilters) return;
for (const button of this.headRow.querySelectorAll("[data-cx-filter-column]")) {
const id = button.getAttribute("data-cx-filter-column");
button.setAttribute("aria-expanded", String(this.reportingFilters.details.open && this.reportingFilterReturn === id));
button.setAttribute("data-cx-filtered", String(reportingColumnFiltered(this.acceptedQuery, id)));
}
},
openReportingColumnFilter(id) {
this.reportingFilterColumn = id; this.reportingFilterReturn = id;
if (this.reportingFilters.details.open) this.renderGridFilters(this.reportingFilters.panel);
else this.reportingFilters.details.open = true;
this.syncReportingFilterHeaders();
},
focusReportingFilterHeader() {
const button = [...this.headRow.querySelectorAll("[data-cx-filter-column]")].find(item =>
item.getAttribute("data-cx-filter-column") === this.reportingFilterReturn);
(button || this.reportingFilters.details.querySelector("summary")).focus({ preventScroll: true });
}
});
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridFilterGroupTitle: "Additional grouped conditions", gridFilterMatch: "Match",
gridFilterAll: "All conditions (AND)", gridFilterAny: "Any condition (OR)",
gridAddFilterGroup: "Add condition group", gridDeleteFilterGroup: "Remove condition group"
}));
Object.assign(DataGrid.prototype, {
buildReportingFilterGroups(form, error) {
const section = h("section", "cx-grid-filter-groups"), title = h("p"), roots = h("div");
setText(title, this.labels.gridFilterGroupTitle); title.id = this.id + "-filter-groups";
section.setAttribute("aria-labelledby", title.id);
const add = gridButton(this.labels.gridAddFilterGroup, () => {
if (roots.children.length) return;
const group = this.addReportingFilterGroup(roots, null, 1, form, error);
if (group) group._group.operator.focus();
});
section.append(title, roots, add); form.appendChild(section);
const group = this.queryForChange().filterGroup;
if (group) this.addReportingFilterGroup(roots, group, 1, form, error);
const sync = () => { add.disabled = roots.children.length !== 0; };
roots._sync = sync; sync(); return roots;
},
addReportingFilterGroup(parent, definition, depth, form, error) {
if (depth > 8 || form.querySelectorAll(".cx-grid-filter-group").length >= 64) {
reportingFilterError(error, this.labels.gridInvalidFilter); return null;
}
const group = h("fieldset", "cx-grid-filter-group"), legend = h("legend"), operator = h("select"),
rows = h("div"), children = h("div", "cx-grid-filter-group-children"), actions = h("div", "cx-grid-filter-group-actions");
setText(legend, this.labels.gridFilterGroupTitle);
operator.append(gridOption("and", this.labels.gridFilterAll), gridOption("or", this.labels.gridFilterAny));
operator.value = definition ? definition.operator : "and";
group.append(legend, gridInputLabel(this.labels.gridFilterMatch, operator), rows, children, actions);
group._group = { operator, rows, children }; parent.appendChild(group);
const focusAfterRemove = (container, removed, fallback) => {
const next = removed.nextElementSibling || removed.previousElementSibling;
const hadFocus = removed.contains(document.activeElement);
removed.querySelectorAll(".cx-grid-filter").forEach(row => row._facetDispose?.()); removed._facetDispose?.(); removed.remove();
container._sync?.();
if (hadFocus) {
const target = next?.querySelector("select,input,textarea,button") || fallback;
target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest", inline: "nearest" });
}
};
const addFilter = gridButton(this.labels.gridAddFilter, () => {
const row = addPredicate(null); if (row) row._filter.column.focus();
});
const addPredicate = predicate => {
if (form.querySelectorAll(".cx-grid-filter").length >= 64) {
reportingFilterError(error, this.labels.gridInvalidFilter); return null;
}
this.addGridFilter(rows, predicate); const row = rows.lastElementChild;
row.lastElementChild.addEventListener("click", event => {
event.preventDefault(); event.stopImmediatePropagation(); focusAfterRemove(rows, row, addFilter);
}, { capture: true }); return row;
};
const addChild = gridButton(this.labels.gridAddFilterGroup, () => {
const child = this.addReportingFilterGroup(children, null, depth + 1, form, error);
if (child) child._group.operator.focus();
});
addChild.disabled = depth === 8;
const remove = gridButton(this.labels.gridDeleteFilterGroup, () => {
const fallback = parent.closest(".cx-grid-filter-group")?.querySelector(":scope > .cx-grid-filter-group-actions > button") ||
parent.nextElementSibling;
focusAfterRemove(parent, group, fallback);
});
actions.append(addFilter, addChild, remove);
const predicates = definition ? definition.operator === "and" ? reportingRangeRows(definition.filters) : definition.filters : [];
predicates.forEach(addPredicate);
(definition?.groups || []).forEach(child => this.addReportingFilterGroup(children, child, depth + 1, form, error));
parent._sync?.(); return group;
},
readReportingFilterGroups(roots) {
if (!roots.children.length) return undefined;
const read = element => {
const { operator, rows, children } = element._group;
const group = { operator: operator.value, filters: [], groups: [...children.children].map(read) };
for (const row of rows.children) {
const filters = [].concat(this.readGridFilter(row));
if (filters.length > 1 && group.operator === "or") group.groups.push({ operator: "and", filters, groups: [] });
else group.filters.push(...filters);
}
return group;
};
return read(roots.firstElementChild);
}
});
function reportingFacetKey(value, column) {
if (value !== null && typeof value === "object" || value === undefined) throw new Error("CanopyX: facet values are raw scalars.");
const scalar = gridScalar(value, column);
if (scalar === null) return "null";
return column.kind === "datetime" ? "d:" + scalar : typeof scalar === "string" ? "s:" + foldText(scalar) :
typeof scalar === "boolean" ? "b:" + scalar : "n:" + scalar;
}
function reportingFacetProjection(query, column) {
const project = group => {
if (!group) return undefined;
const filters = group.filters.filter(filter => filter.column !== column), groups = group.groups.map(project);
if (group.operator === "or" && (filters.length !== group.filters.length || groups.some(child => !child))) return undefined;
const children = groups.filter(Boolean);
return filters.length || children.length ? { operator: group.operator, filters, groups: children } : undefined;
};
return { ...query, filters: query.filters.filter(filter => filter.column !== column), filterGroup: project(query.filterGroup) };
}
function reportingFacetPage(input, grid, request) {
checkDocument(input, "gridFacetPage");
const column = grid.view.columns.find(item => item.id === request.column);
if (input.view !== grid.view.id || input.revision !== request.query.revision || input.column !== request.column ||
input.search !== request.search || input.includeCurrentFilter !== request.includeCurrentFilter ||
!Number.isInteger(input.matched) || input.matched < 0 || input.matched > MAX_PROTOCOL_INTEGER ||
!Number.isInteger(input.totalValues) || input.totalValues < 0 || input.totalValues > input.matched ||
!Array.isArray(input.items) || input.items.length > request.limit || input.items.length > input.totalValues ||
!input.items.length && input.totalValues > 0 || input.truncated !== (input.items.length < input.totalValues))
throw new Error("CanopyX: facet response must match its accepted revision, projection and bounded counts.");
const widened = !request.includeCurrentFilter &&
gridResultShape(reportingFacetProjection(request.query, request.column)) !== gridResultShape(request.query);
if (Number.isInteger(grid.snapshot.total) && input.matched > grid.snapshot.total || Number.isInteger(grid.snapshot.matched) &&
(widened ? input.matched < grid.snapshot.matched : input.matched !== grid.snapshot.matched))
throw new Error("CanopyX: facet counts contradict the known accepted dataset counts.");
const keys = new Set(); let occurrences = 0;
const items = input.items.map(item => {
if (!item || !Object.prototype.hasOwnProperty.call(item, "value") || !Number.isInteger(item.count) || item.count < 1 || item.count > input.matched)
throw new Error("CanopyX: invalid facet value/count bucket.");
const key = reportingFacetKey(item.value, column);
if (keys.has(key)) throw new Error("CanopyX: duplicate typed facet bucket.");
keys.add(key); occurrences += item.count;
return { value: item.value, count: item.count };
});
if (occurrences > input.matched || !request.search && !input.truncated && occurrences !== input.matched)
throw new Error("CanopyX: facet buckets contradict the matching row count.");
return gridFreeze({ protocol: PROTOCOL, type: "gridFacetPage", view: input.view, revision: input.revision,
column: input.column, search: input.search, includeCurrentFilter: input.includeCurrentFilter,
matched: input.matched, totalValues: input.totalValues, truncated: input.truncated, items });
}
const FACET_INLINE_SOURCE = inlineGridSource;
inlineGridSource = view => {
const source = FACET_INLINE_SOURCE(view);
if (!view.reporting?.facetColumns?.length) return source;
const columns = new Map(view.columns.map(column => [column.id, column]));
source.facet = (request, options) => {
if (options.signal.aborted) throw new DOMException("Facet request cancelled.", "AbortError");
const column = view.columns.find(item => item.id === request.column), query = request.includeCurrentFilter ? request.query :
reportingFacetProjection(request.query, column.id);
const rows = gridQueryRows(view, query, columns, false), buckets = new Map(), needle = foldText(request.search);
for (const row of rows) {
const scalar = gridScalar(row.cells[column.id], column), value = column.kind === "datetime" && scalar !== null ? new Date(scalar).toISOString() : scalar;
const key = reportingFacetKey(value, column), existing = buckets.get(key);
if (existing) {
existing.count++;
if (typeof value === "string" && value < existing.value) existing.value = value;
} else buckets.set(key, { value, count: 1 });
}
const items = [...buckets.values()].filter(item => foldText(item.value).includes(needle));
items.sort((a, b) => {
if (a.value === null || b.value === null) return a.value === b.value ? 0 : a.value === null ? 1 : -1;
if (column.kind !== "text") return gridOrder(gridScalar(a.value, column), gridScalar(b.value, column));
if (typeof a.value !== typeof b.value) return typeof a.value === "boolean" ? -1 : 1;
return gridOrder(typeof a.value === "string" ? foldText(a.value) : a.value, typeof b.value === "string" ? foldText(b.value) : b.value);
});
return { protocol: PROTOCOL, type: "gridFacetPage", view: view.id, revision: "inline", column: column.id,
search: request.search, includeCurrentFilter: request.includeCurrentFilter, matched: rows.length,
totalValues: items.length, truncated: items.length > request.limit, items: items.slice(0, request.limit) };
};
return source;
};
const LAYOUT_VALIDATE = GRID_REPORTING.validate, LAYOUT_PREPARE = DataGrid.prototype.prepareState;
GRID_REPORTING.api = (api, grid) => { api.autoFitColumn = id => GRID_REPORTING.fitColumn(grid, id); };
function reportingLayout(grid, column) { return grid.columnLayouts.get(column.id) || { minimum: 40, maximum: MAX_COLUMN_WIDTH, flex: 0 }; }
function reportingWidth(grid, column, width) {
const policy = reportingLayout(grid, column); return Math.min(policy.maximum, Math.max(policy.minimum, width));
}
GRID_REPORTING.validate = view => {
LAYOUT_VALIDATE(view);
const options = view.reporting;
if (options.columnReorder !== undefined && typeof options.columnReorder !== "boolean") throw new Error("CanopyX: columnReorder must be boolean.");
if (options.layout === undefined) return;
if (!options.layout || typeof options.layout !== "object" || Array.isArray(options.layout)) throw new Error("CanopyX: layout is keyed by column ID.");
for (const [id, policy] of Object.entries(options.layout)) {
const column = view.columns.find(item => item && item.id === id);
if (!column || !policy || typeof policy !== "object" || Array.isArray(policy) ||
Object.keys(policy).some(key => !["minimum", "maximum", "flex", "pin", "priority", "alwaysVisible"].includes(key)) ||
!Number.isInteger(policy.minimum) || policy.minimum < 40 || !Number.isInteger(policy.maximum) ||
policy.maximum < policy.minimum || policy.maximum > MAX_COLUMN_WIDTH ||
policy.flex !== undefined && (!Number.isFinite(policy.flex) || policy.flex < 0 || policy.flex > 100) ||
column.width < policy.minimum || column.width > policy.maximum)
throw new Error("CanopyX: invalid column layout or initial width.");
}
};
DataGrid.prototype.prepareState = function () {
this.columnLayouts = new Map(Object.entries(this.view.reporting && this.view.reporting.layout || {}).map(([id, policy]) =>
[id, Object.assign({ flex: 0 }, policy)]));
for (const column of this.columns) if (reportingLayout(this, column).flex > 0) column.flex = true;
return LAYOUT_PREPARE.call(this);
};
const LAYOUT_STATE_COLUMN = gridStateColumn, LAYOUT_STATE_COLUMNS = gridStateColumns;
gridStateColumn = column => Object.assign(LAYOUT_STATE_COLUMN(column), column.flex === undefined ? {} : { flex: column.flex });
gridStateColumns = (grid, input) => {
const result = LAYOUT_STATE_COLUMNS(grid, input), sources = new Map(input.map(column => [column.id, column]));
for (const saved of result) {
const source = sources.get(saved.id) || saved, column = grid.columns.find(item => item.id === saved.id);
if (source.flex !== undefined && typeof source.flex !== "boolean") throw new Error("CanopyX: saved flex must be boolean.");
saved.width = reportingWidth(grid, column, saved.width);
if (reportingLayout(grid, column).flex > 0) saved.flex = source.flex === undefined ? true : source.flex;
}
return result;
};
const LAYOUT_WIDTHS = DataGrid.prototype.applyWidths, LAYOUT_SET_WIDTH = DataGrid.prototype.setColumnWidth,
LAYOUT_START_RESIZE = DataGrid.prototype.startResize, LAYOUT_CELL = DataGrid.prototype.newCell;
DataGrid.prototype.newCell = function (index, width, kind) {
return LAYOUT_CELL.call(this, index, kind ? this.cols[index].renderWidth ?? width : width, kind);
};
DataGrid.prototype.applyWidths = function () {
let total = 0;
for (const column of this.cols) {
column.width = reportingWidth(this, column, column.width); column.renderWidth = column.width; total += column.width;
}
let remaining = Math.max(0, this.grid.clientWidth - total), flexible = this.cols.filter(column => column.flex &&
reportingLayout(this, column).maximum > column.renderWidth);
while (remaining > 0.5 && flexible.length) {
const weight = flexible.reduce((sum, column) => sum + reportingLayout(this, column).flex, 0);
if (!weight) break;
let used = 0;
for (const column of flexible) {
const policy = reportingLayout(this, column), extra = Math.min(policy.maximum - column.renderWidth, remaining * policy.flex / weight);
column.renderWidth += extra; used += extra;
}
remaining -= used; flexible = flexible.filter(column => reportingLayout(this, column).maximum - column.renderWidth > 0.5);
if (used < 0.5) break;
}
LAYOUT_WIDTHS.call(this, this.cols.map(column => column.renderWidth));
this.cols.forEach((column, index) => {
const grip = this.headCells[index].querySelector(".cx-resize"), policy = reportingLayout(this, column);
grip.setAttribute("aria-valuemin", String(policy.minimum)); grip.setAttribute("aria-valuemax", String(policy.maximum));
});
const active = document.activeElement;
if (active && this.headRow.contains(active) && active.matches(".cx-column-move,.cx-resize")) this.focusReportingHeader(active);
};
function reportingManualWidth(grid, column) {
grid.noteViewPreferenceIntent?.();
column.width = column.renderWidth ?? column.width; if (column.flex !== undefined) column.flex = false;
}
DataGrid.prototype.setColumnWidth = function (id, width) {
const column = this.columns.find(item => item.id === id);
if (column && Number.isFinite(width)) { if (column.flex !== undefined) column.flex = false; width = reportingWidth(this, column, width); }
return LAYOUT_SET_WIDTH.call(this, id, width);
};
DataGrid.prototype.startResize = function (event, column) {
if (!this.destroyed && event.button === 0) reportingManualWidth(this, column);
return LAYOUT_START_RESIZE.call(this, event, column);
};
GRID_REPORTING.fitColumn = (grid, id) => {
const column = grid.columns.find(item => item.id === id);
if (!column || grid.destroyed || grid.pendingQuery || !grid.acceptedQuery) throw new Error("CanopyX: auto-fit needs a declared column and an accepted query.");
const context = document.createElement("canvas").getContext("2d"), style = getComputedStyle(grid.grid);
if (!context) throw new Error("CanopyX: text measurement is unavailable.");
context.font = style.font || style.fontSize + " " + style.fontFamily;
let width = context.measureText(column.title.slice(0, 2048)).width + 76, sampled = 0;
for (const row of grid.rowCache.values()) {
if (sampled === 200) break;
width = Math.max(width, context.measureText(cellText(row.h.cells[column.id], column, grid.fmt).slice(0, 2048)).width + 32); sampled++;
}
grid.setColumnWidth(id, Math.ceil(Math.min(800, width)));
return Object.freeze({ width: column.width, sampled: sampled, scope: "loaded" });
};
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridMoveColumn: "{column}: drag to move, or use Left/Right", gridResizeHelp: "Enter fits up to 200 loaded rows; Left/Right resizes.",
gridColumnMoved: "{column} moved to position {position}"
}));
const LAYOUT_HEADER = DataGrid.prototype.buildHeader, LAYOUT_ORDER = DataGrid.prototype.setColumnOrder;
DataGrid.prototype.focusReportingHeader = function (control) {
if (!control || !control.isConnected) return;
control.focus({ preventScroll: true });
const frame = this.grid.getBoundingClientRect(), left = frame.left + this.grid.clientLeft, box = control.getBoundingClientRect();
if (box.left < left) this.grid.scrollLeft -= left - box.left;
else if (box.right > left + this.grid.clientWidth) this.grid.scrollLeft += box.right - left - this.grid.clientWidth;
};
DataGrid.prototype.restoreReportingFocus = function (held, columnId) {
if (!held || !columnId) return;
const index = this.cols.findIndex(column => column.id === columnId);
if (index < 0) { this.setFocus(held.w, true); return; }
const cell = this.rowCells(this.rendered.get(held.w))[index];
const candidate = cell && held.control >= 0 ? cell.querySelectorAll(CELL_CONTROLS)[held.control] : null;
const control = candidate && reachable(candidate) ? cellControls(cell).indexOf(candidate) : -1;
this.focusCell(held.w, index, control < 0 ? null : control, true);
};
DataGrid.prototype.buildHeader = function () {
if (this.cancelColumnDrag) this.cancelColumnDrag();
const active = document.activeElement, held = active && active.classList.contains("cx-column-move") && this.headRow.contains(active) ?
active.closest("[data-cx-column]").getAttribute("data-cx-column") : null;
LAYOUT_HEADER.call(this);
this.cols.forEach((column, index) => {
const cell = this.headCells[index], grip = cell.querySelector(".cx-resize");
grip.setAttribute("aria-description", this.labels.gridResizeHelp); grip.title = this.labels.gridResizeHelp;
grip.addEventListener("dblclick", () => GRID_REPORTING.fitColumn(this, column.id));
grip.addEventListener("keydown", event => {
if (event.key === "Enter") { event.preventDefault(); GRID_REPORTING.fitColumn(this, column.id); }
else if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) reportingManualWidth(this, column);
}, true);
if (!this.view.reporting || !this.view.reporting.columnReorder) return;
const move = h("button", "cx-column-move"); move.type = "button"; setText(move, "⋮⋮");
move.setAttribute("aria-label", fill(this.labels.gridMoveColumn, { column: column.title })); move.title = move.getAttribute("aria-label");
cell.prepend(move);
move.addEventListener("keydown", event => {
if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
event.preventDefault(); event.stopPropagation();
const at = this.cols.indexOf(column), target = this.cols[at + (event.key === "ArrowLeft" ? -1 : 1)];
if (target) this.moveReportingColumn(column, target, event.key === "ArrowRight");
});
move.addEventListener("pointerdown", event => this.startColumnDrag(event, column));
if (held === column.id) this.focusReportingHeader(move);
});
};
DataGrid.prototype.setColumnOrder = function (ids) {
const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
LAYOUT_ORDER.call(this, ids);
if (held && columnId) {
this.render(); this.restoreReportingFocus(held, columnId);
}
};
DataGrid.prototype.moveReportingColumn = function (column, target, after) {
if (column === target) return;
const ids = this.columns.map(item => item.id).filter(id => id !== column.id), at = ids.indexOf(target.id) + (after ? 1 : 0);
ids.splice(at, 0, column.id); this.setColumnOrder(ids);
const position = this.cols.findIndex(item => item.id === column.id);
const destination = position < 0 ? this.cols.findIndex(item => item.id === target.id) : position;
this.focusReportingHeader(this.headCells[Math.max(0, destination)]?.querySelector(".cx-column-move"));
const order = position < 0 ? this.columns.filter(item => !item.hidden).indexOf(column) : position;
setText(this.live, fill(this.labels.gridColumnMoved, { column: column.title, position: order + 1 }));
};
DataGrid.prototype.startColumnDrag = function (event, column) {
if (this.destroyed || event.button !== 0) return;
if (this.cancelColumnDrag) this.cancelColumnDrag();
if (this.cancelResize) this.cancelResize();
event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
const pointer = event.pointerId, start = event.clientX, startY = event.clientY;
let ghost = null, target = null, after = false, latest = event.clientX, frame = 0;
const clear = () => this.headCells.forEach(cell => cell.classList.remove("cx-drop-before", "cx-drop-after"));
const locate = () => {
clear(); target = null;
const frame = this.grid.getBoundingClientRect(), row = this.headRow.getBoundingClientRect();
const x = Math.max(frame.left + this.grid.clientLeft + 1, Math.min(latest, frame.left + this.grid.clientLeft + this.grid.clientWidth - 1));
const cell = document.elementFromPoint(x, row.top + row.height / 2)?.closest(".cx-hcell");
const index = this.headCells.indexOf(cell);
if (index < 0) return;
const box = cell.getBoundingClientRect(); target = this.cols[index]; after = latest > box.left + box.width / 2;
cell.classList.add(after ? "cx-drop-after" : "cx-drop-before");
};
const scroll = () => {
const box = this.grid.getBoundingClientRect(), delta = latest < box.left + 36 ? -12 : latest > box.right - 36 ? 12 : 0;
if (delta) { this.grid.scrollLeft += delta; locate(); }
frame = requestAnimationFrame(scroll);
};
const move = ev => {
if (ev.pointerId !== pointer) return;
latest = ev.clientX;
if (!ghost && Math.hypot(latest - start, ev.clientY - startY) < 5) return;
if (!ghost) {
ghost = h("div", "cx-column-drag"); ghost.setAttribute("aria-hidden", "true"); setText(ghost, column.title);
const theme = getComputedStyle(this.host);
for (const token of ["surface", "text", "accent", "line"]) ghost.style.setProperty("--cx-" + token, theme.getPropertyValue("--cx-" + token));
document.body.appendChild(ghost); frame = requestAnimationFrame(scroll);
}
ghost.style.left = ev.clientX + 12 + "px"; ghost.style.top = ev.clientY + 12 + "px"; locate();
};
const stop = () => {
global.removeEventListener("pointermove", move); global.removeEventListener("pointerup", end);
global.removeEventListener("pointercancel", cancel); global.removeEventListener("blur", stop); global.removeEventListener("keydown", key);
this.lifetime.signal.removeEventListener("abort", stop);
cancelAnimationFrame(frame); if (ghost) ghost.remove(); clear();
if (this.cancelColumnDrag === stop) this.cancelColumnDrag = null;
};
const end = ev => {
if (ev.pointerId !== pointer) return;
const next = ghost && target, direction = after; stop();
if (next && !this.destroyed) this.moveReportingColumn(column, next, direction);
};
const cancel = ev => { if (ev.pointerId === pointer) stop(); };
const key = ev => { if (ev.key === "Escape") { ev.preventDefault(); stop(); } };
this.cancelColumnDrag = stop;
this.lifetime.signal.addEventListener("abort", stop, { once: true });
global.addEventListener("pointermove", move); global.addEventListener("pointerup", end);
global.addEventListener("pointercancel", cancel); global.addEventListener("blur", stop); global.addEventListener("keydown", key);
};
const COLUMN_PINS = ["none", "left", "right"], PLACEMENT_VALIDATE = GRID_REPORTING.validate,
PLACEMENT_PREPARE = DataGrid.prototype.prepareState, PLACEMENT_STATE_COLUMN = gridStateColumn,
PLACEMENT_STATE_COLUMNS = gridStateColumns, PLACEMENT_API = GRID_REPORTING.api;
GRID_REPORTING.validate = view => {
PLACEMENT_VALIDATE(view);
const options = view.reporting;
if (options.responsive !== undefined && typeof options.responsive !== "boolean" || options.minimumCenterWidth !== undefined &&
(!Number.isInteger(options.minimumCenterWidth) || options.minimumCenterWidth < 40 || options.minimumCenterWidth > 4096))
throw new Error("CanopyX: invalid responsive flag or minimum center width.");
for (const policy of Object.values(options.layout || {})) {
if (policy.pin !== undefined && !COLUMN_PINS.includes(policy.pin) || policy.priority !== undefined &&
(!Number.isInteger(policy.priority) || policy.priority < 0 || policy.priority > MAX_PROTOCOL_INTEGER) ||
policy.alwaysVisible !== undefined && typeof policy.alwaysVisible !== "boolean")
throw new Error("CanopyX: invalid reporting placement policy.");
}
};
DataGrid.prototype.prepareState = function () {
const policies = this.view.reporting && this.view.reporting.layout || {};
for (const column of this.columns) column.pin = policies[column.id] && policies[column.id].pin || "none";
return PLACEMENT_PREPARE.call(this);
};
gridStateColumn = column => Object.assign(PLACEMENT_STATE_COLUMN(column), { pin: column.pin });
gridStateColumns = (grid, input) => {
const result = PLACEMENT_STATE_COLUMNS(grid, input), sources = new Map(input.map(column => [column.id, column]));
for (const saved of result) {
const source = sources.get(saved.id) || saved;
if (source.pin !== undefined && !COLUMN_PINS.includes(source.pin)) throw new Error("CanopyX: invalid saved column pin.");
saved.pin = source.pin === undefined ? reportingLayout(grid, saved).pin || "none" : source.pin;
}
return result;
};
GRID_REPORTING.api = (api, grid) => {
PLACEMENT_API(api, grid);
api.setColumnPinned = (id, pin) => grid.setColumnPinned(id, pin);
api.getColumnLayout = () => grid.columns.map(column => Object.freeze({ id: column.id, requestedPin: column.pin,
pin: column.effectivePin || "none", visible: !column.hidden && !column.responsiveHidden,
responsiveHidden: !!column.responsiveHidden, width: column.renderWidth || column.width }));
};
DataGrid.prototype.setColumnPinned = function (id, pin) {
const column = this.columns.find(item => item.id === id);
if (this.destroyed || !column || !COLUMN_PINS.includes(pin)) throw new Error("CanopyX: pin needs a live grid, declared column and none, left or right.");
if (this.cancelResize) this.cancelResize();
const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
column.pin = pin; this.buildHeader(); this.syncColumnControls(); this.render();
this.restoreReportingFocus(held, columnId); this.stateChanged();
};
const PLACEMENT_WIDTHS = DataGrid.prototype.applyWidths, PLACEMENT_CELL = DataGrid.prototype.newCell;
DataGrid.prototype.visibleColumns = function () {
const requested = this.columns.filter(column => !column.hidden), options = this.view.reporting || {};
for (const column of this.columns) column.responsiveHidden = false;
if (options.responsive && this.grid && this.grid.clientWidth) {
let total = requested.reduce((sum, column) => sum + reportingWidth(this, column, column.width), 0), remaining = requested.length;
const candidates = requested.filter(column => !reportingLayout(this, column).alwaysVisible).sort((a, b) =>
(reportingLayout(this, b).priority ?? MAX_PROTOCOL_INTEGER) - (reportingLayout(this, a).priority ?? MAX_PROTOCOL_INTEGER) ||
requested.indexOf(b) - requested.indexOf(a));
for (const column of candidates) {
if (total <= this.grid.clientWidth || remaining === 1) break;
column.responsiveHidden = true; total -= reportingWidth(this, column, column.width); remaining--;
}
}
const visible = requested.filter(column => !column.responsiveHidden);
return ["left", "none", "right"].flatMap(pin => visible.filter(column => column.pin === pin));
};
DataGrid.prototype.applyWidths = function () {
const visible = this.visibleColumns();
if (this.cols && (visible.length !== this.cols.length || visible.some((column, index) => column !== this.cols[index]))) {
const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
const heldHeader = this.headRow.contains(document.activeElement);
this.buildHeader(); this.syncColumnControls(); this.render(); this.restoreReportingFocus(held, columnId);
if (heldHeader && document.activeElement === document.body) {
if (this.focused) this.setFocus(this.focused, true);
else this.focusReportingHeader(this.headRow.querySelector("button,.cx-resize"));
}
return;
}
PLACEMENT_WIDTHS.call(this);
const budget = Math.max(0, this.grid.clientWidth - ((this.view.reporting || {}).minimumCenterWidth || 128));
for (const column of this.columns) column.effectivePin = "none";
const left = this.cols.filter(column => column.pin === "left"), right = this.cols.filter(column => column.pin === "right").reverse();
let used = 0; const stopped = [false, false];
for (let index = 0; index < Math.max(left.length, right.length); index++) {
for (const [side, column] of [left[index], right[index]].entries()) if (column && !stopped[side]) {
if (used + column.renderWidth > budget) stopped[side] = true;
else { used += column.renderWidth; column.effectivePin = column.pin; }
}
}
let start = 0, end = 0;
for (const column of this.cols) {
column.pinOffset = column.effectivePin === "left" ? start : 0;
if (column.effectivePin === "left") start += column.renderWidth;
}
for (const column of [...this.cols].reverse()) if (column.effectivePin === "right") {
column.pinOffset = end; end += column.renderWidth;
}
this.pinnedLeftWidth = start; this.pinnedRightWidth = end;
this.cols.forEach((column, index) => this.applyColumnPin(this.headCells[index], column));
for (const row of [...this.rendered.values(), ...this.pool]) if (row._kind === "node")
this.cols.forEach((column, index) => { if (row.children[index]) this.applyColumnPin(row.children[index], column); });
const active = document.activeElement;
if (active && this.headRow.contains(active)) this.focusReportingHeader(active);
const cell = active && active.closest(".cx-cell");
if (cell && this.canvas.contains(cell)) this.revealInRow(cell, active, false);
};
DataGrid.prototype.applyColumnPin = function (cell, column) {
const pin = column.effectivePin || "none";
if (pin === "none") cell.removeAttribute("data-cx-pin"); else cell.setAttribute("data-cx-pin", pin);
cell.style.left = pin === "left" ? column.pinOffset + "px" : "";
cell.style.right = pin === "right" ? column.pinOffset + "px" : "";
};
DataGrid.prototype.newCell = function (index, width, kind) {
const cell = PLACEMENT_CELL.call(this, index, width, kind);
if (kind && this.cols[index]) this.applyColumnPin(cell, this.cols[index]); return cell;
};
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridPinColumn: "{column}: pinned region", gridPinNone: "Scroll", gridPinLeft: "Left", gridPinRight: "Right",
gridResponsiveHidden: "Hidden at this width"
}));
function reportingColumnOrder(columns) { return ["left", "none", "right"].flatMap(pin => columns.filter(column => column.pin === pin)); }
const PLACEMENT_HEADER = DataGrid.prototype.buildHeader, PLACEMENT_MOVE = DataGrid.prototype.moveReportingColumn,
PLACEMENT_CONTROLS = DataGrid.prototype.syncColumnControls;
DataGrid.prototype.buildHeader = function () {
this.columns = reportingColumnOrder(this.columns); return PLACEMENT_HEADER.call(this);
};
DataGrid.prototype.moveReportingColumn = function (column, target, after) {
column.pin = target.pin; return PLACEMENT_MOVE.call(this, column, target, after);
};
DataGrid.prototype.syncColumnControls = function () {
const active = document.activeElement, held = active && active.getAttribute("data-cx-layout-column"), action = active && active.getAttribute("data-cx-layout-action");
PLACEMENT_CONTROLS.call(this); if (!this.columnPanel) return;
this.columns.forEach((column, index) => {
const row = this.columnPanel.children[index], input = row.querySelector("input[type=checkbox]"), pin = h("select");
input.disabled = !column.hidden && this.columns.filter(item => !item.hidden).length === 1;
pin.setAttribute("aria-label", fill(this.labels.gridPinColumn, { column: column.title }));
pin.setAttribute("data-cx-layout-column", column.id); pin.setAttribute("data-cx-layout-action", "pin");
[["none", "gridPinNone"], ["left", "gridPinLeft"], ["right", "gridPinRight"]].forEach(([value, label]) => pin.append(gridOption(value, this.labels[label])));
pin.value = column.pin; pin.addEventListener("change", () => this.setColumnPinned(column.id, pin.value)); row.append(pin);
if (column.responsiveHidden) { const note = h("span", "cx-grid-responsive-note"); setText(note, this.labels.gridResponsiveHidden); row.append(note); }
for (const [delta, action] of [[-1, "earlier"], [1, "later"]]) {
const previous = row.querySelector('[data-cx-layout-action="' + action + '"]'), button = previous.cloneNode(true);
previous.replaceWith(button); button.addEventListener("click", () => {
const at = this.columns.indexOf(column), target = this.columns[at + delta]; if (!target) return;
column.pin = target.pin;
const ids = this.columns.map(item => item.id); [ids[at], ids[at + delta]] = [ids[at + delta], ids[at]]; this.setColumnOrder(ids);
});
}
});
if (held) {
const choices = [...this.columnPanel.querySelectorAll("[data-cx-layout-column]")].filter(control =>
control.getAttribute("data-cx-layout-column") === held && !control.disabled);
(choices.find(control => control.getAttribute("data-cx-layout-action") === action) || choices[0] ||
this.columnPanel.parentNode.querySelector("summary")).focus({ preventScroll: true });
}
};
DataGrid.prototype.setColumnVisible = function (id, visible) {
const column = this.columns.find(item => item.id === id);
if (!column || typeof visible !== "boolean") throw new Error("CanopyX: visibility needs a declared column and boolean.");
if (!visible && !column.hidden && this.columns.filter(item => !item.hidden).length === 1) throw new Error("CanopyX: keep at least one column visible.");
const held = this.heldCell(), columnId = held && this.cols[held.index] && this.cols[held.index].id;
column.hidden = !visible; this.buildHeader(); this.syncColumnControls(); this.render(); this.restoreReportingFocus(held, columnId); this.stateChanged();
};
const PLACEMENT_REVEAL = DataGrid.prototype.revealInRow, PLACEMENT_FOCUS_HEADER = DataGrid.prototype.focusReportingHeader,
PLACEMENT_EXPORT = DataGrid.prototype.prepareExport, PLACEMENT_ACCESS_HEADER = DataGrid.prototype.buildHeader;
function revealReportingCenter(grid, target, pin) {
if (pin && pin !== "none") return;
const frame = grid.grid.getBoundingClientRect(), left = frame.left + grid.grid.clientLeft + (grid.pinnedLeftWidth || 0),
right = frame.left + grid.grid.clientLeft + grid.grid.clientWidth - (grid.pinnedRightWidth || 0), box = target.getBoundingClientRect();
if (box.left < left) grid.grid.scrollLeft -= left - box.left;
else if (box.right > right) grid.grid.scrollLeft += Math.min(box.right - right, Math.max(0, box.left - left));
}
DataGrid.prototype.revealInRow = function (cell, target, treeCell) {
PLACEMENT_REVEAL.call(this, cell, target, treeCell);
if (cell.parentNode && cell.parentNode._kind === "node") revealReportingCenter(this, target, cell.getAttribute("data-cx-pin"));
};
DataGrid.prototype.focusReportingHeader = function (control) {
PLACEMENT_FOCUS_HEADER.call(this, control);
if (control) revealReportingCenter(this, control, control.closest(".cx-hcell").getAttribute("data-cx-pin"));
};
DataGrid.prototype.buildHeader = function () {
if (!this.pinnedHeaderFocus) {
this.pinnedHeaderFocus = true;
this.headRow.addEventListener("focusin", event => {
const cell = event.target.closest(".cx-hcell");
if (cell && this.headRow.contains(cell)) revealReportingCenter(this, event.target, cell.getAttribute("data-cx-pin"));
}, { signal: this.lifetime.signal });
}
return PLACEMENT_ACCESS_HEADER.call(this);
};
DataGrid.prototype.prepareExport = function (options) {
const columns = options && options.columns === undefined ? reportingColumnOrder(this.columns.filter(column => !column.hidden)).map(column => column.id) : undefined;
return PLACEMENT_EXPORT.call(this, columns ? Object.assign({}, options, { columns }) : options);
};
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridExpandCell: "{column}: show complete text", gridCloseCell: "Close complete text"
}));
const PRESENTERS_VALIDATE = GRID_REPORTING.validate, PRESENTERS_BUILD = DataGrid.prototype.build;
function reportingPresenter(options, column, columns) {
const fields = { link: ["hrefColumn", "newWindow"], icon: ["glyph"], progress: ["maximum"],
boolean: [], list: ["separator", "limit"], longText: [] };
if (!options || typeof options !== "object" || Array.isArray(options) || !Object.hasOwn(fields, options.kind) ||
Object.keys(options).some(key => key !== "kind" && !fields[options.kind].includes(key)))
throw new Error("CanopyX: invalid reporting presenter.");
if (options.kind === "progress" && (column.kind !== "number" || !Number.isFinite(options.maximum) ||
options.maximum <= 0 || options.maximum > Number.MAX_SAFE_INTEGER) ||
["boolean", "list", "link"].includes(options.kind) && column.kind !== "text")
throw new Error("CanopyX: presenter and raw column kind are incompatible.");
if (options.kind === "link" && (options.newWindow !== undefined && typeof options.newWindow !== "boolean" ||
options.hrefColumn !== undefined && !columns.some(item => item.id === options.hrefColumn && item.kind === "text")) ||
options.kind === "icon" && (typeof options.glyph !== "string" || !options.glyph.trim() || options.glyph.length > 32) ||
options.kind === "list" && (typeof options.separator !== "string" || !options.separator.length || options.separator.length > 16 ||
!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 16))
throw new Error("CanopyX: invalid reporting presenter options.");
}
GRID_REPORTING.validate = view => {
PRESENTERS_VALIDATE(view);
const presenters = view.reporting.presenters;
if (presenters === undefined) return;
if (!presenters || typeof presenters !== "object" || Array.isArray(presenters))
throw new Error("CanopyX: presenters are keyed by declared column ID.");
for (const [id, options] of Object.entries(presenters)) {
const column = view.columns.find(item => item && item.id === id);
if (!column) throw new Error("CanopyX: a presenter needs a declared column.");
reportingPresenter(options, column, view.columns);
}
};
function reportingLink(raw) {
if (typeof raw !== "string" || raw.length > 8192 || /[\u0000-\u001f\u007f]/.test(raw) || !raw.trim()) return null;
const value = raw.trim();
try {
const url = new URL(value, document.baseURI);
if (["http:", "https:", "mailto:"].includes(url.protocol)) return url.href;
if (url.protocol === "file:" && !/^[a-z][a-z\d+.-]*:|^[\\/]{2}|\\/i.test(value)) return url.href;
} catch (_) { /* Invalid destinations keep their text. */ }
return null;
}
function reportingCellRenderer(grid, column, options) {
return (row, element) => {
const cell = row.cells[column.id], raw = cellValue(cell), text = cellText(cell, column, grid.fmt);
const object = isCellObject(cell), tone = object ? toneOf(cell.tone) : NO_TONE;
applyTone(element, element.className + " cx-presented-cell", tone);
if (object && cell.title) element.title = cell.title;
const appendText = (value, tag = "span", cls = "cx-presenter-text") => {
const item = h(tag, cls); setText(item, value); element.appendChild(item); return item;
};
if (options.kind === "link") {
const href = reportingLink(cellValue(options.hrefColumn ? row.cells[options.hrefColumn] : cell));
const link = appendText(text, href ? "a" : "span");
if (href) { link.href = href;
if (options.newWindow) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
}
} else if (options.kind === "icon") {
const glyph = appendText(options.glyph, "span", "cx-presenter-icon"); glyph.setAttribute("aria-hidden", "true"); appendText(text);
} else if (options.kind === "progress" && typeof raw === "number") {
const progress = h("progress", "cx-presenter-progress"); progress.max = options.maximum;
progress.value = Math.min(options.maximum, Math.max(0, raw)); progress.setAttribute("aria-label", column.title + ": " + text);
element.appendChild(progress); appendText(text);
} else if (options.kind === "boolean" && typeof raw === "boolean") {
appendText(object && cell.text !== undefined ? text : raw ? grid.labels.gridTrue : grid.labels.gridFalse);
} else if (options.kind === "longText" || options.kind === "list") {
const items = options.kind === "list" ? text.split(options.separator, options.limit + 1) : null;
const value = items ? items.slice(0, options.limit).join(options.separator) + (items.length > options.limit ? " …" : "") : text;
const preview = value.length > 256 ? value.slice(0, 256).replace(/[\uD800-\uDBFF]$/, "") + " …" : value;
if (text) {
const button = appendText(preview, "button", "cx-presenter-expand"); button.type = "button";
button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-label", fill(grid.labels.gridExpandCell, { column: column.title }));
button.addEventListener("click", () => grid.showReportingText(column, text, button, row.id));
} else appendText(preview);
} else appendText(text);
if (object) for (const badge of cell.badges || []) element.appendChild(badgeElement(badge));
return true;
};
}
DataGrid.prototype.build = function () {
for (const column of this.columns) {
const options = this.view.reporting && this.view.reporting.presenters && this.view.reporting.presenters[column.id];
if (options && !column.render) column.render = reportingCellRenderer(this, column, options);
}
return PRESENTERS_BUILD.call(this);
};
DataGrid.prototype.showReportingText = function (column, text, returnFocus, rowId) {
if (this.destroyed || this.pendingQuery || !this.acceptedQuery) return;
if (this.reportingText) this.reportingText.close();
const dialog = h("dialog", "cx-static cx-reporting-text"), heading = h("h2"), content = h("pre"), close = h("button", "cx-button");
dialog.setAttribute("data-cx-theme", this.host.getAttribute("data-cx-theme"));
const theme = getComputedStyle(this.host);
for (const token of ["surface", "text", "accent", "line"])
dialog.style.setProperty("--cx-" + token, theme.getPropertyValue("--cx-" + token));
heading.id = this.id + "-cell-title"; setText(heading, column.title); dialog.setAttribute("aria-labelledby", heading.id);
setText(content, text); content.tabIndex = 0; close.type = "button"; setText(close, this.labels.gridCloseCell);
dialog.append(heading, content, close); document.body.appendChild(dialog); this.reportingText = dialog;
const signal = this.dataLifetime.signal, abort = () => dialog.close();
signal.addEventListener("abort", abort, { once: true });
close.addEventListener("click", () => dialog.close());
dialog.addEventListener("keydown", event => {
if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
event.preventDefault();
(document.activeElement === content ? close : content).focus({ preventScroll: true });
});
dialog.addEventListener("close", () => {
signal.removeEventListener("abort", abort); dialog.remove();
if (this.reportingText === dialog) this.reportingText = null;
if (signal.aborted || this.destroyed) return;
if (this.canvas.contains(returnFocus) && reachable(returnFocus)) returnFocus.focus({ preventScroll: true });
else {
const element = [...this.rendered.values()].find(item => item._w && !item._w.status && item._w.key === rowId);
const index = this.visibleColumns().findIndex(item => item.id === column.id);
if (element && index >= 0) this.focusCell(element._w, index, 0);
else this.setFocus(element ? element._w : this.focused || this.rowItem(this.rowAt(this.logicalTop())), true);
}
}, { once: true });
dialog.showModal(); content.focus();
};
const FACET_API = GRID_REPORTING.api;
GRID_REPORTING.api = (api, grid) => {
FACET_API?.(api, grid);
api.getFacets = (column, options) => grid.getFacets(column, options);
};
DataGrid.prototype.getFacets = async function (column, options = {}) {
if (this.destroyed || this.pendingQuery || !this.acceptedQuery || !this.view.reporting?.facetColumns?.includes(column) || typeof this.source.facet !== "function")
throw new Error("CanopyX: facets need an accepted query, opted-in column and explicit source capability.");
const search = options.search === undefined ? "" : options.search, limit = options.limit === undefined ? 100 : options.limit,
includeCurrentFilter = options.includeCurrentFilter === undefined ? true : options.includeCurrentFilter;
if (typeof search !== "string" || search.length > 16384 || !Number.isInteger(limit) || limit < 1 || limit > 200 || typeof includeCurrentFilter !== "boolean")
throw new Error("CanopyX: invalid bounded facet request.");
const controller = new AbortController(), dataSignal = this.dataLifetime.signal, epoch = this.queryEpoch;
const abort = () => controller.abort();
dataSignal.addEventListener("abort", abort, { once: true }); options.signal?.addEventListener("abort", abort, { once: true });
if (options.signal?.aborted) abort();
const request = gridFreeze({ protocol: PROTOCOL, type: "gridFacetQuery", column, search, limit, includeCurrentFilter, query: this.acceptedQuery });
try {
const page = await this.runGridHook(signal => this.source.facet(request, { signal }), controller.signal);
gridOperationActive(this, controller.signal);
if (epoch !== this.queryEpoch) throw new DOMException("Facet request was superseded.", "AbortError");
return reportingFacetPage(page, this, request);
} finally {
dataSignal.removeEventListener("abort", abort); options.signal?.removeEventListener("abort", abort); controller.abort();
}
};
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridFacetValues: "Values and counts from applied filters", gridFacetSearch: "Search values",
gridFacetIncludeCurrent: "Include this column's applied filters", gridFacetLoad: "Load values",
gridFacetChoose: "Choose a value", gridFacetCounts: "{count} matching rows; {shown} of {total} values.",
gridFacetReload: "Values changed or the request was cancelled. Load values again."
}));
const FACET_CONTROLS = {};
for (const name of ["buildGridFilters", "renderGridFilters", "addGridFilter", "syncQuerySummary", "destroy"]) FACET_CONTROLS[name] = DataGrid.prototype[name];
Object.assign(DataGrid.prototype, {
stopReportingFacets() { for (const stop of this.reportingFacetStops || []) stop(); },
syncQuerySummary() {
FACET_CONTROLS.syncQuerySummary.call(this);
const shape = JSON.stringify([this.acceptedQuery?.revision, this.acceptedQuery?.search, this.acceptedQuery?.filters, this.acceptedQuery?.filterGroup]);
if (shape !== this.reportingFacetAccepted) this.stopReportingFacets();
this.reportingFacetAccepted = shape;
},
buildGridFilters() {
this.reportingFacetStops = new Set(); this.reportingFacetSequence = 0; FACET_CONTROLS.buildGridFilters.call(this);
this.reportingFilters?.details.addEventListener("toggle", () => {
if (!this.reportingFilters.details.open) this.stopReportingFacets();
});
},
renderGridFilters(panel) { this.stopReportingFacets(); FACET_CONTROLS.renderGridFilters.call(this, panel); },
destroy() { this.stopReportingFacets(); FACET_CONTROLS.destroy.call(this); },
addGridFilter(parent, predicate) {
const count = parent.children.length; FACET_CONTROLS.addGridFilter.call(this, parent, predicate);
if (parent.children.length === count || !this.view.reporting?.facetColumns?.length) return;
this.buildReportingFacetControl(parent.lastElementChild);
},
buildReportingFacetControl(row) {
const fields = row._filter, details = h("details", "cx-grid-facet"), summary = h("summary"),
body = h("div", "cx-grid-facet-body"), search = h("input"), include = h("input"), choice = h("select"), status = h("p");
setText(summary, this.labels.gridFacetValues); search.type = "search"; search.maxLength = 16384;
include.type = "checkbox"; include.checked = true; status.setAttribute("role", "status");
status.id = this.id + "-facet-" + ++this.reportingFacetSequence; choice.setAttribute("aria-describedby", status.id);
const load = gridButton(this.labels.gridFacetLoad, () => loadValues());
body.append(gridInputLabel(this.labels.gridFacetSearch, search), gridInputLabel(this.labels.gridFacetIncludeCurrent, include),
load, gridInputLabel(this.labels.gridFacetChoose, choice));
details.append(summary, status, body); row.insertBefore(details, row.lastElementChild);
let timer, controller, epoch = 0, items = [], composing = false;
const clear = () => { items = []; choice.textContent = ""; choice.appendChild(gridOption("", this.labels.gridFacetChoose)); choice.disabled = true; };
const stop = () => {
clearTimeout(timer); timer = null; epoch++; controller?.abort(); controller = null;
this.reportingFacetStops.delete(stop); load.disabled = false;
clear(); if (details.open) setText(status, this.labels.gridFacetReload);
};
row._facetDispose = stop;
const active = () => !this.destroyed && row.isConnected && details.open && !details.hidden && this.reportingFilters.details.open;
const loadValues = async () => {
stop(); if (!active()) return;
clear(); const generation = epoch, request = new AbortController(); controller = request;
this.reportingFacetStops.add(stop); load.disabled = true; setText(status, this.labels.loading);
try {
const page = await this.getFacets(fields.column.value, { search: search.value, includeCurrentFilter: include.checked, signal: request.signal });
if (generation !== epoch || !active()) return;
items = page.items;
const column = this.columns.find(item => item.id === fields.column.value), numbers = numberFormat(this.lang);
page.items.forEach((item, index) => {
const text = item.value === null ? this.labels.gridIsNull : column.kind === "text" ?
(typeof item.value === "boolean" ? this.labels.gridBoolean + ": " + (item.value ? this.labels.gridTrue : this.labels.gridFalse) :
this.labels.gridText + ": " + item.value) : column.kind === "number" ? String(item.value) : item.value;
choice.appendChild(gridOption(String(index), text + " (" + numbers.format(item.count) + ")"));
});
choice.disabled = !items.length;
setText(status, fill(this.labels.gridFacetCounts, { count: numbers.format(page.matched), shown: numbers.format(items.length), total: numbers.format(page.totalValues) }));
} catch (failure) {
if (generation === epoch && active()) setText(status, failure.name === "AbortError" ? this.labels.gridFacetReload : failure.message);
} finally {
if (generation === epoch) { load.disabled = false; controller = null; }
}
};
const schedule = () => {
stop(); clear(); if (!active() || composing) return;
setText(status, this.labels.loading); this.reportingFacetStops.add(stop);
timer = setTimeout(loadValues, 200);
};
search.addEventListener("input", schedule);
search.addEventListener("compositionstart", () => { composing = true; stop(); });
search.addEventListener("compositionend", () => { composing = false; schedule(); });
search.addEventListener("keydown", event => {
if (event.key === "Enter") { event.preventDefault(); if (!event.isComposing && !composing) loadValues(); }
});
include.addEventListener("change", loadValues);
details.addEventListener("toggle", () => {
if (details.open) loadValues(); else { stop(); clear(); setText(status, ""); }
});
const refresh = () => {
stop(); clear(); setText(status, ""); details.open = false;
details.hidden = !this.view.reporting.facetColumns.includes(fields.column.value);
};
fields.column.addEventListener("change", refresh);
row.lastElementChild.addEventListener("click", stop, { capture: true });
choice.addEventListener("change", () => {
if (!choice.value || !items[Number(choice.value)]) return;
const value = items[Number(choice.value)].value, column = this.columns.find(item => item.id === fields.column.value);
fields.type.value = typeof value === "boolean" ? "boolean" : "string";
fields.operator.value = value === null ? "isNull" : "eq";
fields.operator.dispatchEvent(new Event("change")); fields.type.dispatchEvent(new Event("change"));
fields.input.value = value === null ? "" : column.kind === "datetime" ? new Date(value).toISOString().slice(0, -1) : String(value);
if (fields.boolean) fields.boolean.value = String(value);
fields.original = { column: column.id, operator: fields.operator.value, values: value === null ? [] : [value] }; fields.edited = false;
});
refresh();
}
});
const VIEW_SETTINGS_LIMIT = 1048576, VIEW_STATE_BASE = {};
for (const name of ["prepareState", "readStoredState", "writeStoredState", "saveView", "removeSavedView", "resetView"]) VIEW_STATE_BASE[name] = DataGrid.prototype[name];
function reportingStoredSettings(grid, input) {
const json = JSON.stringify(input);
if (typeof json !== "string" || json.length > VIEW_SETTINGS_LIMIT) throw new Error("CanopyX: view preferences exceed the 1,048,576-character limit.");
const value = JSON.parse(json);
if (!value || Array.isArray(value) || Object.keys(value).some(key => !["version", "view", "current", "views", "defaultView"].includes(key)) ||
(value.version !== undefined || value.view !== undefined) && (value.version !== 1 || value.view !== grid.view.id) ||
!Array.isArray(value.views) || value.views.length > 20)
throw new Error("CanopyX: invalid or incompatible view preferences.");
const names = new Set(), views = [];
for (const entry of value.views) {
if (!entry || Object.keys(entry).some(key => !["name", "state"].includes(key))) throw new Error("CanopyX: invalid saved view entry.");
const name = grid.viewName(entry.name);
if (names.has(name)) throw new Error("CanopyX: repeated saved view name.");
names.add(name);
try { views.push({ name, state: grid.readGridState(entry.state) }); }
catch (_) { grid.viewStorageRejected = true; grid.viewPreferenceError = "CanopyX: incompatible saved views were skipped; persistence is paused until reset."; }
}
let current;
if (value.current !== undefined) {
try { current = grid.readGridState(value.current); }
catch (_) { grid.viewStorageRejected = true; grid.viewPreferenceError = "CanopyX: incompatible current view settings were skipped; persistence is paused until reset."; }
}
const defaultView = value.defaultView === undefined ? null : grid.viewName(value.defaultView);
if (defaultView && !names.has(defaultView)) throw new Error("CanopyX: the default saved view does not exist.");
return { current, views, defaultView: views.some(entry => entry.name === defaultView) ? defaultView : null };
}
Object.assign(DataGrid.prototype, {
prepareState() {
this.viewSettingsIntent = 0; this.viewPreferenceIntent = 0; this.defaultSavedView = null;
if (this.opts.viewStore && (!this.view.reporting || typeof this.view.stateKey !== "string" || !this.view.stateKey.trim() ||
this.view.stateKey.length > 512 || typeof this.opts.viewStore.load !== "function" || typeof this.opts.viewStore.save !== "function"))
throw new Error("CanopyX: a host view store needs a reporting grid, bounded state key, load and save hooks.");
VIEW_STATE_BASE.prepareState.call(this);
const chosen = this.defaultSavedView && this.savedViews.get(this.defaultSavedView);
if (chosen) this.initialState = chosen;
},
readStoredState() {
if (!this.view.reporting) return VIEW_STATE_BASE.readStoredState.call(this);
if (this.opts.viewStore || !this.storageKey) return null;
try {
const text = global[this.view.reporting.viewStorage === "local" ? "localStorage" : "sessionStorage"].getItem(this.storageKey);
if (!text) return null;
if (text.length > VIEW_SETTINGS_LIMIT) throw new Error("CanopyX: view preferences exceed the 1,048,576-character limit.");
const settings = reportingStoredSettings(this, JSON.parse(text)); this.defaultSavedView = settings.defaultView;
return settings;
} catch (error) { this.viewStorageRejected = true; this.viewPreferenceError = error.message; return null; }
},
getViewSettings() {
const settings = { version: 1, view: this.view.id, current: this.getState(),
views: [...this.savedViews].map(([name, state]) => ({ name, state })) };
if (this.defaultSavedView) settings.defaultView = this.defaultSavedView;
const json = JSON.stringify(settings);
if (json.length > VIEW_SETTINGS_LIMIT) throw new Error("CanopyX: view preferences exceed the 1,048,576-character limit.");
return gridFreeze(JSON.parse(json));
},
writeStoredState(state) {
if (!this.view.reporting) return VIEW_STATE_BASE.writeStoredState.call(this, state);
if (!this.storageKey || this.destroyed || this.loadingViewSettings || this.viewStorageRejected) return;
try {
if (this.viewSettingsIntent === (this.viewBrowserSyncedIntent || 0)) this.pullBrowserViewMetadata();
if (this.viewStorageRejected) return;
const settings = this.getViewSettings();
if (this.opts.viewStore) {
this.viewPersistenceError = null;
return this.queueViewSettings(settings);
}
global[this.view.reporting.viewStorage === "local" ? "localStorage" : "sessionStorage"].setItem(this.storageKey, JSON.stringify(settings));
this.viewBrowserSyncedIntent = this.viewSettingsIntent;
this.viewPersistenceError = null; this.setViewPreferenceError("");
} catch (error) { this.viewPersistenceError = error; this.setViewPreferenceError(error.message); }
},
pullBrowserViewMetadata() {
if (this.opts.viewStore || this.view.reporting?.viewStorage !== "local" || !this.storageKey || this.viewStorageRejected ||
this.viewSettingsIntent !== (this.viewBrowserSyncedIntent || 0)) return;
try {
const text = global.localStorage.getItem(this.storageKey); if (!text) return;
const settings = reportingStoredSettings(this, JSON.parse(text));
this.savedViews = new Map(settings.views.map(entry => [entry.name, entry.state])); this.defaultSavedView = settings.defaultView;
if (this.viewStorageRejected) this.setViewPreferenceError(this.viewPreferenceError);
this.syncSavedViews();
} catch (error) { this.viewStorageRejected = true; this.setViewPreferenceError(error.message); }
},
setViewPreferenceError(message) { this.viewPreferenceError = message; if (this.viewPreferenceStatus) setText(this.viewPreferenceStatus, message); },
requireViewSettingsReady() { if (this.loadingViewSettings) throw new Error("CanopyX: wait for saved views to finish loading."); },
getDefaultView() { return this.defaultSavedView; },
setDefaultView(name) {
this.requireViewSettingsReady();
this.pullBrowserViewMetadata();
if (name !== null) { name = this.viewName(name); if (!this.savedViews.has(name)) throw new Error("CanopyX: the saved view does not exist."); }
this.viewSettingsIntent++; this.defaultSavedView = name; this.writeStoredState(this.getState()); this.syncSavedViews();
},
renameSavedView(oldName, newName) {
this.requireViewSettingsReady();
this.pullBrowserViewMetadata();
oldName = this.viewName(oldName); newName = this.viewName(newName);
if (!this.savedViews.has(oldName)) throw new Error("CanopyX: the saved view does not exist.");
if (oldName !== newName && this.savedViews.has(newName)) throw new Error("CanopyX: that saved view name already exists.");
this.viewSettingsIntent++;
this.savedViews = new Map([...this.savedViews].map(([name, state]) => [name === oldName ? newName : name, state]));
if (this.defaultSavedView === oldName) this.defaultSavedView = newName;
this.writeStoredState(this.getState()); this.syncSavedViews(); if (this.savedChoice) this.savedChoice.value = newName;
},
saveView(name) {
this.requireViewSettingsReady(); this.pullBrowserViewMetadata();
const intent = this.viewSettingsIntent; this.viewSettingsIntent++;
try { return VIEW_STATE_BASE.saveView.call(this, name); }
catch (error) { this.viewSettingsIntent = intent; throw error; }
},
removeSavedView(name) {
this.requireViewSettingsReady();
this.pullBrowserViewMetadata();
name = this.viewName(name); this.viewSettingsIntent++;
if (this.defaultSavedView === name) this.defaultSavedView = null;
return VIEW_STATE_BASE.removeSavedView.call(this, name);
},
async resetView() {
await VIEW_STATE_BASE.resetView.call(this);
if (this.viewStorageRejected) { this.viewStorageRejected = false; this.viewSettingsIntent++; this.writeStoredState(this.getState()); }
return this.getQuery();
},
getShareState() {
const state = this.getState();
state.query = gridQuery(this.view, gridQueryStart({ sort: state.query.sort, searchMode: state.query.searchMode }));
state.selection = []; state.scrollTop = 0; if (state.paging) state.paging.offset = 0;
return gridFreeze(state);
}
});
const VIEW_STORE_INITIALIZE = DataGrid.prototype.initializeState, VIEW_STORE_QUERY = DataGrid.prototype.setQuery,
VIEW_STORE_SEARCH = DataGrid.prototype.buildGridSearch, VIEW_STORE_STATE = DataGrid.prototype.setState,
VIEW_STORE_PRESENTATION = DataGrid.prototype.applyStatePresentation, VIEW_STORE_API = GRID_REPORTING.api;
GRID_REPORTING.api = (api, grid) => {
VIEW_STORE_API?.(api, grid);
for (const name of ["getViewSettings", "getDefaultView", "setDefaultView", "renameSavedView", "getShareState", "flushViewSettings"])
api[name] = grid[name].bind(grid);
};
GRID_REPORTING.search = (grid, update) => {
grid.scheduleGridSearch = delay => {
clearTimeout(grid.searchTimer); grid.searchTimer = setTimeout(update, delay);
};
};
for (const name of ["setColumnWidth", "setColumnVisible", "setColumnOrder", "setColumnPinned", "setTimeZone", "setSelection"]) {
const original = DataGrid.prototype[name];
DataGrid.prototype[name] = function (...args) {
const result = original.apply(this, args); this.noteViewPreferenceIntent(); return result;
};
}
Object.assign(DataGrid.prototype, {
noteViewPreferenceIntent() { this.viewPreferenceIntent++; },
buildGridSearch() {
VIEW_STORE_SEARCH.call(this);
for (const event of ["input", "compositionstart", "compositionend"])
this.searchInput.addEventListener(event, () => {
this.noteViewPreferenceIntent(); this.searchDeadline = performance.now() + this.searchDelayMs;
}, { signal: this.lifetime.signal });
},
setState(input) { this.restorePreferenceIntent = this.viewPreferenceIntent; return VIEW_STORE_STATE.call(this, input); },
applyStatePresentation(state) {
if (this.restorePreferenceIntent === this.viewPreferenceIntent) VIEW_STORE_PRESENTATION.call(this, state);
},
setQuery(input, paging) {
const pending = VIEW_STORE_QUERY.call(this, input, paging);
this.viewQueryPromise = pending; return pending;
},
async initializeState() {
if (!this.opts.viewStore) return VIEW_STORE_INITIALIZE.call(this);
this.loadingViewSettings = true; this.setViewPreferenceError(this.labels.loading);
const epoch = this.queryEpoch, intent = this.viewSettingsIntent, preference = this.viewPreferenceIntent;
try {
const input = await this.runGridHook(signal => this.opts.viewStore.load({ key: this.storageKey, view: this.view.id, signal }));
gridOperationActive(this);
this.setViewPreferenceError("");
if (input !== null && input !== undefined && intent === this.viewSettingsIntent) {
const settings = reportingStoredSettings(this, input);
this.savedViews = new Map(settings.views.map(entry => [entry.name, entry.state]));
this.defaultSavedView = settings.defaultView;
if (epoch === this.queryEpoch && preference === this.viewPreferenceIntent)
this.initialState = this.defaultSavedView ? this.savedViews.get(this.defaultSavedView) : settings.current;
this.syncSavedViews(); this.setViewPreferenceError(this.viewPreferenceError || "");
}
} catch (error) {
if (this.destroyed) throw error;
this.viewStoreFaulted = true; this.setViewPreferenceError(error.message);
} finally { this.loadingViewSettings = false; }
let pending = this.viewQueryPromise;
if (epoch === this.queryEpoch) {
const deadline = this.searchTimer == null ? null : this.searchDeadline, text = this.searchInput?.value;
pending = VIEW_STORE_INITIALIZE.call(this);
if (deadline !== null) {
this.searchInput.value = text; this.scheduleGridSearch(Math.max(0, deadline - performance.now()));
}
}
while (pending) {
try { await pending; if (pending === this.viewQueryPromise) return this.getQuery(); }
catch (error) { if (this.destroyed || error.name !== "AbortError" || pending === this.viewQueryPromise) throw error; }
pending = this.viewQueryPromise;
}
},
queueViewSettings(settings) {
if (this.viewStoreFaulted) return;
const key = JSON.stringify(settings);
if (this.viewStoreWriting && key === this.activeViewSettingsKey) { this.pendingViewSettings = null; return; }
if (!this.viewStoreWriting && key === this.acknowledgedViewSettingsKey) {
this.setViewPreferenceError(""); return;
}
this.pendingViewSettings = settings;
if (this.viewStoreWriting) return;
this.viewStoreWriting = true;
this.viewStoreWrite = (async () => {
try {
while (this.pendingViewSettings && !this.destroyed) {
const current = this.pendingViewSettings; this.pendingViewSettings = null;
this.activeViewSettingsKey = JSON.stringify(current);
await this.runGridHook(signal => this.opts.viewStore.save({ key: this.storageKey, view: this.view.id, settings: current, signal }));
this.acknowledgedViewSettingsKey = this.activeViewSettingsKey;
gridOperationActive(this); this.setViewPreferenceError("");
}
} catch (error) {
this.pendingViewSettings = null; this.viewStoreFaulted = true;
if (!this.destroyed) this.setViewPreferenceError(error.message);
throw error;
} finally { this.viewStoreWriting = false; this.activeViewSettingsKey = null; }
})();
this.viewStoreWrite.catch(() => {});
},
flushViewSettings() {
if (this.destroyed) return Promise.reject(new DOMException("Grid was destroyed.", "AbortError"));
if (this.loadingViewSettings) return Promise.reject(new Error("CanopyX: wait for saved views to finish loading."));
this.writeStoredState(this.getState());
if (this.viewPersistenceError) return Promise.reject(this.viewPersistenceError);
if (this.viewStorageRejected) return Promise.reject(new Error(this.viewPreferenceError));
if (this.viewStoreFaulted) return Promise.reject(new Error(this.viewPreferenceError || "CanopyX: preference persistence is paused."));
return this.viewStoreWrite || Promise.resolve();
}
});
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridRenameView: "Rename view", gridDefaultView: "Make default", gridClearDefaultView: "Clear default",
gridDefaultViewName: "Default view: {name}", gridNoDefaultView: "No default view",
gridDefaultViewOption: "{name} (default)"
}));
const VIEW_CONTROLS_BUILD = DataGrid.prototype.buildSavedViews, VIEW_CONTROLS_SYNC = DataGrid.prototype.syncSavedViews;
DataGrid.prototype.buildSavedViews = function () {
if (!this.view.reporting) return VIEW_CONTROLS_BUILD.call(this);
const panel = this.controlPanel(this.labels.gridViews, "cx-grid-views").panel;
const choice = this.savedChoice = h("select"), name = h("input"), error = h("p", "cx-grid-control-error"),
defaults = this.viewDefaultStatus = h("p", "cx-grid-view-default"), preference = this.viewPreferenceStatus = h("p", "cx-grid-view-storage");
name.type = "text"; name.maxLength = 100; choice.setAttribute("aria-label", this.labels.gridChooseView);
for (const status of [error, defaults, preference]) status.setAttribute("role", "status");
panel.append(choice, defaults, preference, gridInputLabel(this.labels.gridViewName, name));
const run = action => {
try { Promise.resolve(action()).then(() => this.flushViewSettings()).then(() => setText(error, ""), failure => setText(error, failure.message)); }
catch (failure) { setText(error, failure.message); }
};
panel.appendChild(gridButton(this.labels.gridApply, () => run(() => this.applySavedView(choice.value))));
panel.appendChild(gridButton(this.labels.gridSaveView, () => run(() => this.saveView(name.value))));
panel.appendChild(gridButton(this.labels.gridRenameView, () => run(() => this.renameSavedView(choice.value, name.value))));
panel.appendChild(gridButton(this.labels.gridDefaultView, () => run(() => this.setDefaultView(choice.value))));
panel.appendChild(gridButton(this.labels.gridClearDefaultView, () => run(() => this.setDefaultView(null))));
panel.appendChild(gridButton(this.labels.gridRemoveView, () => run(() => this.removeSavedView(choice.value))));
panel.appendChild(error); choice.addEventListener("change", () => { if (choice.value) name.value = choice.value; });
this.syncSavedViews(); this.setViewPreferenceError(this.viewPreferenceError || "");
};
DataGrid.prototype.syncSavedViews = function () {
VIEW_CONTROLS_SYNC.call(this);
if (!this.view.reporting || !this.savedChoice) return;
for (const option of this.savedChoice.options) if (option.value === this.defaultSavedView)
setText(option, fill(this.labels.gridDefaultViewOption, { name: option.value }));
if (this.viewDefaultStatus) setText(this.viewDefaultStatus, this.defaultSavedView ?
fill(this.labels.gridDefaultViewName, { name: this.defaultSavedView }) : this.labels.gridNoDefaultView);
};
const REPORTING_SELECTION_LIMIT = 10000, SELECTION_BASE = {}, SELECTION_API = GRID_REPORTING.api;
for (const name of ["setSelection", "emit", "copyFocused", "readGridState"]) SELECTION_BASE[name] = DataGrid.prototype[name];
GRID_REPORTING.api = (api, grid) => {
SELECTION_API?.(api, grid);
if (!grid.view.reporting?.selectionControls) return;
for (const name of ["getSelectionDescriptor", "selectAllMatching", "selectPage", "setRowSelected", "selectRange"])
api[name] = grid[name].bind(grid);
const getIds = api.getSelection;
api.getSelection = () => {
if (grid.querySelection) throw new Error("CanopyX: all-matching selection uses getSelectionDescriptor(), not a materialized ID list.");
return getIds();
};
};
Object.assign(DataGrid.prototype, {
readGridState(input) {
const state = SELECTION_BASE.readGridState.call(this, input);
if (this.view.reporting?.selectionControls && state.selection.length > REPORTING_SELECTION_LIMIT)
throw new Error("CanopyX: explicit selection is bounded to 10,000 IDs.");
return state;
},
requireReportingSelection(multiple = false) {
if (this.destroyed || this.pendingQuery || !this.acceptedQuery || !this.view.reporting?.selectionControls ||
this.view.selection === "none" || multiple && !this.multi)
throw new Error("CanopyX: selection needs an accepted reporting query and an enabled selection mode.");
},
getSelectionDescriptor() {
return this.querySelection ? gridFreeze({ ...this.querySelection, excludedIds: [...this.selectionExcluded] }) :
gridFreeze({ kind: "ids", revision: this.snapshot?.revision ?? null, ids: [...this.selected] });
},
setSelection(ids) {
if (this.view.reporting?.selectionControls && Array.isArray(ids) && ids.length > REPORTING_SELECTION_LIMIT)
throw new Error("CanopyX: explicit selection is bounded to 10,000 IDs; use all-matching selection for large results.");
if (!Array.isArray(ids)) return SELECTION_BASE.setSelection.call(this, ids);
ids.forEach(id => requireIdentifier(id, "selection ID"));
if (this.view.selection === "none" && ids.length || !this.multi && new Set(ids).size > 1)
throw new Error("CanopyX: selection exceeds the view's mode.");
this.selectionController?.abort();
this.selectionAnchor = null;
this.querySelection = null; this.selectionExcluded = null;
return SELECTION_BASE.setSelection.call(this, ids);
},
selectAllMatching() {
this.requireReportingSelection(true);
this.selectionController?.abort();
const query = gridQuery(this.view, { ...this.acceptedQuery, offset: 0, cursor: undefined, limit: this.pageSize });
this.querySelection = gridFreeze({ kind: "query", query, revision: this.snapshot.revision, matched: this.snapshot.matched });
this.selectionExcluded = new Set(); this.selected.clear(); this.selectionAnchor = null;
this.publishQuerySelection();
},
publishQuerySelection() {
this.version++; this.scheduleRender(); this.emit("select", { ids: [], selection: this.getSelectionDescriptor() }); this.stateChanged();
},
reportingRowSelected(row) { return this.querySelection ? !this.selectionExcluded.has(row.key) : this.selected.has(row.key); },
setReportingRowSelected(row, selected) {
this.requireReportingSelection();
if (!row || row.status || this.indexOf(row) < 0 || typeof selected !== "boolean")
throw new Error("CanopyX: choose a loaded accepted record and a boolean selection intent.");
this.selectionController?.abort();
if (this.querySelection) {
if (!selected && !this.selectionExcluded.has(row.key) && this.selectionExcluded.size >= REPORTING_SELECTION_LIMIT)
throw new Error("CanopyX: query selection supports at most 10,000 exclusions.");
if (selected) this.selectionExcluded.delete(row.key); else this.selectionExcluded.add(row.key);
this.publishQuerySelection();
} else {
const ids = this.multi || !selected ? new Set(this.selected) : new Set();
if (selected) ids.add(row.key); else ids.delete(row.key); this.setSelection([...ids]);
}
this.selectionAnchor = row._ri;
},
setRowSelected(id, selected) {
requireIdentifier(id, "selection ID");
return this.setReportingRowSelected([...this.rowCache.values()].find(row => row.key === id), selected);
},
emit(name, detail) {
if (this.view.reporting?.selectionControls) {
if (name === "query") {
const key = JSON.stringify([detail.revision, gridResultShape(detail.query)]), previous = this.selectionScopeKey;
if (previous !== undefined && previous !== key) {
this.selectionAnchor = null;
if (this.querySelection || this.selectionRevision !== detail.revision) this.setSelection([]);
}
this.selectionScopeKey = key; this.selectionRevision = detail.revision;
}
if (name === "select") detail = { ...detail, selection: this.getSelectionDescriptor() };
if (name === "select" || name === "query" || name === "error") this.syncSelectionControls?.();
}
return SELECTION_BASE.emit.call(this, name, detail);
},
copyFocused(row, cell) { return this.querySelection ? this.copy({ scope: "selected" }) : SELECTION_BASE.copyFocused.call(this, row, cell); }
});
Object.assign(DataGrid.prototype, {
selectPage(selected = true, options = {}) {
this.requireReportingSelection(true);
if (typeof selected !== "boolean" || options.signal !== undefined && !(options.signal instanceof AbortSignal))
throw new Error("CanopyX: page selection needs a boolean and optional AbortSignal.");
if (!this.paged) throw new Error("CanopyX: page selection requires paged presentation.");
const bounds = this.rowBounds();
return bounds.last < bounds.first ? Promise.resolve(this.getSelectionDescriptor()) :
this.selectRange(bounds.first, bounds.last, { ...options, selected, additive: true });
},
async selectRange(start, end, options = {}) {
this.requireReportingSelection(true);
const first = Math.min(start, end), last = Math.max(start, end), selected = options.selected ?? true, additive = options.additive ?? false;
if (!Number.isInteger(start) || !Number.isInteger(end) || first < 0 || last >= this.rowCount() || last - first + 1 > REPORTING_SELECTION_LIMIT ||
typeof selected !== "boolean" || typeof additive !== "boolean" || options.signal !== undefined && !(options.signal instanceof AbortSignal))
throw new Error("CanopyX: selection ranges need accepted positions and at most 10,000 records.");
if (this.cursor && (first < this.pageOffset || last >= this.cursorWindow.end))
throw new Error("CanopyX: sequential-source selection ranges stay on the accepted page.");
this.selectionController?.abort();
const controller = this.selectionController = new AbortController(), dataSignal = this.dataLifetime.signal, epoch = this.queryEpoch;
const abort = () => controller.abort();
dataSignal.addEventListener("abort", abort, { once: true }); options.signal?.addEventListener("abort", abort, { once: true });
if (options.signal?.aborted) abort();
const query = this.acceptedQuery, snapshot = { ...this.snapshot }, ids = [], seen = new Set(), scope = this.querySelection;
try {
gridOperationActive(this, controller.signal);
if (this.cursor) {
for (let index = first; index <= last; index++) {
const row = this.rowCache.get(index);
if (!row || row.status) throw new Error("CanopyX: the complete accepted cursor page is required for page/range selection.");
ids.push(row.key);
}
} else for (let offset = Math.floor(first / this.pageSize) * this.pageSize; offset <= last; offset += this.pageSize) {
const request = gridQuery(this.view, { ...query, offset, limit: this.pageSize });
const page = validateGridPage(await this.requestPage(request, controller.signal), this.view, request, snapshot);
gridOperationActive(this, controller.signal);
for (const [index, row] of page.items.entries()) {
if (seen.has(row.id)) throw new Error("CanopyX: a selection range repeated a record identity.");
seen.add(row.id);
if (page.offset + index >= first && page.offset + index <= last) ids.push(row.id);
}
}
gridOperationActive(this, controller.signal);
if (epoch !== this.queryEpoch || ids.length !== last - first + 1)
throw new DOMException("Selection range was superseded or incomplete.", "AbortError");
if (scope) {
const excluded = new Set(this.selectionExcluded);
for (const id of ids) if (selected) excluded.delete(id); else excluded.add(id);
if (excluded.size > REPORTING_SELECTION_LIMIT) throw new Error("CanopyX: query selection supports at most 10,000 exclusions.");
this.selectionExcluded = excluded; this.publishQuerySelection();
} else {
const next = additive || !selected ? new Set(this.selected) : new Set();
for (const id of ids) if (selected) next.add(id); else next.delete(id);
this.setSelection([...next]);
}
if (this.selectionAnchor == null) this.selectionAnchor = start;
return this.getSelectionDescriptor();
} finally {
dataSignal.removeEventListener("abort", abort); options.signal?.removeEventListener("abort", abort); controller.abort();
if (this.selectionController === controller) this.selectionController = null;
}
}
});
const SELECTION_EXPORT_PREPARE = DataGrid.prototype.prepareExport, SELECTION_EXPORT_ROWS = DataGrid.prototype.exportRows,
SELECTION_EXPORT_TEXT = DataGrid.prototype.exportText;
DataGrid.prototype.prepareExport = function (options) {
if (options?.scope !== "selected" || !this.querySelection) return SELECTION_EXPORT_PREPARE.call(this, options);
const selection = this.getSelectionDescriptor(), exported = SELECTION_EXPORT_PREPARE.call(this, { ...options, scope: "filtered" });
const request = gridFreeze({ ...exported.request, scope: "selected", query: selection.query,
revision: selection.revision, matched: selection.matched, selection: [], querySelection: selection });
const signal = options.signal;
return Object.freeze({ request, rows: () => this.exportRows(request, signal) });
};
DataGrid.prototype.exportRows = async function* (request, signal) {
if (!request.querySelection) { yield* SELECTION_EXPORT_ROWS.call(this, request, signal); return; }
const excluded = new Set(request.querySelection.excludedIds);
for await (const row of SELECTION_EXPORT_ROWS.call(this, { ...request, scope: "filtered" }, signal))
if (!excluded.delete(row.id)) yield row;
if (excluded.size) throw new Error("CanopyX: excluded records are absent from the accepted query revision.");
};
DataGrid.prototype.exportText = async function (exported, maxRows = 50000, delimiter, signal) {
const selection = exported.request.querySelection;
if (selection && selection.matched !== null && Number.isInteger(maxRows) && maxRows >= 1 && maxRows <= 1000000 &&
selection.matched - selection.excludedIds.length > maxRows)
throw new Error("CanopyX: export exceeds the client row limit; use a host export hook.");
return SELECTION_EXPORT_TEXT.call(this, exported, maxRows, delimiter, signal);
};
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridSelection: "Selection", gridSelectPage: "Select page", gridSelectMatching: "Select all matching",
gridClearSelection: "Clear selection", gridSelectionCount: "{count} selected records",
gridSelectionQueryCount: "{count} matching records selected; {excluded} excluded",
gridSelectionQueryUnknown: "All matching records selected; {excluded} excluded", gridSelectRecord: "Select record {id}"
}));
const SELECTION_CONTROLS_BASE = {};
for (const name of ["buildGridControls", "fillRow", "refreshRowState", "onClick", "onKey", "setQuery"])
SELECTION_CONTROLS_BASE[name] = DataGrid.prototype[name];
Object.assign(DataGrid.prototype, {
buildGridControls() {
SELECTION_CONTROLS_BASE.buildGridControls.call(this);
if (!this.view.reporting?.selectionControls) return;
const controls = h("div", "cx-grid-selection-controls"), status = this.selectionStatus = h("span", "cx-grid-selection-status");
controls.setAttribute("role", "group"); controls.setAttribute("aria-label", this.labels.gridSelection); status.setAttribute("role", "status");
const page = this.multi && this.paged ? gridButton(this.labels.gridSelectPage, () => this.runReportingSelection(() => this.selectPage())) : null;
const all = this.multi ? gridButton(this.labels.gridSelectMatching, () => this.runReportingSelection(() => this.selectAllMatching())) : null;
const clear = gridButton(this.labels.gridClearSelection, () => this.setSelection([]));
this.selectionButtons = [page, all, clear].filter(Boolean);
controls.append(...this.selectionButtons, status); this.toolbar.appendChild(controls); this.syncSelectionControls();
},
syncSelectionControls() {
if (!this.selectionStatus) return;
for (const button of this.selectionButtons) button.disabled = !!this.selectionControlBusy || !this.acceptedQuery || !!this.pendingQuery;
for (const [row, element] of this.rendered) if (!row.status) {
const check = element.querySelector(".cx-grid-row-select");
if (check) { check.checked = this.reportingRowSelected(row); check.disabled = !!this.pendingQuery; }
}
const query = this.querySelection, format = numberFormat(this.lang);
setText(this.selectionStatus, query ? fill(query.matched === null ? this.labels.gridSelectionQueryUnknown : this.labels.gridSelectionQueryCount,
{ count: query.matched === null ? "" : format.format(Math.max(0, query.matched - this.selectionExcluded.size)), excluded: format.format(this.selectionExcluded.size) }) :
fill(this.labels.gridSelectionCount, { count: format.format(this.selected.size) }));
},
runReportingSelection(action) {
this.selectionControlBusy = true; this.syncSelectionControls();
Promise.resolve().then(action).catch(error => {
if (!this.destroyed && error.name !== "AbortError") { this.selectionControlError = error.message; this.emit("error", { error }); }
}).finally(() => {
this.selectionControlBusy = false;
if (!this.destroyed) {
this.syncSelectionControls();
if (this.selectionControlError) { setText(this.selectionStatus, this.selectionControlError); this.selectionControlError = null; }
}
});
},
setQuery(input, paging) {
const pending = SELECTION_CONTROLS_BASE.setQuery.call(this, input, paging);
this.syncSelectionControls(); return pending;
},
refreshRowState(element, row) {
SELECTION_CONTROLS_BASE.refreshRowState.call(this, element, row);
if (this.view.reporting?.selectionControls && !row.status) element.setAttribute("aria-selected", String(this.reportingRowSelected(row)));
},
fillRow(element, row) {
SELECTION_CONTROLS_BASE.fillRow.call(this, element, row);
if (!this.view.reporting?.selectionControls || row.status) return;
const cell = element._cells[0].cell;
let check = cell.querySelector(".cx-grid-row-select");
if (!check) {
check = h("input", "cx-grid-row-select"); check.type = "checkbox"; check.tabIndex = -1; cell.insertBefore(check, cell.firstChild);
check.addEventListener("click", event => {
if (!event.shiftKey) return;
event.preventDefault(); const current = element._w;
this.reportingSelectionIntent(current, !this.reportingRowSelected(current), true, event.ctrlKey || event.metaKey);
});
check.addEventListener("change", () => {
this.reportingSelectionIntent(element._w, check.checked, false, false);
});
check.addEventListener("keydown", event => {
if (event.key === " " && event.shiftKey) {
event.preventDefault(); event.stopPropagation(); const current = element._w;
this.reportingSelectionIntent(current, !this.reportingRowSelected(current), true, event.ctrlKey || event.metaKey);
}
});
}
check.checked = this.reportingRowSelected(row); check.disabled = !!this.pendingQuery;
check.setAttribute("aria-label", fill(this.labels.gridSelectRecord, { id: row.key }));
},
reportingSelectionIntent(row, selected, range, additive) {
this.runReportingSelection(() => range && this.multi && this.selectionAnchor != null ?
this.selectRange(this.selectionAnchor, row._ri, { selected, additive }) : this.setReportingRowSelected(row, selected));
},
onClick(event) {
const element = event.target.closest(".cx-row"), row = element?._w;
if (this.view.reporting?.selectionControls && row && !row.status && !event.defaultPrevented &&
!event.target.closest("a,button,input,select,textarea,[contenteditable]") && (event.shiftKey || this.querySelection && (event.ctrlKey || event.metaKey))) {
this.setFocus(row, true); this.reportingSelectionIntent(row, event.shiftKey || !this.reportingRowSelected(row), event.shiftKey, event.ctrlKey || event.metaKey); return;
}
try { SELECTION_CONTROLS_BASE.onClick.call(this, event); }
catch (error) {
if (!this.view.reporting?.selectionControls) throw error;
this.runReportingSelection(() => { throw error; }); return;
}
if (this.view.reporting?.selectionControls && row && !row.status && !event.defaultPrevented &&
!event.target.closest("a,button,input,select,textarea,[contenteditable]")) this.selectionAnchor = row._ri;
},
onKey(event) {
const element = event.target.closest(".cx-row"), row = element?._w;
if (this.view.reporting?.selectionControls && row && !row.status && event.key === " " && !event.defaultPrevented &&
!event.isComposing && !event.altKey && !event.target.closest("a,button,input,select,textarea,[contenteditable]")) {
event.preventDefault(); this.reportingSelectionIntent(row, !this.reportingRowSelected(row), event.shiftKey, event.ctrlKey || event.metaKey); return;
}
return SELECTION_CONTROLS_BASE.onKey.call(this, event);
}
});
const SUMMARY_VALIDATE = GRID_REPORTING.validate, SUMMARY_COMPARE = GRID_REPORTING.compare, SUMMARY_QUERY = gridQuery;
const SUMMARY_BASE = { requestPage: DataGrid.prototype.requestPage, render: DataGrid.prototype.render };
function reportingSummaryEnabled(view) { return !!view.reporting?.grouping || !!view.reporting?.aggregates?.length; }
function reportingGroupKey(value) { return JSON.stringify([typeof value, value]); }
function reportingGroupAt(summary, index) {
let low = 0, high = summary.groups.length;
while (low < high) { const middle = (low + high) >>> 1; if (summary.groups[middle].offset <= index) low = middle + 1; else high = middle; }
return low ? summary.groups[low - 1] : null;
}
GRID_REPORTING.validate = view => {
SUMMARY_VALIDATE(view);
const grouping = view.reporting.grouping, aggregates = view.reporting.aggregates || [], ids = new Set();
if (reportingSummaryEnabled(view) && view.source.navigation === "cursor") throw new Error("CanopyX: summaries require offset navigation.");
if (grouping !== undefined && (!grouping || typeof grouping !== "object" || Array.isArray(grouping) ||
Object.keys(grouping).some(key => !["column", "direction"].includes(key)) || !["asc", "desc"].includes(grouping.direction) ||
!view.columns.some(column => column.id === grouping.column && column.sortable))) throw new Error("CanopyX: invalid grouping column or order.");
if (!Array.isArray(aggregates) || aggregates.length > 32) throw new Error("CanopyX: at most 32 aggregates are supported.");
for (const aggregate of aggregates) {
if (!aggregate || typeof aggregate !== "object" || Array.isArray(aggregate) ||
Object.keys(aggregate).some(key => !["id", "column", "operation", "label"].includes(key))) throw new Error("CanopyX: invalid aggregate.");
requireIdentifier(aggregate.id, "aggregate ID"); const column = view.columns.find(item => item.id === aggregate.column);
if (!column || ids.has(aggregate.id) || !["count", "sum", "average", "minimum", "maximum"].includes(aggregate.operation) ||
aggregate.operation !== "count" && column.kind !== "number" || typeof aggregate.label !== "string" ||
!aggregate.label.trim() || aggregate.label.length > 512) throw new Error("CanopyX: invalid aggregate binding.");
ids.add(aggregate.id);
}
};
gridQuery = (view, input) => {
const query = SUMMARY_QUERY(view, input), grouping = view.reporting?.grouping;
return !grouping ? query : gridFreeze({ ...query, sort: [grouping, ...query.sort.filter(sort => sort.column !== grouping.column)] });
};
GRID_REPORTING.compare = view => {
const compare = SUMMARY_COMPARE(view), grouping = view.reporting?.grouping;
return !grouping ? compare : (a, b, column, direction) => {
const compared = compare(a, b, column, direction);
if (compared || column.id !== grouping.column) return compared;
const left = gridScalar(a.cells[column.id], column), right = gridScalar(b.cells[column.id], column);
const result = gridOrder(typeof left, typeof right) || gridOrder(String(left), String(right));
return direction === "desc" ? -result : result;
};
};
function reportingSummaryQuery(view, query, revision) { return gridQuery(view, { ...query, offset: 0, limit: view.pageSize, revision }); }
function reportingSummaryValues(view, values, count) {
const declarations = view.reporting.aggregates || [];
if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length !== declarations.length)
throw new Error("CanopyX: summary aggregate bindings differ.");
for (const aggregate of declarations) {
const value = values[aggregate.id];
if (!Object.hasOwn(values, aggregate.id) || value !== null && (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) ||
aggregate.operation === "count" && (!validStructuralCount(value) || value > count) ||
!count && aggregate.operation !== "count" && value !== null) throw new Error("CanopyX: invalid aggregate value.");
}
}
function reportingSummaryResult(view, query, page, summary) {
checkDocument(summary, "gridSummary");
if (Object.keys(summary).some(key => !["protocol", "type", "view", "revision", "query", "matched", "groups", "aggregates"].includes(key)) ||
JSON.stringify(summary).length > 4194304 || summary.view !== view.id || summary.revision !== page.revision || summary.matched !== page.matched ||
!Array.isArray(summary.groups) || summary.groups.length > 10000 || !validStructuralCount(summary.matched + summary.groups.length) || !view.reporting.grouping && summary.groups.length ||
!summary.query || !["protocol", "type", "view", "offset", "limit", "sort", "filters", "search", "revision"].every(key => Object.hasOwn(summary.query, key)) ||
summary.query.type !== "gridQuery" || summary.query.protocol !== PROTOCOL || summary.query.revision !== page.revision || summary.query.offset !== 0 ||
JSON.stringify(gridQuery(view, summary.query)) !== JSON.stringify(query)) throw new Error("CanopyX: summary ownership or counts differ.");
reportingSummaryValues(view, summary.aggregates, summary.matched);
let offset = 0; const keys = new Set(), column = view.columns.find(item => item.id === view.reporting.grouping?.column), values = new Set();
const compare = column ? GRID_REPORTING.compare(view) : null; let previous = null;
for (const group of summary.groups) {
if (!group || !Object.hasOwn(group, "value") || Object.keys(group).some(key => !["key", "value", "offset", "count", "aggregates"].includes(key)) ||
group.value !== null && typeof group.value === "object") throw new Error("CanopyX: groups carry raw values.");
requireIdentifier(group.key, "group key"); const value = gridScalar(group.value, column), key = reportingGroupKey(value);
if (group.key.length > 4096 || keys.has(group.key) || values.has(key) || group.offset !== offset ||
!validStructuralCount(group.count) || !group.count || previous && compare(previous, {cells:{[column.id]:group.value}}, column, view.reporting.grouping.direction) >= 0)
throw new Error("CanopyX: invalid complete group range.");
previous = {cells:{[column.id]:group.value}};
keys.add(group.key); values.add(key); offset += group.count; reportingSummaryValues(view, group.aggregates, group.count);
}
if (view.reporting.grouping && offset !== page.matched) throw new Error("CanopyX: groups omit matching records.");
return gridFreeze(JSON.parse(JSON.stringify(summary)));
}
Object.assign(DataGrid.prototype, {
async requestPage(query, signal) {
const page = await SUMMARY_BASE.requestPage.call(this, query, signal);
if (!reportingSummaryEnabled(this.view) || signal !== this.dataLifetime.signal) return page;
validateGridPage(page, this.view, query);
const request = reportingSummaryQuery(this.view, query, page.revision), key = JSON.stringify(request);
if (this.summaryCandidate?.key !== key) {
const hook = this.source.summary || (this.view.source.kind === "inline" ? request => reportingInlineSummary(this.view, request) : null);
if (!hook) throw new Error("CanopyX: hosted summaries need an explicit source summary hook.");
const summary = await this.runGridHook(signal => hook.call(this.source, request, { signal }), signal);
gridOperationActive(this, signal);
this.summaryCandidate = { key, result: reportingSummaryResult(this.view, request, page, summary) };
}
if (this.summaryCandidate.result.matched !== page.matched) throw new Error("CanopyX: a page differs from its complete-query summary count.");
if (this.view.reporting.grouping) {
const column = this.view.columns.find(column => column.id === this.view.reporting.grouping.column);
for (let i = 0; i < page.items.length; i++) {
const group = reportingGroupAt(this.summaryCandidate.result, page.offset + i);
if (!group || reportingGroupKey(gridScalar(page.items[i].cells[column.id], column)) !== reportingGroupKey(gridScalar(group.value, column)))
throw new Error("CanopyX: a page record differs from its complete-query group.");
}
}
return page;
},
render() {
if (this.acceptedQuery && reportingSummaryEnabled(this.view)) {
const key = JSON.stringify(reportingSummaryQuery(this.view, this.acceptedQuery, this.snapshot.revision));
if (this.summaryCandidate?.key === key && this.summary !== this.summaryCandidate.result) {
this.summary = this.summaryCandidate.result; this.groupProjectionKey = null;
}
this.prepareGroupProjection?.(); this.syncSummaryControls?.();
}
return SUMMARY_BASE.render.call(this);
}
});
function reportingAggregateValues(view, rows, first = 0, last = rows.length) {
const values = Object.create(null);
for (const aggregate of view.reporting.aggregates || []) {
const column = view.columns.find(item => item.id === aggregate.column);
let count = 0, sum = 0, correction = 0, minimum = Infinity, maximum = -Infinity;
for (let i = first; i < last; i++) {
const value = gridScalar(rows[i].cells[column.id], column);
if (value === null) continue;
count++;
if (aggregate.operation !== "count") {
const next = value - correction, total = sum + next;
correction = total - sum - next; sum = total;
minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
}
}
values[aggregate.id] = aggregate.operation === "count" ? count : !count ? null :
aggregate.operation === "sum" ? sum : aggregate.operation === "average" ? sum / count : aggregate.operation === "minimum" ? minimum : maximum;
}
return values;
}
function reportingInlineSummary(view, query) {
const columns = new Map(view.columns.map(column => [column.id, column]));
const rows = gridQueryRows(view, query, columns, GRID_REPORTING.compare(view)), groups = [], grouping = view.reporting.grouping;
if (grouping) {
const column = columns.get(grouping.column);
for (let offset = 0; offset < rows.length;) {
const value = cellValue(rows[offset].cells[column.id]) ?? null, scalar = gridScalar(value, column), key = reportingGroupKey(scalar);
let end = offset + 1;
while (end < rows.length && reportingGroupKey(gridScalar(rows[end].cells[column.id], column)) === key) end++;
groups.push({ key, value, offset, count: end - offset, aggregates: reportingAggregateValues(view, rows, offset, end) });
if (groups.length > 10000 || key.length > 4096) throw new Error("CanopyX: inline grouping exceeds its metadata bounds.");
offset = end;
}
}
return { protocol: PROTOCOL, type: "gridSummary", view: view.id, revision: query.revision, query,
matched: rows.length, groups, aggregates: reportingAggregateValues(view, rows) };
}
const GROUP_TRIM = DataGrid.prototype.trimInactiveCache;
Object.assign(DataGrid.prototype, {
renderPass() { return ROW_VIEWPORT.renderPass.call(this, this.rowProjection || this); },
trimInactiveCache() {
if (this.rowProjection) this.window = this.rowProjection.recordWindow(this.window.first, this.window.last);
return GROUP_TRIM.call(this);
},
prepareGroupProjection() {
if (!this.view.reporting.grouping || !this.summary) return;
this.collapsedGroups ||= new Set();
const bounds = this.rowBounds(), key = [this.summary, bounds.first, bounds.last, this.groupCollapseVersion || 0];
if (this.groupProjectionKey?.every((value, i) => value === key[i])) return;
const segments = [], recordSegments = []; let count = 0;
for (let i = 0; i < this.summary.groups.length; i++) {
const group = this.summary.groups[i], first = Math.max(bounds.first, group.offset), last = Math.min(bounds.last, group.offset + group.count - 1);
if (first > last) continue;
const header = { _ri: -i - 1, hpx: this.rowH, h: { cells: {} }, status: "group", group };
const length = 1 + (this.collapsedGroups.has(group.key) ? 0 : last - first + 1);
const segment = { start: count, length, header, first, last };
segments.push(segment); recordSegments.push(segment); count += length;
}
const find = (list, index, field) => {
let low = 0, high = list.length;
while (low < high) { const middle = (low + high) >>> 1; if (list[middle][field] <= index) low = middle + 1; else high = middle; }
return low ? list[low - 1] : null;
};
const projection = {
rowCount: () => count,
rowAt: top => Math.max(0, Math.min(count - 1, Math.floor(top / this.rowH))),
rowTop: index => index * this.rowH,
rowItem: index => {
const segment = find(segments, index, "start");
return !segment || index >= segment.start + segment.length ? null : index === segment.start ? segment.header : this.rowItem(segment.first + index - segment.start - 1);
},
indexOf: row => {
if (!row) return -1;
if (row.group) { const segment = segments.find(item => item.header.group.key === row.group.key); return segment?.start ?? -1; }
const segment = find(recordSegments, row._ri, "first");
return !segment || row._ri > segment.last || segment.length === 1 || this.indexOf(row) < 0 ? -1 : segment.start + 1 + row._ri - segment.first;
},
recordWindow: (first, last) => {
const ranges = [];
for (const segment of segments) {
const start = Math.max(first, segment.start + 1), end = Math.min(last, segment.start + segment.length - 1);
if (start <= end) ranges.push({ first: segment.first + start - segment.start - 1, last: segment.first + end - segment.start - 1 });
}
return { first: ranges[0]?.first ?? bounds.first, last: ranges.at(-1)?.last ?? -1, ranges };
}
};
const focus = this.focused;
if (focus) {
const segment = focus.group ? segments.find(item => item.header.group.key === focus.group.key) : find(recordSegments, focus._ri, "first");
if (segment && (focus.group || segment.length === 1)) this.focused = segment.header;
}
this.rowProjection = projection; this.groupProjectionKey = key;
this.total = count * this.rowH; this.syncScrollRange(this.logicalTop()); this.grid.setAttribute("aria-rowcount", String(count + 1));
},
setGroupCollapsed(key, collapsed) {
if (this.destroyed || this.pendingQuery || !this.summary || !this.view.reporting.grouping || typeof collapsed !== "boolean" ||
!this.summary.groups.some(group => group.key === key)) throw new Error("CanopyX: choose an accepted group and a boolean collapse intent.");
this.collapsedGroups ||= new Set();
const ownedFocus = this.canvas.contains(document.activeElement);
if (collapsed && !this.collapsedGroups.has(key) && this.collapsedGroups.size >= 10000) throw new Error("CanopyX: at most 10,000 collapsed group keys are supported.");
if (collapsed) this.collapsedGroups.add(key); else this.collapsedGroups.delete(key);
this.groupCollapseVersion = (this.groupCollapseVersion || 0) + 1; this.version++; this.render();
if (ownedFocus && this.focused?.group) this.rendered.get(this.focused)?.focus({ preventScroll: true });
this.emit("group", { key, collapsed });
this.noteViewPreferenceIntent?.();
this.stateChanged();
}
});
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridGroupHeading: "{column}: {value} ({count} records)", gridGroupMissing: "Missing value",
gridGroupExpand: "Expand group", gridGroupCollapse: "Collapse group", gridSummary: "Query totals",
gridGroupOrder: "Group order is fixed by this report"
}));
const GROUP_BASE = {}, GROUP_API = GRID_REPORTING.api;
for (const name of ["buildGridControls", "buildHeader", "fillRow", "setFocus", "onKey", "setQuery"]) GROUP_BASE[name] = DataGrid.prototype[name];
GRID_REPORTING.api = (api, grid) => {
GROUP_API?.(api, grid);
if (reportingSummaryEnabled(grid.view)) api.getSummary = () => grid.summary || null;
if (grid.view.reporting?.grouping) {
api.setGroupCollapsed = grid.setGroupCollapsed.bind(grid);
api.getCollapsedGroups = () => [...(grid.collapsedGroups || [])];
}
};
Object.assign(DataGrid.prototype, {
buildHeader() {
GROUP_BASE.buildHeader.call(this);
const column = this.view.reporting?.grouping?.column;
const header = this.headCells.find(cell => cell.getAttribute("data-cx-column") === column), button = header?.querySelector(".cx-sort");
if (button) { button.disabled = true; button.title = this.labels.gridGroupOrder; }
},
buildGridControls() {
GROUP_BASE.buildGridControls.call(this);
if (!reportingSummaryEnabled(this.view)) return;
this.summaryControls = h("div", "cx-grid-summary"); this.summaryControls.setAttribute("role", "status");
this.summaryControls.setAttribute("aria-label", this.labels.gridSummary); this.toolbar.appendChild(this.summaryControls);
},
syncSummaryControls() {
if (!this.summaryControls || !this.summary) return;
setText(this.summaryControls, (this.view.reporting.aggregates || []).map(aggregate =>
aggregate.label + ": " + formatValue(this.summary.aggregates[aggregate.id], "number", this.fmt)).join(" · "));
},
fillRow(element, row) {
if (!row.group) { element.removeAttribute("data-cx-group"); return GROUP_BASE.fillRow.call(this, element, row); }
element.textContent = ""; element._w = row; element._kind = "group"; element._layout = this.layout;
element._attrs = {}; element._cls = null; element.className = "cx-row cx-grid-group";
element.setAttribute("role", "row"); element.removeAttribute("data-cx-id"); element.removeAttribute("data-cx-status");
element.removeAttribute("aria-selected"); element.removeAttribute("aria-busy"); element.dataset.cxGroup = row.group.key;
element.style.height = this.rowH + "px"; element.style.width = this.rowWidth + "px";
const cell = this.cell(element, 0, this.rowWidth), button = h("button", "cx-grid-group-toggle");
cell.setAttribute("aria-colspan", String(this.cols.length));
button.type = "button"; button.tabIndex = -1; const collapsed = this.collapsedGroups.has(row.group.key);
button.disabled = !!this.pendingQuery;
button.setAttribute("aria-expanded", String(!collapsed));
button.setAttribute("aria-label", collapsed ? this.labels.gridGroupExpand : this.labels.gridGroupCollapse); setText(button, collapsed ? "▸" : "▾");
button.addEventListener("click", () => { if (!this.pendingQuery) { this.setFocus(row, false); this.setGroupCollapsed(row.group.key, !this.collapsedGroups.has(row.group.key)); this.setFocus(this.focused, true); } });
const column = this.columns.find(item => item.id === this.view.reporting.grouping.column);
const label = fill(this.labels.gridGroupHeading, { column: column.title, value: row.group.value === null ? this.labels.gridGroupMissing : formatValue(row.group.value, column.kind, this.fmt), count: numberFormat(this.lang).format(row.group.count) });
const text = h("span", "cx-grid-group-text"); setText(text, label); cell.append(button, text);
const aggregates = (this.view.reporting.aggregates || []).map(item => item.label + ": " + formatValue(row.group.aggregates[item.id], "number", this.fmt)).join(" · ");
cell.title = label + (aggregates ? " — " + aggregates : "");
if (aggregates) { const summary = h("span", "cx-grid-group-aggregates"); setText(summary, aggregates); cell.appendChild(summary); }
element._cells = [{ cell, content: cell }];
},
setQuery(input, paging) {
const pending = GROUP_BASE.setQuery.call(this, input, paging);
const sync = () => { if (!this.destroyed) for (const button of this.canvas.querySelectorAll(".cx-grid-group-toggle")) button.disabled = !!this.pendingQuery; };
sync(); pending.then(sync, sync); return pending;
},
setFocus(row, focus) {
if (!this.rowProjection) return GROUP_BASE.setFocus.call(this, row, focus);
if (row && !row.group && !this.pendingQuery) {
const group = this.summary?.groups.find(group => row._ri >= group.offset && row._ri < group.offset + group.count);
if (group && this.collapsedGroups?.has(group.key)) this.setGroupCollapsed(group.key, false);
}
const index = this.rowProjection.indexOf(row); if (index < 0 || this.destroyed) return;
this.pendingNavigation = null; this.focused = row;
const top = index * this.rowH, height = this.grid.clientHeight - this.head.offsetHeight;
if (top < this.logicalTop()) this.setLogicalTop(top);
else if (top + this.rowH > this.logicalTop() + height) this.setLogicalTop(top + this.rowH - height);
this.render(); if (focus) this.rendered.get(this.focused)?.focus({ preventScroll: true });
},
onKey(event) {
const row = event.target.closest(".cx-row")?._w;
if (!row || !this.rowProjection || event.defaultPrevented || event.isComposing || event.altKey || event.target.matches(OWN_ARROWS))
return GROUP_BASE.onKey.call(this, event);
const navigation = this.pendingNavigation;
if (navigation?.focus && navigation.epoch === this.queryEpoch && this.focused === row)
return GROUP_BASE.onKey.call(this, event);
if (this.pendingQuery && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
event.preventDefault(); return;
}
if (row.group && ["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
if (event.target.closest("button") && ["Enter", " "].includes(event.key)) return;
event.preventDefault();
if (this.pendingQuery) return;
this.setGroupCollapsed(row.group.key, event.key === "ArrowLeft" ? true : event.key === "ArrowRight" ? false : !this.collapsedGroups.has(row.group.key));
this.setFocus(this.focused, true); return;
}
if (row.group && ["Home", "End"].includes(event.key)) {
event.preventDefault(); event.stopPropagation();
if (event.ctrlKey || event.metaKey) this.focusResult(event.key === "Home" ? 0 : this.rowCount() - 1, true)
.catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
else this.setFocus(row, true);
return;
}
if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)) return GROUP_BASE.onKey.call(this, event);
const step = event.key.startsWith("Page") ? Math.max(1, Math.floor((this.grid.clientHeight - this.head.offsetHeight) / this.rowH)) : 1;
const direction = /Up$/.test(event.key) ? -1 : 1, proposed = this.rowProjection.indexOf(row) + direction * step;
const cells = this.rowCells(this.rendered.get(row)), column = cells.findIndex(cell => cell.contains(event.target));
event.preventDefault(); event.stopPropagation();
if (this.paged && (proposed < 0 || proposed >= this.rowProjection.rowCount())) {
const bounds = this.rowBounds();
if (row.group && (direction < 0 && bounds.first === 0 || direction > 0 && bounds.last === this.rowCount() - 1)) {
this.setFocus(this.rowProjection.rowItem(Math.max(0, Math.min(this.rowProjection.rowCount() - 1, proposed))), true); return;
}
const ordinal = row.group ? (direction < 0 ? bounds.first - step : bounds.last + step) : row._ri + direction * step;
this.focusResult(Math.max(0, Math.min(this.rowCount() - 1, ordinal)), true, column, null)
.catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
return;
}
const index = Math.max(0, Math.min(this.rowProjection.rowCount() - 1, proposed)), target = this.rowProjection.rowItem(index);
if (target?.group) this.setFocus(target, true);
else if (target) this.focusResult(target._ri, true, column, null).catch(error => { if (error.name !== "AbortError") this.emit("error", { error }); });
}
});
const GROUP_STATE_BASE = {};
for (const name of ["getState", "readGridState", "applyStatePresentation", "getShareState"]) GROUP_STATE_BASE[name] = DataGrid.prototype[name];
Object.assign(DataGrid.prototype, {
getState() {
const state = GROUP_STATE_BASE.getState.call(this);
if (this.view.reporting?.grouping) state.collapsedGroups = [...(this.collapsedGroups || [])];
return state;
},
readGridState(input) {
const state = GROUP_STATE_BASE.readGridState.call(this, input), groups = input.collapsedGroups === undefined ? [] : input.collapsedGroups;
if (!Array.isArray(groups) || groups.length > 10000 || groups.some(key => typeof key !== "string" || !key.length || key.length > 4096))
throw new Error("CanopyX: invalid bounded group collapse state.");
groups.forEach(key => requireIdentifier(key, "group key"));
if (this.view.reporting?.grouping) state.collapsedGroups = [...new Set(groups)];
return state;
},
applyStatePresentation(state) {
if (this.view.reporting?.grouping) {
this.collapsedGroups = new Set(state.collapsedGroups || []); this.groupCollapseVersion = (this.groupCollapseVersion || 0) + 1;
}
return GROUP_STATE_BASE.applyStatePresentation.call(this, state);
},
getShareState() { const { collapsedGroups, ...state } = GROUP_STATE_BASE.getShareState.call(this); return gridFreeze(state); }
});
const DELIVERY_PREPARE = DataGrid.prototype.prepareExport, DELIVERY_TEXT = DataGrid.prototype.exportText,
DELIVERY_API = GRID_REPORTING.api, DELIVERY_CALLBACKS = new WeakMap();
function reportingExportTotal(request) {
if (request.querySelection) return request.querySelection.matched === null ? null : request.querySelection.matched - request.querySelection.excludedIds.length;
return request.scope === "selected" ? request.selection.length : request.scope === "all" ? request.total : request.matched;
}
function reportingFileName(value) {
if (typeof value !== "string" || !value || value.length > 100 || value !== value.trim() ||
/[\\/:*?"<>|\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(value) ||
/^\.|[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))
throw new Error("CanopyX: export file name must be a safe basename of at most 100 characters.");
requireIdentifier(value, "export file name"); return value;
}
function reportingExportProgress(grid, request, callback, signal) {
const total = reportingExportTotal(request); let completed = 0, phase = "reading";
const order = { reading: 0, generating: 1, ready: 2 };
return (next, count = completed) => {
if (grid.destroyed || signal?.aborted) return;
if (!Object.hasOwn(order, next) || order[next] < order[phase] || !Number.isSafeInteger(count) || count < completed ||
total !== null && count > total) throw new Error("CanopyX: invalid export progress.");
completed = count; phase = next;
callback?.(Object.freeze({ phase, completed, total })); return completed;
};
}
async function reportingExportSnapshot(grid, exported, maxRows, signal, progress) {
if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 10000) throw new Error("CanopyX: print snapshots support 1 to 10000 records.");
const total = reportingExportTotal(exported.request);
if (total !== null && total > maxRows) throw new Error("CanopyX: snapshot exceeds its row bound; use a host export hook.");
const rows = []; let size = JSON.stringify({ request: exported.request, rows: [] }).length;
if (size > 4194304) throw new Error("CanopyX: snapshot exceeds its text bound; use a host export hook.");
progress("reading", 0);
for await (const row of grid.exportRows(exported.request, signal)) {
if (rows.length >= maxRows || (size += JSON.stringify(row).length + 1) > 4194304)
throw new Error("CanopyX: snapshot exceeds its row or text bound; use a host export hook.");
rows.push(row); if (rows.length % 100 === 0) progress("reading", rows.length);
}
gridOperationActive(grid, signal); progress("generating", rows.length);
return gridFreeze({ request: exported.request, rows });
}
GRID_REPORTING.api = (api, grid) => {
DELIVERY_API?.(api, grid);
api.materializeExport = grid.materializeExport.bind(grid);
api.print = grid.print.bind(grid);
};
Object.assign(DataGrid.prototype, {
prepareExport(options) {
if (options?.onProgress !== undefined && typeof options.onProgress !== "function") throw new Error("CanopyX: export progress needs a callback.");
const exported = DELIVERY_PREPARE.call(this, options);
let locale = this.lang;
if (options.locale !== undefined) {
if (typeof options.locale !== "string" || options.locale.length > 128)
throw new Error("CanopyX: export locale must be supported by this browser.");
try {
locale = Intl.getCanonicalLocales(options.locale)[0];
if (!Intl.NumberFormat.supportedLocalesOf(locale).length) throw new Error();
} catch { throw new Error("CanopyX: export locale must be supported by this browser."); }
}
if (options.timeZone !== undefined && !["utc", "local"].includes(options.timeZone)) throw new Error("CanopyX: export time zone is utc or local.");
const fileName = reportingFileName(options.fileName ?? ("canopyx-" + this.view.id.replace(/[^a-z0-9_-]/gi, "_")).slice(0, 100));
const request = gridFreeze({ ...exported.request, locale, fileName, timeZone: options.timeZone || exported.request.timeZone }), grid = this,
signal = options.signal, callback = options.onProgress;
const result = Object.freeze({ request, rows: async function* () {
const progress = reportingExportProgress(grid, request, callback, signal); let count = 0;
progress("reading", 0);
for await (const row of grid.exportRows(request, signal)) { yield row; if (++count % 100 === 0) progress("reading", count); }
progress("generating", count);
} });
DELIVERY_CALLBACKS.set(result, callback); return result;
},
async exportText(exported, maxRows, delimiter, signal) {
let count = 0;
const rows = async function* () { for await (const row of exported.rows()) { count++; yield row; } };
const text = await DELIVERY_TEXT.call(this, { request: exported.request, rows }, maxRows, delimiter, signal);
reportingExportProgress(this, exported.request, DELIVERY_CALLBACKS.get(exported), signal)("ready", count); return text;
},
materializeExport(options) {
const exported = this.prepareExport(options), maxRows = options.maxRows ?? 1000, callback = DELIVERY_CALLBACKS.get(exported);
return this.runGridHook(async signal => {
const progress = reportingExportProgress(this, exported.request, callback, signal);
const result = await reportingExportSnapshot(this, exported, maxRows, signal, progress);
progress("ready", result.rows.length); return result;
}, options.signal);
},
print(options) {
const exported = this.prepareExport(options), maxRows = options.maxRows ?? 1000, callback = DELIVERY_CALLBACKS.get(exported);
if (typeof this.opts.onPrint !== "function") throw new Error("CanopyX: printing needs an onPrint host hook.");
return this.runGridHook(async signal => {
const progress = reportingExportProgress(this, exported.request, callback, signal);
const snapshot = await reportingExportSnapshot(this, exported, maxRows, signal, progress);
await this.opts.onPrint({ snapshot, signal }); gridOperationActive(this, signal); progress("ready", snapshot.rows.length);
}, options.signal);
},
exportToHost(format, options) {
const exported = this.prepareExport(options), { request } = exported, callback = DELIVERY_CALLBACKS.get(exported);
if (typeof format !== "string" || !format.trim() || typeof this.opts.onExport !== "function") throw new Error("CanopyX: host export needs a format and an onExport hook.");
return this.runGridHook(async signal => {
const progress = reportingExportProgress(this, request, callback, signal); progress("reading", 0);
let completed = 0;
await this.opts.onExport({ format, request, signal, reportProgress: (phase, count) => { completed = progress(phase, count); } });
gridOperationActive(this, signal); progress("ready", reportingExportTotal(request) ?? completed);
}, options.signal);
}
});
DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
gridExportProgress: "{completed} of {total} records", gridExportReading: "{completed} records",
gridExportCancelled: "Export cancelled", gridCancelExport: "Cancel export", gridPrint: "Print report"
}));
const DELIVERY_CONTROLS = DataGrid.prototype.buildExportControls;
DataGrid.prototype.buildExportControls = function () {
DELIVERY_CONTROLS.call(this);
if (!this.view.reporting) return;
const panel = this.toolbar.querySelector(".cx-grid-export .cx-grid-panel");
panel.replaceChildren();
const scope = h("select"); scope.setAttribute("aria-label", this.labels.gridExport);
for (const [value, label] of [["filtered", "gridFilteredResults"], ["selected", "gridSelectedRows"], ["all", "gridAllResults"]])
scope.appendChild(gridOption(value, this.labels[label]));
const status = h("p", "cx-grid-delivery-status"); status.setAttribute("role", "status");
const meter = h("progress"); meter.setAttribute("aria-label", this.labels.gridExport); meter.hidden = true;
let operation = null;
const cancel = gridButton(this.labels.gridCancelExport, () => operation?.abort()); cancel.hidden = true;
const progress = value => {
if (this.destroyed || !operation || operation.signal.aborted) return;
setText(status, fill(value.total === null ? this.labels.gridExportReading : this.labels.gridExportProgress,
{ completed: numberFormat(this.lang).format(value.completed), total: value.total === null ? "" : numberFormat(this.lang).format(value.total) }));
if (value.total === null) meter.removeAttribute("value");
else { meter.max = Math.max(1, value.total); meter.value = value.completed; }
};
const run = action => {
if (operation) return;
const controller = operation = new AbortController();
scope.disabled = true; buttons.forEach(button => button.disabled = true);
cancel.hidden = false; meter.hidden = false; meter.removeAttribute("value"); setText(status, this.labels.loading);
const options = { scope: scope.value, signal: controller.signal, onProgress: progress };
Promise.resolve().then(() => action(options)).then(() => { if (!this.destroyed) setText(status, ""); }, error => {
if (!this.destroyed) setText(status, error.name === "AbortError" ? this.labels.gridExportCancelled : error.message);
if (error.name !== "AbortError") this.emit("error", { error });
}).finally(() => {
if (operation === controller) operation = null;
if (!this.destroyed) {
const returnFocus = document.activeElement === cancel;
scope.disabled = false; buttons.forEach(button => button.disabled = false); cancel.hidden = true; meter.hidden = true;
if (returnFocus) scope.focus();
}
});
};
const csv = gridButton(this.labels.gridDownloadCsv, () => run(async options => {
const exported = this.prepareExport(options), fileName = exported.request.fileName;
const text = await this.exportText(exported, 50000, ",", options.signal); gridOperationActive(this, options.signal);
const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
try {
const link = h("a"); link.href = url; link.download = fileName + ".csv";
document.body.appendChild(link); link.click(); link.remove();
} finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}));
const copy = gridButton(this.labels.gridCopy, () => run(options => this.copy(options))), buttons = [csv, copy];
if (typeof this.opts.onPrint === "function") buttons.push(gridButton(this.labels.gridPrint, () => run(options => this.print(options))));
panel.append(scope, ...buttons, cancel, meter, status);
};
function createTreeGrid(host, options) {
if (!host || !options || !options.view) {
throw new Error("CanopyX: createTreeGrid needs a host element and a view document.");
}
const existing = activeGrids.get(host);
if (existing) return existing;
const grid = new TreeGrid(host, options);
const api = Object.freeze(Object.assign({
element: host,
view: grid.view,
ready: grid.ready,
expandPath: (ids, o) => grid.expandPath(ids, o),
setFilter: (filter, o) => { if (!grid.queryAware) grid.clearDeclaredFilters(); grid.setFilter(filter, o); },
setFilterActive: (id, active) => grid.setFilterActive(id, active),
setActiveFilters: (ids) => grid.setActiveFilters(ids),
updateActiveFilters: (change) => grid.updateActiveFilters(change),
getActiveFilters: () => Array.from(grid.activeFilters),
sort: (columnId, direction) => grid.sort(columnId, direction),
getQuery: () => grid.getQuery(),
setQuery: (query, options) => grid.setQuery(query, options),
setColumnVisible: (columnId, visible) => grid.setColumnVisible(columnId, visible),
setColumnWidth: (columnId, width) => grid.setColumnWidth(columnId, width),
setTreeColumnPinned: (pinned) => grid.setTreeColumnPinned(pinned),
setTimeZone: (zone) => grid.setTimeZone(zone),
getTimeZone: () => (grid.local ? "local" : "utc"),
refresh: () => { grid.version++; grid.scheduleRender(); },
reload: (id, options) => grid.reload(id, options),
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
getState: () => grid.getState(),
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
}, grid.interactionApi && grid.interactionApi()));
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
const create = view && view.type === "grid" && typeof createDataGrid === "function" ? createDataGrid : createTreeGrid;
const api = create(host, Object.assign({}, view && configured.get(view.id), { view: view }));
created.push(api);
api.ready.catch((err) => {
if (view.type !== "grid" && activeGrids.get(host) === api && host.canopyx === api) showError(host, err, api, view);
});
} catch (err) {
showError(host, err, null, view);
}
});
return created;
}
global.CanopyX = Object.freeze(Object.assign({
protocol: PROTOCOL,
createTreeGrid: createTreeGrid,
configure: configure,
unconfigure: unconfigure,
mount: (root) => mount(root, false),
sources: Object.freeze({ inline: inlineSource, sidecar: sidecarSource, remote: remoteSource }),
badge: hostBadge,
labels: DEFAULT_LABELS
}, typeof createDataGrid === "function" ? { createDataGrid: createDataGrid } : {}));
const navigation = global.performance && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : null;
if (document.readyState === "loading" || (document.readyState === "interactive" && navigation && navigation.domContentLoadedEventStart === 0)) {
document.addEventListener("DOMContentLoaded", () => mount(document, true));
} else {
mount(document, true);
}
})(typeof window !== "undefined" ? window : this);

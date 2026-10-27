// Rewrites the fixed --cx-size-* aliases in runtime CSS into the shared --hfx-* roles, keeping every value the same at the
// default theme: exact roles where a value matches one, and multiples of a role where it does not. Layout dimensions
// (viewport units, wide panel widths, ch and em boxes) stay literal behind the lint's layout allowance.
// Usage: node Build/Migrate-SizeRoles.mjs <part folder>...   (for example CanopyX.Html/Assets/canopyx.source)
// Temporary: remove it once no part uses a --cx-size-* alias.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TYPE = { 12: "caption", 13: "small", 14: "body", 15: "heading", 20: "title", 28: "display" };
const SPACE = { 2: "0-5", 4: "1", 6: "1-5", 8: "2", 12: "3", 16: "4", 24: "5", 32: "6" };
const ICON = { 14: "sm", 16: "md", 20: "lg" };
const RADIUS = { 4: "sm", 6: "md", 10: "lg", 999: "pill" };
const round = value => Number(value.toFixed(4)).toString().replace(/^0\./, ".").replace(/^-0\./, "-.");

/** The CSS value an alias name stands for: 13d5px is 13.5px, neg-2px is -2px, d8em is .8em. */
function aliasValue(name) {
  const match = /^(neg-)?(\d*)(?:d(\d+))?([a-z%]+)$/.exec(name);
  if (!match) throw new Error("Unknown size alias --cx-size-" + name);
  const number = Number((match[2] || "0") + (match[3] ? "." + match[3] : ""));
  return { number: match[1] ? -number : number, unit: match[4] };
}

/** The role expression for one value in one property, or null to keep it literal as layout. */
export function roleFor(property, name) {
  const { number, unit } = aliasValue(name);
  const literal = (number < 0 ? "-" : "") + round(Math.abs(number)) + unit;
  if (unit !== "px") return { value: literal, layout: !/^font-size$|^letter-spacing$/.test(property) && unit !== "em" };
  const sign = number < 0 ? -1 : 1, size = Math.abs(number);
  const times = (role, factor) => factor * sign === 1 ? "var(" + role + ")" : "calc(var(" + role + ")*" + round(factor * sign) + ")";
  if (/^font(-size)?$/.test(property)) {
    if (TYPE[size] && sign === 1) return { value: "var(--hfx-type-" + TYPE[size] + "-size)" };
    const base = size <= 12.5 ? 12 : size <= 13.5 ? 13 : size <= 14.5 ? 14 : size <= 17.5 ? 15 : size <= 24 ? 20 : 28;
    return { value: times("--hfx-type-" + TYPE[base] + "-size", size / base) };
  }
  if (/radius/.test(property)) return RADIUS[size] && sign === 1 ? { value: "var(--hfx-radius-" + RADIUS[size] + ")" } : { value: times("--hfx-radius-sm", size / 4) };
  if (/^(border|outline)/.test(property)) return { value: times("--hfx-border-width", size) };
  if (/^(width|height|min-width|min-height|max-width|max-height|inline-size|block-size)$/.test(property) && size > 64) return { value: literal, layout: true };
  if (ICON[size] && sign === 1 && /^(width|height)$/.test(property) && /icon/.test(arguments[2] || "")) return { value: "var(--hfx-icon-" + ICON[size] + ")" };
  if (SPACE[size]) return { value: times("--hfx-space-" + SPACE[size], 1) };
  if (size === 1) return { value: times("--hfx-border-width", 1) };
  return { value: times("--hfx-space-1", size / 4) };
}

/** Rewrites one stylesheet; returns the new text and how many aliases it replaced. */
export function migrate(css) {
  let replaced = 0;
  const out = css.replace(/([^{};]*?\{)|([\w-]+)(\s*:\s*)([^;{}]*)/g, (whole, open, property, colon, value, offset) => {
    if (open || !property || !value.includes("--cx-size-")) return whole;
    if (property.startsWith("--cx-size-")) return whole;
    const selector = css.slice(css.lastIndexOf("{", offset) > css.lastIndexOf("}", offset) ? css.lastIndexOf("}", offset) + 1 : offset, offset);
    let layout = false;
    const next = value.replace(/var\(--cx-size-([a-z0-9-]+)\)/g, (_, name) => {
      const role = roleFor(property, name, selector + " " + property);
      replaced++;
      if (role.layout) layout = true;
      return role.value;
    });
    return property + colon + next + (layout ? "/* lint-allow layout: viewport or panel dimension */" : "");
  });
  // Layout allowances go on their own line above the declaration: whole-line comments do not ship in the runtime.
  const lines = [];
  for (let line of out.split("\n")) {
    const notes = [...line.matchAll(/\/\* lint-allow layout: ([^*]+)\*\//g)].map(match => match[1].trim());
    if (notes.length && line.replace(/\/\*[^*]*\*\//g, "").trim()) {
      lines.push(/^\s*/.exec(line)[0] + "/* lint-allow layout: " + [...new Set(notes)].join("; ") + " */");
      line = line.replace(/\/\* lint-allow layout: [^*]+\*\//g, "");
    }
    lines.push(line);
  }
  return { css: lines.join("\n"), replaced };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const folder of process.argv.slice(2)) {
    for (const file of fs.readdirSync(folder).filter(name => name.endsWith(".css")).map(name => path.join(folder, name))) {
      const { css, replaced } = migrate(fs.readFileSync(file, "utf8"));
      if (replaced) { fs.writeFileSync(file, css); console.log(file + ": " + replaced); }
    }
  }
}

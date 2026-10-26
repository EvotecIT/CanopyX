// Enforces semantic design roles in maintained runtime CSS. Existing debt may shrink, never grow.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(root, "Build/design-token-lint.baseline.json");
const shared = JSON.parse(fs.readFileSync(path.join(root, "Build/design-token-lint.rules.json"), "utf8"));
const properties = Object.fromEntries(shared.rules.map(rule => [rule.id, new RegExp(rule.properties, "i")]));
const compile = pattern => new RegExp(pattern.replace("(?i)", ""), "ig");
const length = compile(shared.length);
const allowed = /^(?:0|auto|none|normal|inherit|initial|unset|revert|revert-layer|transparent|currentcolor|solid|dashed|dotted|double|hidden|inset|outset|thin|medium|thick)$/i;
const system = new RegExp("\\b(?:" + shared.systemColors.join("|") + ")\\b", "gi");
const vendor = /--(?:tblr|bs|dt|apex)[a-z]*-/gi;
const rolesPath = path.join(root, "api/canopyx-roles.txt");
const colours = new RegExp(shared.hexColor.replace("(?i)", "") + "|" + shared.colorFunctions.replace("(?i)", "") + "|\\b(?:" + shared.namedColors.join("|") + ")\\b", "gi");

/** Returns literal violations with stable declaration identities, independent of line numbers. */
export function violations(css) {
  const found = [];
  const blocks = [];
  // Preserve declaration offsets so line comments can document a genuine layout exception.
  css = css.replace(/\/\* hfx-token-fallbacks:begin \*\/[\s\S]*?\/\* hfx-token-fallbacks:end \*\//g, match => " ".repeat(match.length));
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, match => " ".repeat(match.length));
  let start = 0;
  for (let index = 0; index < clean.length; index++) {
    if (clean[index] === "{") {
      blocks.push(clean.slice(start, index).trim()); start = index + 1;
    } else if (clean[index] === "}") {
      blocks.pop(); start = index + 1;
    } else if (clean[index] === ";") {
      const declaration = clean.slice(start, index).trim(), colon = declaration.indexOf(":");
      if (colon > 0) {
        const property = declaration.slice(0, colon).trim();
        // A --cx-size-NN alias is the fixed length it names, not a role: 13d5px is 13.5px, neg-2px is -2px, d8em is .8em.
        const value = declaration.slice(colon + 1).trim().replace(/var\(\s*--cx-size-(neg-)?(\d*)(?:d(\d+))?([a-z%]+)\s*\)/gi,
          (_, negative, whole, fraction, unit) => (negative ? "-" : "") + (whole || "0") + (fraction ? "." + fraction : "") + unit);
        const forced = blocks.some(block => /@media\s*\(forced-colors\s*:\s*active\)/i.test(block));
        const lineEnd = css.indexOf("\n", index), lineStart = css.lastIndexOf("\n", start) + 1;
        // The allowance sits on the declaration's line or alone on the line above it (whole-line comments do not ship).
        const previousStart = css.lastIndexOf("\n", Math.max(lineStart - 2, 0)) + 1;
        const allowance = /\/\*\s*lint-allow layout:\s*[^*]+\*\//;
        const layout = allowance.test(css.slice(lineStart, lineEnd < 0 ? css.length : lineEnd)) ||
          lineStart > 0 && /^\s*\/\*\s*lint-allow layout:\s*[^*]+\*\/\s*$/.test(css.slice(previousStart, lineStart - 1));
        const add = kind => found.push({ kind, declaration: declaration.replace(/\s+/g, " ") });
        // Functions with variable inputs are roles; literal colour functions remain forbidden.
        const withoutVars = value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, "TOKEN");
        if (colours.test(withoutVars) || !forced && system.test(withoutVars)) add("colour");
        colours.lastIndex = system.lastIndex = 0;
        if (property.startsWith("--")) {
          // A custom property holding a bare length is a fixed size wearing a variable's name; roles come from --hfx-*.
          if (!layout && !/var\(/.test(value) && length.test(value)) add("alias");
          length.lastIndex = 0;
          start = index + 1; continue;
        }
        const residual = withoutVars.replace(/TOKEN|!important/g, "").replace(/calc\([^)]*\)/g, "").trim();
        const literals = residual.split(/[\s,]+/).filter(Boolean).filter(word => !allowed.test(word));
        const hasLength = length.test(withoutVars); length.lastIndex = 0;
        if (properties.radius.test(property) && (hasLength || literals.some(word => word !== "50%"))) add("radius");
        // Relative font sizes (em, %) follow the role-based size they sit in, so only fixed ones are findings.
        const relative = word => /^(?:font-size|font)$/.test(property) && /^-?(?:\d*\.)?\d+(?:em|%)$/.test(word);
        if (properties.type.test(property) && literals.some(word => !relative(word) && (property !== "line-height" || word !== "1"))) add("type");
        if (properties.spacing.test(property) && hasLength) add("spacing");
        if (properties.border.test(property) && hasLength) add("border");
        if (properties.shadow.test(property) && literals.length) add("shadow");
        if (property === "z-index" && /^-?\d+$/.test(value)) add("z-index");
        if (!layout && properties.size.test(property) && hasLength && !/^(?:min|max|clamp)\(.*(?:ch|%|fr)/.test(withoutVars)) add("size");
        if (/var\(\s*--[^,()]+,\s*(?:#[0-9a-f]|[\d.]+(?:px|rem|em)|(?:rgb|hsl)\()/i.test(value)) add("fallback");
        // Vendor framework variables (Tabler, Bootstrap, DataTables, ApexCharts) never reach CanopyX; hosts map them to roles.
        if (vendor.test(value)) add("vendor");
        vendor.lastIndex = 0;
      }
      start = index + 1;
    }
  }
  return found;
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : entry.name.endsWith(".css") && path.basename(directory).endsWith(".source") ? [full] : [];
  });
}

export function scan() {
  const entries = {};
  for (const file of sourceFiles(path.join(root, "CanopyX.Html/Assets")).sort()) {
    for (const finding of violations(fs.readFileSync(file, "utf8"))) {
      const key = path.relative(root, file).replaceAll("\\", "/") + " | " + finding.kind + " | " + finding.declaration;
      entries[key] = (entries[key] || 0) + 1;
    }
  }
  return entries;
}

/** The shared design roles the runtime reads: the contract a host defines to theme CanopyX. */
export function roles() {
  const found = new Set();
  for (const file of sourceFiles(path.join(root, "CanopyX.Html/Assets")))
    for (const match of fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/var\(\s*(--hfx-[a-z0-9-]+)/gi)) found.add(match[1]);
  return [...found].sort();
}

/** Runtime scripts that read vendor framework variables, which CanopyX never does. */
function vendorScripts() {
  const scripts = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? scripts(full) : entry.name.endsWith(".js") && path.basename(directory).endsWith(".source") ? [full] : [];
  });
  return scripts(path.join(root, "CanopyX.Html/Assets")).filter(file => { vendor.lastIndex = 0; return vendor.test(fs.readFileSync(file, "utf8")); })
    .map(file => path.relative(root, file).replaceAll("\\", "/") + " | vendor | script reads a vendor variable");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const current = scan();
  if (process.argv.includes("--baseline")) {
    if (fs.existsSync(baselinePath)) throw new Error("A baseline exists; shrink it instead of replacing it.");
    fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n");
  } else {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const failures = Object.keys(current).filter(key => current[key] > (baseline[key] || 0)).concat(vendorScripts());
    // The role list is versioned with the API (docs/versioning.md): CANOPYX_API_UPDATE=1 accepts an intended change.
    const listed = roles().join("\n") + "\n";
    if (process.env.CANOPYX_API_UPDATE === "1") fs.writeFileSync(rolesPath, listed);
    else if (!fs.existsSync(rolesPath) || fs.readFileSync(rolesPath, "utf8").replace(/\r\n/g, "\n") !== listed) {
      const known = new Set(fs.existsSync(rolesPath) ? fs.readFileSync(rolesPath, "utf8").split(/\r?\n/).filter(Boolean) : []), now = new Set(roles());
      for (const role of now) if (!known.has(role)) failures.push("api/canopyx-roles.txt | + " + role);
      for (const role of known) if (!now.has(role)) failures.push("api/canopyx-roles.txt | - " + role);
      failures.push("The design roles the runtime reads changed without an updated api/canopyx-roles.txt; set CANOPYX_API_UPDATE=1 if intended (docs/versioning.md).");
    }
    for (const key of failures) console.error(key);
    if (failures.length) process.exitCode = 1;
    else console.log(`Design-token lint passed (${Object.values(current).reduce((a, b) => a + b, 0)} existing declarations).`);
    if (process.argv.includes("--shrink") && !failures.length) fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n");
  }
}

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { repo } from "./support.mjs";

// Match the library writer's normalized text when computing content-hashed filenames.
export const readAsset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8").replace(/\r\n/g, "\n");
export const assetHash = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
const manifest = new Map(JSON.parse(readAsset("canopyx-parts.json")).parts.map(part => [part.name, part]));

/** Required parts, in dependency order, using the metadata shipped with the runtime. */
export function requiredParts(...names) {
  const parts = new Map();
  const add = name => {
    if (parts.has(name)) return;
    const part = manifest.get(name);
    if (!part) throw new Error("Unknown fixture part: " + name);
    for (const dependency of part.requires || []) add(dependency);
    parts.set(name, part);
  };
  names.forEach(add);
  return [...parts.values()];
}

/** Plain/hashed files and the style and script elements (CanopyHtmlPart.Markup) of only the requested parts and their requirements. */
export function partFixture(...names) {
  const files = new Map(), payloads = [];
  for (const part of requiredParts(...names)) {
    for (const [file, tag, contentType] of [[part.style, "style", "text/css"], [part.script, "script", "text/javascript"]]) {
      if (!file) continue;
      const body = readAsset(file), asset = { body, contentType };
      files.set(file, asset);
      files.set(file.replace(/\.(js|css)$/, "." + assetHash(body) + ".$1"), asset);
      payloads.push("<" + tag + ' data-canopyx-part="' + part.name + '" data-cx-version="' + part.version + '"' + (tag === "style" ? ' media="not all"' : "") + ">" + body + "</" + tag + ">");
    }
  }
  return { files, payloads: payloads.join("") };
}

/** Finish finite entry motion before taking a geometry baseline; native press invariants remain exact. */
export async function waitForEntryMotion(locator) {
  await locator.evaluate(element => Promise.all(element.getAnimations()
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => {}))));
}

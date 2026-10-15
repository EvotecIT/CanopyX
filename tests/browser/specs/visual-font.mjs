// A pinned test font for the visual-regression baselines: every element renders in the bundled Inter subset, so a
// screenshot does not depend on the fonts a machine has installed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const font = fs.readFileSync(path.join(here, "../fonts/Inter-latin.woff2")).toString("base64");

/**
 * Installs the test font before any page script runs. The font is parsed from bytes rather than fetched, and the
 * override is an adopted stylesheet, so both are in place before CanopyX mounts on DOMContentLoaded and measures its
 * columns. window.__canopyxTestFont records whether the face had loaded by then.
 */
export async function pinTestFont(page) {
  await page.addInitScript(base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const face = new FontFace("CanopyX Test Sans", bytes.buffer, { weight: "100 900", style: "normal" });
    document.fonts.add(face);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("*,*::before,*::after{font-family:'CanopyX Test Sans' !important;font-synthesis:none !important;}");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    window.__canopyxTestFont = { face, atMount: face.status };
    // Registered before the runtime's own listener, so this sees the state CanopyX measures with.
    document.addEventListener("DOMContentLoaded", () => { window.__canopyxTestFont.atMount = face.status; }, { capture: true, once: true });
  }, font);
}

/** Resolves once the test font is ready, and reports whether it was ready before the views mounted. */
export function testFontState(page) {
  return page.evaluate(async () => {
    const state = window.__canopyxTestFont;
    await state.face.loaded;
    await document.fonts.ready;
    return { atMount: state.atMount, now: state.face.status };
  });
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { violations } from "../../../Build/Lint-DesignTokens.mjs";

test("literal colours, geometry and typography fail while semantic roles pass", () => {
  assert.deepEqual(violations(".x{color:var(--hfx-color-text);background:color-mix(in srgb,var(--hfx-color-accent) 20%,transparent);border-radius:var(--hfx-radius-overlay);padding:0 var(--hfx-space-2);}"), []);
  for (const value of ["#fff", "rgb(22,24,28)", "oklch(.5 .1 20)", "white", "CanvasText"]) {
    assert.ok(violations(`.x{color:${value};}`).some(item => item.kind === "colour"), value);
    assert.ok(violations(`.x{--private-colour:${value};}`).some(item => item.kind === "colour"), "custom property " + value);
  }
  for (const [declaration, kind] of [["border-radius:8px", "radius"], ["font-family:Arial", "type"], ["font-weight:600", "type"],
    ["padding:8px", "spacing"], ["border:1px solid currentColor", "border"], ["box-shadow:0 2px 4px currentColor", "shadow"],
    ["z-index:20", "z-index"], ["height:34px", "size"], ["color:var(--hfx-color-text,#000)", "fallback"]]) {
    assert.ok(violations(`.x{${declaration};}`).some(item => item.kind === kind), declaration);
  }
});

test("system colours are scoped to forced-colours media and generated fallback blocks are excluded", () => {
  assert.deepEqual(violations("@media (forced-colors:active){.x{color:CanvasText;background:Canvas;}}"), []);
  assert.deepEqual(violations("/* hfx-token-fallbacks:begin */.x{color:#fff;}/* hfx-token-fallbacks:end */"), []);
  assert.ok(violations(".x{color:CanvasText;}").length);
});

test("vendor framework variables fail in declarations and in custom-property aliases", () => {
  for (const declaration of ["color:var(--tblr-body-color)", "--cx-row-h:var(--bs-height)", "--cx-tone:var(--dt-row-selected)"])
    assert.ok(violations(`.x{${declaration};}`).some(item => item.kind === "vendor"), declaration);
});

test("a documented layout exception permits dimensions without exempting colours", () => {
  assert.deepEqual(violations(".x{width:320px;/* lint-allow layout: bounded inspector width */}"), []);
  assert.ok(violations(".x{color:#fff;/* lint-allow layout: bounded inspector width */}").some(item => item.kind === "colour"));
});

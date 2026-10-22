// Task-only diagnostic branch. Production assets are byte-identical to PR95 diagnostic head6d519298.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { repo, nextFrames } from "./support.mjs";
import { instrumentMatrixPaint, matrixPixelSample } from "./matrix-paint-diagnostics.mjs";

for (const mode of ["palette-only", "resets-only", "context-state"]) {
test("native matrix first paint and primitive canvas diagnostics · " + mode, async ({ page }, testInfo) => {
  const consoleMessages = [], pageErrors = [];
  page.on("console", message => consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", error => pageErrors.push({ message: error.message, stack: error.stack }));
  await page.addInitScript(mode => {
    const operations = window.__canvasOperations = [], ids = new WeakMap(); let sequence = 0;
    if (mode === "palette-only") return;
    const id = canvas => { if (!ids.has(canvas)) ids.set(canvas, ++sequence); return ids.get(canvas); };
    const record = (context, method, args) => {
      if (!context.canvas.classList.contains("cx-mx-canvas")) return;
      const transform = typeof context.getTransform === "function" ? context.getTransform() : {};
      operations.push({ at: performance.now(), id: id(context.canvas), method,
        args: args.map(value => value instanceof HTMLCanvasElement ? { canvas: id(value), width: value.width, height: value.height } : typeof value === "number" || typeof value === "string" ? value : String(value)),
        width: context.canvas.width, height: context.canvas.height, fill: context.fillStyle, stroke: context.strokeStyle,
        alpha: context.globalAlpha, composite: context.globalCompositeOperation,
        transform: [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f] });
    };
    for (const method of ["setTransform", "clearRect", "fillRect", "drawImage", "stroke", "fill", "fillText", "reset"]) {
      if (mode !== "context-state") continue;
      const original = CanvasRenderingContext2D.prototype[method]; if (typeof original !== "function") continue;
      CanvasRenderingContext2D.prototype[method] = function (...args) { record(this, method, args); return Reflect.apply(original, this, args); };
    }
    for (const property of ["width", "height"]) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
      if (!descriptor?.configurable || !descriptor.set) continue;
      Object.defineProperty(HTMLCanvasElement.prototype, property, { ...descriptor, set(value) {
        if (this.classList.contains("cx-mx-canvas")) operations.push({ at: performance.now(), id: id(this), method: "set-" + property,
          value, width: this.width, height: this.height, stack: new Error().stack });
        return Reflect.apply(descriptor.set, this, [value]);
      } });
    }
  }, mode);
  const assets = process.env.CANOPYX_DIAGNOSTIC_ASSETS || path.join(repo, "CanopyX.Html/Assets");
  const asset = name => fs.readFileSync(path.join(assets, name), "utf8");
  const fixture = fs.readFileSync(path.join(repo, "tests/fixtures/matrix-small.json"), "utf8");
  let runtime = instrumentMatrixPaint(asset("canopyx-matrix.js"));
  const invoke = "try { return Reflect.apply(original, this, args); }";
  if (!runtime.includes(invoke)) throw new Error("Missing task diagnostic wrapper");
  runtime = runtime.replace(invoke, `try {
    const result = Reflect.apply(original, this, args);
    global.__matrixView = this;
    if (method === "looks") paintDiagnostic.palette = [...result].map(([key,look]) => ({ key, ink:look.ink, fill:look.fill, font:look.font, symbol:look.symbol, forced:look.forced }));
    return result;
  }`);
  const html = '<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    asset("canopyx-grid.css") + asset("canopyx-matrix.css") + '</style><script>' + asset("canopyx-grid.js") + runtime +
    ';window.matrixPixelSample=' + matrixPixelSample.toString() + '</script></head><body style="margin:0;padding:16px"><div style="width:1200px;max-width:100%"><div id=host style="height:520px"></div></div><script>window.api=CanopyX.createMatrix(document.querySelector("#host"),{view:' + fixture + '});</script></body></html>';
  await page.route("http://canopyx.test/matrix", route => route.fulfill({ contentType: "text/html", body: html }));
  let failure;
  try {
    await page.goto("http://canopyx.test/matrix"); await page.evaluate(() => api.ready); await nextFrames(page);
    const grid = page.getByRole("grid", { name: "Small matrix" });
    await expect(grid).toHaveAttribute("aria-rowcount", "8");
    await expect(grid).toHaveAttribute("aria-colcount", "6");
    expect(await page.locator(".cx-mx-rowhead").allTextContents()).toContain("Row C");
    expect(await page.evaluate(() => { api.focusCell("c", "x"); return document.activeElement.getAttribute("aria-label"); })).toBe("Row C and Col X: Failing, 3");
    expect(await page.evaluate(() => { api.focusCell("c", "y"); return document.activeElement.getAttribute("aria-label"); })).toBe("Row C and Col Y: No data");
    await expect(page.locator(".cx-mx-key svg")).toHaveCount(3);
    await expect.poll(() => page.evaluate(() => {
      const row = [...document.querySelectorAll(".cx-mx-row")].find(n => n.querySelector(".cx-mx-rowhead").textContent === "Row C"), canvas = row.querySelector("canvas");
      const box = canvas.getBoundingClientRect(), head = document.querySelector('.cx-mx-hcell[aria-colindex="2"]').getBoundingClientRect(), ratio = canvas.width / box.width;
      const point = { x: Math.round((head.left-box.left+3)*ratio), y: Math.round(3*ratio) }, pixel = [...canvas.getContext("2d").getImageData(point.x,point.y,1,1).data];
      __matrixPaintDiagnostic.samples.push(matrixPixelSample(canvas,point,pixel)); return pixel[3];
    })).toBeGreaterThan(0);
  } catch (error) { failure = error; }
  await page.screenshot({ path:testInfo.outputPath("native-matrix-before-probes.png") });
  const evidence = await page.evaluate(() => {
    const diagnostic = JSON.parse(JSON.stringify(__matrixPaintDiagnostic)), operations = __canvasOperations.slice();
    const canvases = [...document.querySelectorAll(".cx-mx-canvas")].map(canvas => {
      const context = canvas.getContext("2d"), sample = matrixPixelSample(canvas,null,null);
      const before = [...context.getImageData(0,0,canvas.width,canvas.height).data].filter((_,i) => i%4===3).filter(Boolean).length;
      const transform = typeof context.getTransform === "function" ? context.getTransform() : {};
      const state = { alpha:context.globalAlpha, composite:context.globalCompositeOperation, fill:context.fillStyle,
        transform:[transform.a,transform.b,transform.c,transform.d,transform.e,transform.f] };
      const afterStateRead = [...context.getImageData(3,3,1,1).data];
      context.fillStyle = "#ff0000"; context.fillRect(3,3,1,1);
      const manual = [...context.getImageData(3,3,1,1).data];
      if (typeof context.reset === "function") context.reset(); else canvas.width = canvas.width;
      context.fillStyle = "#ff0000"; context.fillRect(3,3,1,1);
      return { sample, nonzero:before, state, afterStateRead, manual, afterReset:[...context.getImageData(3,3,1,1).data] };
    });
    const primitives = [];
    for (const options of [undefined, { willReadFrequently:true }]) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 4; document.body.appendChild(canvas);
      const context = canvas.getContext("2d",options);
      for (const color of ["#ff0000", ...diagnostic.palette.map(item => item.fill).filter(Boolean)]) {
        context.clearRect(0,0,4,4); context.fillStyle = "#102f59"; context.fillStyle = color; const accepted = context.fillStyle;
        context.fillRect(0,0,4,4); primitives.push({ options: options || "default", color, accepted, pixel: [...context.getImageData(1,1,1,1).data] });
      }
      canvas.remove();
    }
    const view = __matrixView;
    view.lookCache = null; view.render();
    const repaint = [...view.rowsMounted.values()].map(row => { const canvas=row.querySelector("canvas"); return { row: row.querySelector(".cx-mx-rowhead").textContent,
      pixel: canvas ? [...canvas.getContext("2d").getImageData(3,3,1,1).data] : null }; });
    return { diagnostic, operations, canvases, primitives, repaint, repaintPalette:__matrixPaintDiagnostic.palette,
      forcedColors: matchMedia("(forced-colors:active)").matches, fonts:document.fonts.status, userAgent:navigator.userAgent };
  });
  const body = Buffer.from(JSON.stringify({ mode,consoleMessages,pageErrors,evidence },null,2));
  fs.writeFileSync(testInfo.outputPath("native-canvas-evidence.json"),body);
  await testInfo.attach("native-canvas-evidence", { contentType:"application/json", body });
  await page.screenshot({ path:testInfo.outputPath("native-matrix.png") });
  if (failure) throw failure;
});
}

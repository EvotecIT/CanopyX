// Product-specific evidence for the opt-in native matrix paint job; ordinary tests install no instrumentation.
import fs from "node:fs";

export async function startMatrixPaintDiagnostics(page, mode) {
  const errors = [], consoleMessages = [];
  page.on("pageerror", error => errors.push(error.stack || error.message));
  page.on("console", message => { if (["warning", "error"].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() }); });
  await page.addInitScript(mode => {
    const evidence = window.__matrixPaintEvidence = { mode, events: [], calls: [] };
    const record = value => { if (evidence.calls.length < 1200) evidence.calls.push(value); };
    for (const type of ["contextlost", "contextrestored"]) document.addEventListener(type, event => {
      evidence.events.push({ type, at: performance.now(), canvas: event.target.className });
    }, true);
    document.addEventListener("DOMContentLoaded", () => {
      evidence.events.push({ type: "DOMContentLoaded", at: performance.now(), fonts: document.fonts.status });
      document.fonts.ready.then(() => evidence.events.push({ type: "fontsReady", at: performance.now() }));
    }, { once: true });
    // A separate instrumented phase complements the passive reproduction without changing its draw-loop timing.
    if (mode !== "calls") return;
    for (const name of ["setTransform", "clearRect", "fillRect", "drawImage", "stroke", "fill", "fillText"]) {
      const original = CanvasRenderingContext2D.prototype[name];
      if (typeof original !== "function") { record({ missing: name }); continue; }
      CanvasRenderingContext2D.prototype[name] = function (...args) {
        const call = { name, at: performance.now(), canvas: this.canvas.className, size: [this.canvas.width, this.canvas.height],
          args: args.map(value => typeof value === "object" ? value?.constructor?.name : value),
          fill: this.fillStyle, stroke: this.strokeStyle, alpha: this.globalAlpha, composite: this.globalCompositeOperation };
        record(call);
        try { return original.apply(this, args); }
        catch (error) { call.error = error.stack || error.message; throw error; }
      };
    }
  }, mode);
  return async testInfo => {
    const snapshot = await page.evaluate(() => {
      const box = element => element?.getBoundingClientRect().toJSON();
      const read = canvas => {
        const ctx = canvas.getContext("2d"), result = { size: [canvas.width, canvas.height], box: box(canvas),
          style: canvas.getAttribute("style"), drawn: canvas._drawn, connected: canvas.isConnected };
        if (!ctx) return { ...result, error: "2d context unavailable" };
        const transform = ctx.getTransform();
        Object.assign(result, { contextLost: ctx.isContextLost?.() ?? "API unavailable", attributes: ctx.getContextAttributes?.(),
          transform: [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
          alpha: ctx.globalAlpha, composite: ctx.globalCompositeOperation, fill: ctx.fillStyle, stroke: ctx.strokeStyle, font: ctx.font });
        try {
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let painted = 0;
          for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset]) painted++;
          result.paintedPixels = painted;
          result.topLeftCell = [...ctx.getImageData(3, 3, 1, 1).data];
        } catch (error) { result.readError = error.stack || error.message; }
        return result;
      };
      const root = document.querySelector(".cx-matrix"), styles = [];
      if (root) {
        const probe = document.createElement("span"); probe.style.display = "none"; root.appendChild(probe);
        for (const cls of ["cx-mx-cell cx-mx-attn cx-tone-danger", "cx-mx-cell cx-tone-success", "cx-mx-gridline"]) {
          probe.className = cls;
          const style = getComputedStyle(probe);
          styles.push({ cls, color: style.color, fill: style.backgroundColor, font: style.font, display: style.display });
        }
        probe.remove();
      }
      const featureProbe = {};
      try {
        const source = document.createElement("canvas"), target = document.createElement("canvas");
        source.width = source.height = target.width = target.height = 16;
        const src = source.getContext("2d"), dst = target.getContext("2d");
        src.setTransform(1, 0, 0, 1, 0, 0); src.fillStyle = "#ff0000"; src.fillRect(0, 0, 16, 16);
        featureProbe.fill = [...src.getImageData(3, 3, 1, 1).data];
        src.stroke(new Path2D("M2 2L14 14"));
        dst.drawImage(source, 0, 0);
        featureProbe.sprite = [...dst.getImageData(3, 3, 1, 1).data];
        featureProbe.path2D = typeof Path2D;
      } catch (error) { featureProbe.error = error.stack || error.message; }
      return { ...window.__matrixPaintEvidence, userAgent: navigator.userAgent, dpr: devicePixelRatio,
        readyState: document.readyState, fonts: document.fonts.status, viewport: [innerWidth, innerHeight],
        host: { box: box(document.querySelector("#host")), style: document.querySelector("#host")?.getAttribute("style"),
          theme: document.querySelector("#host")?.getAttribute("data-cx-theme") },
        styles, featureProbe, rows: [...document.querySelectorAll(".cx-mx-row")].map(row => ({
          label: row.querySelector(".cx-mx-rowhead")?.textContent, box: box(row),
          tiles: [...row.querySelectorAll("canvas")].map(read)
        })) };
    }).catch(error => ({ captureError: error.stack || error.message }));
    const path = testInfo.outputPath("matrix-paint.json");
    fs.writeFileSync(path, JSON.stringify({ test: testInfo.title, status: testInfo.status, workerIndex: testInfo.workerIndex, repeatEachIndex: testInfo.repeatEachIndex, browserVersion: page.context().browser()?.version(), browserContexts: page.context().browser()?.contexts().length, errors, consoleMessages, snapshot }, null, 2));
    await testInfo.attach("matrix-paint", { path, contentType: "application/json" });
    if (!page.isClosed()) {
      const screenshot = testInfo.outputPath("matrix-painted-cells.png");
      await page.screenshot({ path: screenshot });
      await testInfo.attach("matrix-painted-cells", { path: screenshot, contentType: "image/png" });
    }
  };
}

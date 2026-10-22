// Test-loaded instrumentation only: the shipped assets and the draw methods' results/errors stay unchanged.
export function instrumentMatrixPaint(runtime) {
  const matches = [...runtime.matchAll(/function matrixCreate\(host,\s*options\)\s*\{/g)];
  if (matches.length !== 1) throw new Error("Matrix diagnostics could not locate the test hook.");
  const marker = matches[0][0];
  return runtime.replace(marker, `
    const paintDiagnostic = global.__matrixPaintDiagnostic = { calls: {}, thrown: [], samples: [] };
    for (const method of ["render", "drawRow", "drawTile", "looks", "sprite"]) {
      const original = MatrixView.prototype[method];
      if (typeof original !== "function") throw new Error("Missing matrix diagnostic method: " + method);
      MatrixView.prototype[method] = function (...args) {
        paintDiagnostic.calls[method] = (paintDiagnostic.calls[method] || 0) + 1;
        try { return Reflect.apply(original, this, args); }
        catch (error) { paintDiagnostic.thrown.push({ method, name: error.name, message: error.message, stack: error.stack }); throw error; }
      };
    }
    ${marker}`);
}

// Snapshot inside the pixel assertion, before a later observer/theme change can erase the failing state.
export function matrixPixelSample(canvas, point, pixel) {
  const context = canvas.getContext("2d"), style = getComputedStyle(canvas), box = canvas.getBoundingClientRect();
  return {
    at: performance.now(), point, pixel, devicePixelRatio, fonts: document.fonts.status,
    canvas: { css: { width: style.width, height: style.height, display: style.display, visibility: style.visibility },
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      attributes: { width: canvas.getAttribute("width"), height: canvas.getAttribute("height") },
      width: canvas.width, height: canvas.height, connected: canvas.isConnected },
    features: Object.fromEntries(["roundRect", "reset", "letterSpacing", "fontKerning", "filter", "setTransform", "drawImage", "getImageData"]
      .map(name => [name, { present: name in context, type: typeof context[name] }])
      .concat([["OffscreenCanvas", typeof OffscreenCanvas !== "undefined"], ["Path2D", typeof Path2D !== "undefined"]])),
    contextLost: typeof context.isContextLost === "function" ? context.isContextLost() : null
  };
}

export async function withMatrixPaintDiagnostics(page, testInfo, run) {
  const consoleMessages = [], pageErrors = [];
  const consoleMessage = message => consoleMessages.push({ type: message.type(), text: message.text(), location: message.location() });
  const pageError = error => pageErrors.push({ name: error.name, message: error.message, stack: error.stack });
  page.on("console", consoleMessage); page.on("pageerror", pageError);
  try { await run(); }
  catch (error) {
    let paint;
    try {
      paint = await page.evaluate(() => ({ diagnostic: window.__matrixPaintDiagnostic,
        devicePixelRatio, fonts: document.fonts.status, userAgent: navigator.userAgent,
        canvases: [...document.querySelectorAll(".cx-mx-canvas")].map(canvas => ({
          row: canvas.closest(".cx-mx-row")?.querySelector(".cx-mx-rowhead")?.textContent,
          ...window.matrixPixelSample(canvas, null, null)
        })) }));
    } catch (captureError) { paint = { captureError: String(captureError) }; }
    await testInfo.attach("matrix-paint-diagnostics", { contentType: "application/json",
      body: Buffer.from(JSON.stringify({ consoleMessages, pageErrors, paint }, null, 2)) });
    throw error;
  } finally { page.off("console", consoleMessage); page.off("pageerror", pageError); }
}

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
        try {
          const result = Reflect.apply(original, this, args);
          global.__matrixView = this;
          if (method === "looks") {
            const palette = [...result].map(([key,look]) => ({ key,ink:look.ink,fill:look.fill,font:look.font,symbol:look.symbol,forced:look.forced }));
            paintDiagnostic.initialPalette ||= palette; paintDiagnostic.palette = palette;
          }
          return result;
        }
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
  await page.addInitScript(() => {
    window.__matrixContextEvents = [];
    for (const name of ["contextlost", "contextrestored", "webglcontextlost", "webglcontextrestored"])
      document.addEventListener(name, event => window.__matrixContextEvents.push({ name,at:performance.now(),
        width:event.target.width,height:event.target.height,connected:event.target.isConnected }), true);
  });
  try { await run(); }
  catch (error) {
    let paint;
    try {
      paint = await page.evaluate(inspectMatrixCanvasFailure);
    } catch (captureError) { paint = { captureError: String(captureError) }; }
    await testInfo.attach("matrix-paint-diagnostics", { contentType: "application/json",
      body: Buffer.from(JSON.stringify({ consoleMessages, pageErrors, paint }, null, 2)) });
    throw error;
  } finally { page.off("console", consoleMessage); page.off("pageerror", pageError); }
}

// Executed only after the original assertion fails; none of these probes precedes production painting.
export function inspectMatrixCanvasFailure() {
  const diagnostic = JSON.parse(JSON.stringify(window.__matrixPaintDiagnostic));
  const canvases = [...document.querySelectorAll(".cx-mx-canvas")].map(canvas => {
    const context = canvas.getContext("2d"), sample = window.matrixPixelSample(canvas,null,null);
    const nonzero = [...context.getImageData(0,0,canvas.width,canvas.height).data].filter((_,i)=>i%4===3).filter(Boolean).length;
    const transform = typeof context.getTransform === "function" ? context.getTransform() : {};
    const state = { fill:context.fillStyle,stroke:context.strokeStyle,alpha:context.globalAlpha,composite:context.globalCompositeOperation,
      transform:[transform.a,transform.b,transform.c,transform.d,transform.e,transform.f] };
    const afterStateRead = [...context.getImageData(3,3,1,1).data];
    context.fillStyle = "#ff0000"; context.fillRect(3,3,1,1);
    const manual = [...context.getImageData(3,3,1,1).data];
    if (typeof context.reset === "function") context.reset(); else canvas.width = canvas.width;
    context.fillStyle = "#ff0000"; context.fillRect(3,3,1,1);
    return { row:canvas.closest(".cx-mx-row")?.querySelector(".cx-mx-rowhead")?.textContent,
      sample,nonzero,state,afterStateRead,manual,afterReset:[...context.getImageData(3,3,1,1).data] };
  });
  const primitives = [];
  for (const options of [undefined,{willReadFrequently:true}]) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 4; document.body.appendChild(canvas);
    const context = canvas.getContext("2d",options);
    for (const color of ["#ff0000",...(diagnostic.palette||[]).map(item=>item.fill).filter(Boolean)]) {
      context.clearRect(0,0,4,4); context.fillStyle = "#102f59"; context.fillStyle = color;
      const accepted = context.fillStyle; context.fillRect(0,0,4,4);
      primitives.push({options:options||"default",color,accepted,pixel:[...context.getImageData(1,1,1,1).data]});
    }
    canvas.remove();
  }
  let offscreen = null;
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(4,4), context = canvas.getContext("2d");
    if (context) { context.fillStyle = "#ff0000"; context.fillRect(0,0,4,4); offscreen = [...context.getImageData(1,1,1,1).data]; }
  }
  const view = window.__matrixView;
  if (view) { view.lookCache = null; view.render(); }
  const repaint = [...document.querySelectorAll(".cx-mx-canvas")].map(canvas=>({
    row:canvas.closest(".cx-mx-row")?.querySelector(".cx-mx-rowhead")?.textContent,
    pixel:[...canvas.getContext("2d").getImageData(3,3,1,1).data]
  }));
  return {diagnostic,canvases,primitives,offscreen,repaint,repaintPalette:window.__matrixPaintDiagnostic?.palette,
    contextEvents:window.__matrixContextEvents,forcedColors:matchMedia("(forced-colors:active)").matches,
    devicePixelRatio,fonts:document.fonts.status,userAgent:navigator.userAgent};
}

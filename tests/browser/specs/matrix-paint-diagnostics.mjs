// Test-loaded instrumentation only: the shipped assets and the draw methods' results/errors stay unchanged.
export function instrumentMatrixPaint(runtime) {
  const matches = [...runtime.matchAll(/function matrixCreate\(host,\s*options\)\s*\{/g)];
  if (matches.length !== 1) throw new Error("Matrix diagnostics could not locate the test hook.");
  const marker = matches[0][0];
  return runtime.replace(marker, `
    const paintDiagnostic = global.__matrixPaintDiagnostic = { calls: {}, thrown: [], samples: [], operations: [], hooks: [] };
    const canvasIds = new WeakMap(), sources = global.__matrixPaintSources = [];
    let nextCanvasId = 0;
    const canvasId = canvas => { if (!canvasIds.has(canvas)) canvasIds.set(canvas, ++nextCanvasId); return canvasIds.get(canvas); };
    const record = (canvas, operation, args) => {
      if (!canvas?.classList?.contains("cx-mx-canvas")) return null;
      const entry = { at:performance.now(),canvas:canvasId(canvas),operation,args };
      if (paintDiagnostic.operations.length === 1000) paintDiagnostic.operations.shift();
      paintDiagnostic.operations.push(entry); return entry;
    };
    for (const method of ["setTransform", "clearRect", "fillRect", "strokeRect", "drawImage", "fillText", "stroke", "fill", "save", "restore", "clip"]) {
      const original = CanvasRenderingContext2D.prototype[method];
      if (typeof original !== "function") { paintDiagnostic.hooks.push({ method,available:false }); continue; }
      CanvasRenderingContext2D.prototype[method] = function (...args) {
        const values = args.map(value => typeof value === "object" ? value instanceof HTMLCanvasElement ? { canvas:canvasId(value) } : { type:value?.constructor?.name } : value);
        if (method === "drawImage" && args[0] instanceof HTMLCanvasElement && !sources.includes(args[0])) sources.push(args[0]);
        const entry = record(this.canvas, method, values);
        try { return Reflect.apply(original, this, args); }
        catch (error) { if (entry) entry.error = String(error); throw error; }
      };
    }
    for (const [prototype,names] of [[HTMLCanvasElement.prototype,["width","height"]],
      [CanvasRenderingContext2D.prototype,["fillStyle","strokeStyle","globalAlpha","globalCompositeOperation"]]]) {
      for (const name of names) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype,name);
        if (!descriptor?.configurable || !descriptor.set) { paintDiagnostic.hooks.push({ name,available:false }); continue; }
        Object.defineProperty(prototype,name,{ ...descriptor,set(value) {
          record(this instanceof HTMLCanvasElement ? this : this.canvas, name, [value]);
          return Reflect.apply(descriptor.set,this,[value]);
        } });
      }
    }
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
    let paint, probes, screenshotError;
    try {
      paint = await page.evaluate(inspectMatrixCanvasFailure);
    } catch (captureError) { paint = { captureError: String(captureError) }; }
    try {
      await testInfo.attach("matrix-before-probes", { contentType:"image/png",body:await page.screenshot() });
    } catch (captureError) { screenshotError = String(captureError); }
    try { probes = await page.evaluate(probeMatrixCanvasFailure); }
    catch (captureError) { probes = { captureError:String(captureError) }; }
    try {
      await testInfo.attach("matrix-paint-diagnostics", { contentType: "application/json",
        body: Buffer.from(JSON.stringify({ consoleMessages, pageErrors, paint, screenshotError, probes }, null, 2)) });
    } finally { throw error; }
  } finally { page.off("console", consoleMessage); page.off("pageerror", pageError); }
}

// Read-only snapshot after the original assertion fails, before screenshots or recovery experiments.
export function inspectMatrixCanvasFailure() {
  const safe = read => { try { return read(); } catch (error) { return { error:String(error) }; } };
  const pixels = canvas => {
    const context = canvas.getContext("2d"), data = context.getImageData(0,0,canvas.width,canvas.height).data;
    let nonzero = 0; for (let index = 3; index < data.length; index += 4) if (data[index]) nonzero++;
    return { nonzero,pixel:[...context.getImageData(3,3,1,1).data] };
  };
  const diagnostic = JSON.parse(JSON.stringify(window.__matrixPaintDiagnostic || {}));
  const canvases = [...document.querySelectorAll(".cx-mx-canvas")].map(canvas => ({
    row:canvas.closest(".cx-mx-row")?.querySelector(".cx-mx-rowhead")?.textContent,
    ...safe(() => window.matrixPixelSample(canvas,null,null)),pixels:safe(() => pixels(canvas)),
    state:safe(() => { const context = canvas.getContext("2d"), transform = context.getTransform();
      return { fill:context.fillStyle,stroke:context.strokeStyle,alpha:context.globalAlpha,composite:context.globalCompositeOperation,
        transform:[transform.a,transform.b,transform.c,transform.d,transform.e,transform.f] }; }),
    afterStateRead:safe(() => [...canvas.getContext("2d").getImageData(3,3,1,1).data])
  }));
  const sprites = (window.__matrixPaintSources || []).map((canvas,index) => ({ index,
    width:canvas.width,height:canvas.height,pixels:safe(() => pixels(canvas)) }));
  return { diagnostic,canvases,sprites,contextEvents:window.__matrixContextEvents,
    forcedColors:matchMedia("(forced-colors:active)").matches,devicePixelRatio,fonts:document.fonts.status,userAgent:navigator.userAgent };
}

// Explicit post-failure experiments: never used to satisfy or retry the failed assertion.
export function probeMatrixCanvasFailure() {
  const safe = read => { try { return read(); } catch (error) { return { error:String(error) }; } };
  const pixel = canvas => [...canvas.getContext("2d").getImageData(3,3,1,1).data];
  const canvases = [...document.querySelectorAll(".cx-mx-canvas")];
  const afterScreenshot = canvases.map(canvas => safe(() => pixel(canvas)));
  const red = canvas => { const context = canvas.getContext("2d"); context.fillStyle = "#ff0000"; context.fillRect(3,3,1,1); return pixel(canvas); };
  const manual = canvases.map(canvas => safe(() => red(canvas)));
  const primitives = [];
  for (const options of [undefined,{willReadFrequently:true}]) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 4;
    document.body.appendChild(canvas);
    try {
      for (const color of ["#ff0000",...(window.__matrixPaintDiagnostic?.palette || []).map(item => item.fill).filter(Boolean)]) {
        primitives.push({ options:options || "default",color,result:safe(() => {
          const context = canvas.getContext("2d",options); context.clearRect(0,0,4,4);
          context.fillStyle = "#102f59"; context.fillStyle = color;
          const accepted = context.fillStyle; context.fillRect(0,0,4,4);
          return { accepted,pixel:pixel(canvas) };
        }) });
      }
    } finally { canvas.remove(); }
  }
  const offscreen = safe(() => {
    if (typeof OffscreenCanvas !== "function") return { available:false };
    const context = new OffscreenCanvas(4,4).getContext("2d");
    if (!context) return { context:false };
    context.fillStyle = "#ff0000"; context.fillRect(0,0,4,4);
    return { pixel:[...context.getImageData(3,3,1,1).data] };
  });
  const repaint = safe(() => {
    const view = window.__matrixView;
    if (!view) return { available:false };
    view.lookCache = null;
    for (const canvas of canvases) canvas._drawn = null;
    view.render();
    return { pixels:canvases.map(canvas => safe(() => pixel(canvas))),palette:window.__matrixPaintDiagnostic?.palette };
  });
  const reset = canvases.map(canvas => safe(() => {
    const context = canvas.getContext("2d");
    if (typeof context.reset !== "function") return { available:false };
    context.reset(); return { pixel:red(canvas) };
  }));
  const reassignWidth = canvases.map(canvas => safe(() => { canvas.width = canvas.width; return red(canvas); }));
  return { order:["afterScreenshot","manual","primitives","offscreen","repaint","reset","reassignWidth"],
    afterScreenshot,manual,primitives,offscreen,repaint,reset,reassignWidth };
}

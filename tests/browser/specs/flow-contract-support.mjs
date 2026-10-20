import { openFlow } from "./flow-support.mjs";

/** Mounts a small flow against host callbacks expressed in the browser's realm. */
export async function mountContract(page, fields, options = "({})", initial, extra = {}) {
  await openFlow(page, "flow-pause.html");
  await page.evaluate(([fields, source, initial, extra]) => {
    const old = document.querySelector("[data-canopyx-host]");
    old.canopyx.destroy(); old.remove();
    const host = document.createElement("div"); host.setAttribute("data-canopyx-host", "");
    host.addEventListener("canopyx:flowSubmit", event => event.stopPropagation());
    document.querySelector(".cx-main").prepend(host);
    const flow = { kind: "flow", version: 1, id: "contracts", title: "Contracts", steps: [{ id: "one", title: "Answers", fields }], ...extra };
    if (initial !== undefined) flow.initial = initial;
    window.__api = window.CanopyX.createFlow(host, { flow, ...new Function("return " + source)() });
    return window.__api.ready.then(() => true);
  }, [fields, options, initial, extra]);
}

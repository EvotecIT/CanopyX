// A fragment carries only the view document. A host page gives it renderers, callbacks, and a link scheme through
// CanopyX.configure before it is mounted, or takes over the moment of mounting with data-cx-mount="manual".
import { expect, test } from "@playwright/test";
import { nextFrames, runtimeAssets, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "records", label: "Records", rowHeight: 28, pageSize: 100, selection: "single", deepLink: true,
  columns: [{ id: "name", title: "Name", width: 260, kind: "text" }, { id: "state", title: "State", width: 160, kind: "text" }],
  source: { kind: "inline" },
  roots: [{ id: "group", label: "Group", children: [
    { id: "r1", label: "Record one", kind: "record", cells: { state: "ok" }, children: [{ id: "r1/rev/1", label: "Revision 1", kind: "revision" }, { id: "r1/rev/2", label: "Revision 2", kind: "revision" }] },
    { id: "r2", label: "Record two", kind: "record", cells: { state: "late" } }] }] };

// What a host page puts in its head after canopyx.js: renderers, a selection callback, and its own link scheme,
// "#record/<id>" and "#record/<id>/rev/<n>". parseLink is asynchronous, as when a host looks the path up.
const hostScript = `CanopyX.configure("records", {
  renderers: { state(node, element) { if (!node.cells) return false; element.textContent = "state: " + node.cells.state; return true; } },
  onSelect(node) { (window.selected = window.selected || []).push(node.id); },
  formatLink(path, node) {
    const revision = /^(.+)\\/rev\\/(\\d+)$/.exec(node.id);
    return node.kind === "record" ? "record/" + node.id : revision ? "record/" + revision[1] + "/rev/" + revision[2] : null;
  },
  async parseLink(fragment) {
    const match = /^record\\/([^/]+)(?:\\/rev\\/(\\d+))?$/.exec(fragment);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return match ? ["group", match[1]].concat(match[2] ? [match[1] + "/rev/" + match[2]] : []) : null;
  }
});`;

async function open(page, options = {}) {
  const script = "<script>" + (options.script === undefined ? hostScript : options.script) + "</script></head>";
  let html = viewPage(view).replace("</head>", () => script);
  if (options.manual) html = html.replace("<div class=\"cx-host\" data-canopyx-host", () => "<div class=\"cx-host\" data-canopyx-host data-cx-mount=\"manual\"");
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://canopyx.test/" + (options.hash || ""));
  if (!options.manual) await page.waitForSelector("[data-cx-ready]");
}

const row = (page, id) => page.locator('.cx-row[data-cx-id="' + id + '"]');
const hash = (page) => page.evaluate(() => location.hash);

test("options configured before the page loads reach the fragment the runtime mounts by itself", async ({ page }) => {
  await open(page);
  await row(page, "group").locator(".cx-exp").click();
  await expect(row(page, "r1").locator('[aria-colindex="2"]')).toHaveText("state: ok");
  await row(page, "r2").click();
  expect(await page.evaluate(() => window.selected)).toEqual(["r2"]);
  // Once the view is mounted, configuring it would have no effect, so it says how to do it instead.
  expect(await page.evaluate(() => { try { CanopyX.configure("records", {}); return "accepted"; } catch (e) { return e.message; } })).toContain("already mounted");
});

test("a deferred runtime leaves room for a deferred host script to configure the view", async ({ page }) => {
  // The page SaveHtmlBundle writes loads canopyx.js with defer; a host adds its own deferred script after it.
  const { script, style } = runtimeAssets();
  const html = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Deferred</title><style>" + style + "</style>"
    + "<script src=\"/canopyx.js\" defer></script><script src=\"/host.js\" defer></script></head><body class=\"cx-page\">"
    + "<div class=\"cx-host\" data-canopyx-host data-cx-theme=\"light\"><script type=\"application/json\" class=\"cx-config\">" + JSON.stringify(view) + "</script></div></body></html>";
  await page.route("https://canopyx.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(path === "/" ? { contentType: "text/html", body: html } : { contentType: "text/javascript", body: path === "/canopyx.js" ? script : hostScript });
  });
  await page.goto("https://canopyx.test/#record/r2");
  await page.waitForSelector("[data-cx-ready]");
  await expect(row(page, "r2")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "r2").locator('[aria-colindex="2"]')).toHaveText("state: late");
});

test("a newer fragment wins over one that is still being looked up", async ({ page }) => {
  // The first lookup takes longer than the second, so it finishes last.
  await open(page, { script: hostScript.replace("setTimeout(resolve, 20)", "setTimeout(resolve, fragment === \"record/r1/rev/1\" ? 400 : 20)") });
  await page.evaluate(() => { location.hash = "#record/r1/rev/1"; });
  await page.evaluate(() => { location.hash = "#record/r2"; });
  await expect(row(page, "r2")).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(600);
  await expect(row(page, "r2")).toHaveAttribute("aria-selected", "true");
  expect(await hash(page)).toBe("#record/r2");
  expect(await page.evaluate(() => window.selected)).toEqual(["r2"]);
});

test("a fragment marked manual waits for the host to mount it", async ({ page }) => {
  await open(page, { manual: true });
  await page.waitForLoadState("load");
  await nextFrames(page);
  await expect(page.locator(".cx-grid")).toHaveCount(0);
  expect(await page.evaluate(() => CanopyX.mount().length)).toBe(1);
  await page.waitForSelector("[data-cx-ready]");
  await row(page, "group").locator(".cx-exp").click();
  await expect(row(page, "r2").locator('[aria-colindex="2"]')).toHaveText("state: late");
});

test("the host's link scheme is written on selection and opened on load and on change", async ({ page }) => {
  await open(page, { hash: "#record/r1/rev/2" });
  await expect(row(page, "r1/rev/2")).toHaveAttribute("aria-selected", "true");
  // Selecting a record writes the host's fragment; selecting a row the host has no link for leaves the URL alone.
  await row(page, "r2").click();
  expect(await hash(page)).toBe("#record/r2");
  await row(page, "group").click();
  expect(await hash(page)).toBe("#record/r2");
  // A link followed inside the page opens its row; a fragment that is not a link of this view is ignored.
  await page.evaluate(() => { window.selected = []; location.hash = "#record/r1/rev/1"; });
  await expect(row(page, "r1/rev/1")).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => { location.hash = "#something-else"; });
  await nextFrames(page);
  await expect(row(page, "r1/rev/1")).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => window.selected)).toEqual(["r1/rev/1"]);
});

test("the default link scheme also follows a change of the fragment", async ({ page }) => {
  await open(page, { script: "", hash: "#cx.records=group/r1" });
  await expect(row(page, "r1")).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => { location.hash = "#other=1&cx.records=group/r2"; });
  await expect(row(page, "r2")).toHaveAttribute("aria-selected", "true");
  await row(page, "r1").click();
  expect(await hash(page)).toBe("#other=1&cx.records=group/r1");
});

test("a fragment the host writes itself is opened through readLocation or popstate, and Back and Forward reopen theirs", async ({ page }) => {
  await open(page);
  const api = "document.querySelector('.cx-host').canopyx";
  // replaceState and pushState fire no event: the grid sees the new fragment only when the host asks it to read it.
  await page.evaluate(() => history.replaceState(history.state, "", "#record/r2"));
  await page.waitForTimeout(100);
  await expect(row(page, "r2")).toHaveCount(0);
  expect(await page.evaluate(`${api}.readLocation().then(() => "done")`)).toBe("done");
  await expect(row(page, "r2")).toHaveAttribute("aria-selected", "true");
  // Reading the same address again changes nothing.
  await page.evaluate(`${api}.readLocation()`);
  expect(await page.evaluate(() => window.selected)).toEqual(["r2"]);
  // Entries the host pushed are opened again on Back and Forward, which dispatch popstate but no hashchange.
  await page.evaluate(() => history.pushState(null, "", "#record/r1/rev/2"));
  await page.evaluate(`${api}.readLocation()`);
  await expect(row(page, "r1/rev/2")).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => history.pushState(null, "", "#record/r1"));
  await page.evaluate(`${api}.readLocation()`);
  await expect(row(page, "r1")).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => history.back());
  await expect(row(page, "r1/rev/2")).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => history.forward());
  await expect(row(page, "r1")).toHaveAttribute("aria-selected", "true");
  // A router that announces its own address changes with popstate, as history libraries do, is followed too.
  await page.evaluate(() => {
    history.replaceState(history.state, "", "#record/r1/rev/1");
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  });
  await expect(row(page, "r1/rev/1")).toHaveAttribute("aria-selected", "true");
  // A destroyed grid stops following the address, and readLocation resolves without doing anything.
  await page.evaluate(`(() => { const grid = ${api}; grid.destroy(); window.destroyedRead = grid.readLocation(); })()`);
  expect(await page.evaluate(() => window.destroyedRead.then(() => "resolved"))).toBe("resolved");
});

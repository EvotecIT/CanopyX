// A host page can carry a <base href> that points away from the page itself (SharePoint viewers inject one so the
// relative links of an uploaded report resolve against its library). A deep link is a fragment of the page's own
// address, so writing one must not take the address to the base.
import { expect, test } from "@playwright/test";
import { viewPage } from "./support.mjs";

const view = { protocol: "canopyx/2", type: "view", id: "records", label: "Records", rowHeight: 28, pageSize: 100, selection: "single", deepLink: true,
  columns: [{ id: "name", title: "Name", width: 260, kind: "text" }],
  source: { kind: "inline" },
  roots: [{ id: "group", label: "Group", expanded: true, children: [{ id: "r1", label: "Record one", kind: "record" }, { id: "r2", label: "Record two", kind: "record" }] }] };

const pageUrl = "https://canopyx.test/reports/page.html";
const row = (page, id) => page.locator('.cx-row[data-cx-id="' + id + '"]');

async function open(page, base, options = {}) {
  let html = viewPage(view).replace("<head>", () => "<head><base href=\"" + base + "\">");
  if (options.script) html = html.replace("</head>", () => "<script>" + options.script + "</script></head>");
  await page.route(pageUrl + "*", (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto(pageUrl + "?v=1" + (options.hash || ""));
  await page.waitForSelector("[data-cx-ready]");
}

for (const [name, base] of [["the same origin", "https://canopyx.test/library/folder/"], ["another origin", "https://elsewhere.test/library/"]]) {
  test("selecting a row under a <base href> on " + name + " keeps the page's own address", async ({ page }) => {
    await open(page, base);
    const entries = await page.evaluate(() => history.length);
    await row(page, "r2").click();
    expect(await page.evaluate(() => location.href)).toBe(pageUrl + "?v=1#cx.records=group/r2");
    // The address is replaced, not pushed: selecting rows must not fill the Back history.
    expect(await page.evaluate(() => history.length)).toBe(entries);
    // The fragment the grid wrote is its own: a reload of that address opens the same row.
    await page.reload();
    await page.waitForSelector("[data-cx-ready]");
    await expect(row(page, "r2")).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => location.pathname)).toBe("/reports/page.html");
  });
}

test("a host link scheme under a <base href> also stays on the page, next to history state the page already had", async ({ page }) => {
  await open(page, "https://canopyx.test/library/folder/", {
    hash: "#record/r1",
    script: "history.replaceState({ host: 1 }, '');"
      + "CanopyX.configure('records', { formatLink: (path, node) => node && node.kind === 'record' ? 'record/' + node.id : null,"
      + " parseLink: (fragment) => /^record\\//.test(fragment) ? ['group', fragment.slice(7)] : null });"
  });
  await expect(row(page, "r1")).toHaveAttribute("aria-selected", "true");
  await row(page, "r2").click();
  expect(await page.evaluate(() => [location.href, history.state])).toEqual([pageUrl + "?v=1#record/r2", { host: 1 }]);
});

// Enum pills in every tone (standard and host tones, with and without a theme fill), quiet values aligned with them and
// optionally in the normal text colour, Enter on link rows, and the canopyx:link host hook.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { viewPage, nextFrames, openExample } from "./support.mjs";

const states = ["down", "degraded", "verified", "maintenance", "up", "planned", "retired", "neutral-pill"];
const view = patch => ({ protocol: "canopyx/2", type: "grid", id: "pills", label: "Services", pageSize: 20, selection: "single", search: false, source: { kind: "inline" },
  columns: [{ id: "name", title: "Service", kind: "text", presenter: { kind: "link", hrefColumn: "address" } },
    { id: "state", title: "State", kind: "text", presenter: { kind: "enum", quietTones: ["neutral"],
      tones: { down: "danger", degraded: "warning", verified: "info", maintenance: "maintenance", up: "up", "neutral-pill": "muted" } } },
    { id: "address", title: "Address", kind: "text", hidden: true }],
  rows: states.map((state, i) => ({ id: "s" + i, cells: { name: "service-0" + i, state, address: "#service-" + i } })), ...patch });
// A host theme like a report's: "up" brings its own fill, "maintenance" only its ink.
const HOST_TONES = "<style>.cx-host{--hfx-color-status-up-fg:#1d6b3a;--hfx-color-status-up-bg:#d9f2e1;--hfx-color-status-maintenance-fg:#5b3fb5}" +
  ".cx-host[data-cx-theme=dark]{--hfx-color-status-up-fg:#6fd69a;--hfx-color-status-up-bg:#173a26;--hfx-color-status-maintenance-fg:#b9a5ff}</style></head>";

async function open(page, document, theme = "light", script = "") {
  await page.emulateMedia({ colorScheme: theme });
  const html = viewPage(document, theme)
    .replace("</head>", HOST_TONES + (script ? "<script>" + script + "</script></head>" : "")).replace("</head></head>", "</head>");
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.route("http://canopyx.test/pills", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/pills");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}
async function capture(page, name) { if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png") }); }
/** Per state cell: whether it is a pill, its fill and border against the cell, its text start and colour. */
const cells = page => page.evaluate(() => [...document.querySelectorAll('.cx-row[data-cx-id] .cx-cell:nth-child(2)')].map(cell => {
  const item = cell.querySelector(".p-pill, .p-muted, .p-inset, .p-state"), style = getComputedStyle(item), range = document.createRange();
  range.selectNodeContents(item.lastChild.nodeType === 3 ? item.lastChild : item); const surface = getComputedStyle(cell.closest(".cx-row")).backgroundColor;
  return { text: item.textContent, pill: item.classList.contains("p-pill"), fill: style.backgroundColor, surface, border: style.boxShadow,
    start: Math.round(range.getBoundingClientRect().left), color: style.color, rowColor: getComputedStyle(cell).color };
}));
const opaque = color => !/rgba\(.*, 0\)$|transparent/.test(color);

for (const theme of ["light", "dark"]) {
  test("every enum tone draws a filled, bordered pill and quiet values share its inline start (" + theme + ")", async ({ page }) => {
    await open(page, view(), theme);
    const list = await cells(page);
    const pills = list.filter(item => item.pill);
    expect(pills.map(item => item.text)).toEqual(["down", "degraded", "verified", "maintenance", "up", "neutral-pill"]);
    for (const pill of pills) {
      expect(opaque(pill.fill), pill.text + " fill").toBe(true);
      expect(pill.fill, pill.text + " fill differs from the row").not.toBe(pill.surface);
      expect(pill.border, pill.text + " border").toContain("inset");
    }
    // The host tone with a theme fill uses it.
    expect(pills.find(item => item.text === "up").fill).toBe(theme === "light" ? "rgb(217, 242, 225)" : "rgb(23, 58, 38)");
    // Quiet values ("planned", "retired") start where the pills' text starts.
    const starts = new Set(list.map(item => item.start));
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(1);
    // Muted by default.
    const quiet = list.filter(item => !item.pill);
    expect(quiet.every(item => item.color !== item.rowColor)).toBe(true);
    await capture(page, "enum-pills-" + theme);
  });
}

test("quietStyle plain shows quiet values in the normal text colour", async ({ page }) => {
  const document = view(); document.columns[1].presenter.quietStyle = "plain";
  await open(page, document);
  const quiet = (await cells(page)).filter(item => !item.pill);
  expect(quiet.map(item => item.text)).toEqual(["planned", "retired"]);
  expect(quiet.every(item => item.color === item.rowColor)).toBe(true);
  // An unknown style is a definition error.
  document.columns[1].presenter.quietStyle = "loud";
  await page.unrouteAll();
  await page.route("http://canopyx.test/pills", route => route.fulfill({ contentType: "text/html", body: viewPage(document) }));
  await page.goto("http://canopyx.test/pills");
  await expect(page.locator("[data-cx-error]")).toHaveAttribute("data-cx-error", /presenter|invalid/i);
});

test("Enter on a link row follows its link after rowActivate, which can cancel it", async ({ page }) => {
  await open(page, view({ rowAction: "link" }), "light", "window.cancel=false;document.addEventListener('canopyx:rowActivate',e=>{if(window.cancel)e.preventDefault();},true);");
  await page.evaluate(() => { window.cancel = true; });
  await page.locator('.cx-row[data-cx-id="s1"]').focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => location.hash)).toBe("");
  await expect(page.locator(".cx-drawer")).toHaveCount(0);
  await page.evaluate(() => { window.cancel = false; });
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#service-1");
  await expect(page.locator(".cx-drawer")).toHaveCount(0);
  // Ctrl+Enter keeps opening record details.
  await page.locator('.cx-row[data-cx-id="s2"]').focus();
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".cx-drawer")).toBeVisible();
});

test("canopyx:link and onLink let a host route a link cell itself", async ({ page }) => {
  await open(page, view({ rowAction: "link" }), "light",
    "window.links=[];window.route=true;CanopyX.configure('pills',{onLink:e=>{window.links.push([e.id,e.column,e.href.split('#')[1],e.row.cells.state].join('|'));return !window.route;}});");
  // A click on the link, Enter on the link itself and the row's link action all ask the host.
  await page.locator('.cx-row[data-cx-id="s0"] a.p-link').click();
  await page.locator('.cx-row[data-cx-id="s1"] a.p-link').focus();
  await page.keyboard.press("Enter");
  await page.locator('.cx-row[data-cx-id="s2"] .cx-cell').nth(1).click();
  expect(await page.evaluate(() => window.links)).toEqual(["s0|name|service-0|down", "s1|name|service-1|degraded", "s2|name|service-2|verified"]);
  expect(await page.evaluate(() => location.hash)).toBe("");
  // The DOM event cancels as well; without a cancel the browser follows the link.
  await page.evaluate(() => { window.route = false; document.querySelector("[data-canopyx-host]").addEventListener("canopyx:link", e => { if (e.detail.id === "s3") e.preventDefault(); }); });
  await page.locator('.cx-row[data-cx-id="s3"] a.p-link').click();
  expect(await page.evaluate(() => location.hash)).toBe("");
  await page.locator('.cx-row[data-cx-id="s4"] a.p-link').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#service-4");
});

for (const theme of ["light", "dark"]) {
  test("the .NET service status example shows filled pills and plain quiet values (" + theme + ")", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.emulateMedia({ colorScheme: theme });
    await openExample(page, theme === "dark" ? "service-status-dark.html" : "service-status.html");
    const pills = await page.locator(".p-pill").evaluateAll(items => items.map(item => getComputedStyle(item).backgroundColor));
    expect(pills.length).toBeGreaterThan(4);
    expect(pills.every(color => !/rgba\(.*, 0\)$|transparent/.test(color))).toBe(true);
    await expect(page.locator(".p-inset").first()).toBeVisible();
    await capture(page, "service-status-example-" + theme);
  });
}

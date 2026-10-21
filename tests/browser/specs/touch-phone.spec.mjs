// The phone paths under touch emulation: a touch screen and a phone viewport, driven by taps and touch scrolling.
// The checks assert behaviour (what opens, what is selected, what scrolls), not pixels.
import { expect, test } from "@playwright/test";
import { viewPage, nextFrames } from "./support.mjs";

const columns = [
  { id: "name", title: "Name", kind: "text", sortable: true },
  { id: "state", title: "State", kind: "text", sortable: true },
  { id: "owner", title: "Owner", kind: "text", sortable: true },
  { id: "amount", title: "Amount", kind: "number", sortable: true },
  { id: "note", title: "Note", kind: "text" }
];
// Padded ids: records without a sort keep the ordinal order of their ids.
const rows = Array.from({ length: 120 }, (_, i) => ({ id: "r" + String(i).padStart(3, "0"),
  cells: { name: "server-" + String(i).padStart(3, "0"), state: i % 3 ? "Pass" : "Fail", owner: "Team " + (i % 5), amount: (i * 7) % 50, note: "Note " + i } }));
const gridView = patch => ({ protocol: "canopyx/2", type: "grid", id: "touch", label: "Servers", pageSize: 200, selection: "single", search: true,
  source: { kind: "inline" }, columns, rows, ...patch });
const treeView = { protocol: "canopyx/2", type: "view", id: "touch-tree", label: "Folders", pageSize: 50, selection: "single", source: { kind: "inline" },
  columns: [{ id: "name", title: "Name" }, { id: "size", title: "Size", kind: "number" }, { id: "owner", title: "Owner" }],
  roots: Array.from({ length: 6 }, (_, i) => ({ id: "f" + i, label: "Folder " + i, cells: { size: i, owner: "Team " + i },
    children: Array.from({ length: 3 }, (_, j) => ({ id: "f" + i + "-" + j, label: "File " + i + "." + j, cells: { size: j, owner: "Team " + j } })) })) };

// Touch screens on a phone viewport. Firefox has no mobile emulation, so it gets the touch screen alone.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: async ({ browserName }, use) => use(browserName !== "firefox") });

/** Opens a view on a page that records row activations. */
async function open(page, view) {
  const html = viewPage(view).replace("</head>", "<script>window.activations=[];document.addEventListener(\"canopyx:rowActivate\"," +
    "event=>window.activations.push(event.detail.id+\":\"+event.detail.keyboard),true);</script></head>");
  await page.route("http://canopyx.test/touch", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/touch");
  await page.waitForSelector("[data-cx-ready]");
  await expect(page.locator("[data-canopyx-host]")).toHaveClass(/cx-phone/);
  await nextFrames(page);
}
const row = (page, id) => page.locator('.cx-row[data-cx-id="' + id + '"]');
// The activations so far, once there are as many as expected (an activation may follow its tap by a task).
async function activations(page, count = 0) {
  if (count) await expect.poll(() => page.evaluate(() => window.activations.length)).toBeGreaterThanOrEqual(count);
  return page.evaluate(() => window.activations.splice(0));
}
const openPanel = page => page.locator("details[open] > .cx-grid-panel").last();

test("the coarse pointer matches, so touch layouts and always-visible menu buttons apply", async ({ page }) => {
  await open(page, gridView({}));
  expect(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches)).toBe(true);
  const opacities = await page.locator(".cx-grid-column-menu:visible").evaluateAll(buttons => buttons.map(button => getComputedStyle(button).opacity));
  expect(opacities.length).toBeGreaterThan(0);
  expect(opacities.every(value => value === "1")).toBe(true);
});

test("tapping +N opens the record drawer with the hidden fields, and its close button returns to the rows", async ({ page }) => {
  await open(page, gridView({}));
  const more = row(page, "r002").locator(".cx-hidden-fields");
  await expect(more).toHaveText(/^\+\d+ Columns$/);
  await more.tap();
  const drawer = page.locator("dialog.cx-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("h4")).toHaveText("server-002");
  // Every field the phone layout hid is listed in the drawer.
  const hidden = await page.locator(".cx-hcell").evaluateAll(cells => cells.map(cell => cell.getAttribute("data-cx-column")));
  const listed = await drawer.locator("dt").allTextContents();
  for (const column of columns.filter(column => !hidden.includes(column.id))) expect(listed).toContain(column.title);
  const box = await drawer.boundingBox();
  expect(Math.round(box.width)).toBeLessThanOrEqual(390);
  await drawer.getByRole("button", { name: "Close record details", exact: true }).tap();
  await expect(drawer).toHaveCount(0);
  await expect(row(page, "r002")).toBeVisible();
});

test("the more menu opens as a bottom sheet by tap, and its Export entry replaces it with its own sheet", async ({ page }) => {
  await open(page, gridView({}));
  await page.locator(".cx-grid-overflow > summary").tap();
  await expect(page.locator(".cx-grid-overflow")).toHaveAttribute("open", "");
  const sheet = await openPanel(page).boundingBox();
  // A sheet spans the phone and rests on its bottom edge.
  expect(sheet.x).toBeLessThanOrEqual(1);
  expect(sheet.width).toBeGreaterThanOrEqual(388);
  expect(Math.abs(sheet.y + sheet.height - 844)).toBeLessThanOrEqual(2);
  await page.locator(".cx-grid-overflow .cx-grid-export > summary").tap();
  await expect(page.locator(".cx-grid-export")).toHaveAttribute("open", "");
  const exportSheet = await page.locator(".cx-grid-export > .cx-grid-panel").boundingBox();
  expect(Math.abs(exportSheet.y + exportSheet.height - 844)).toBeLessThanOrEqual(2);
  expect(exportSheet.width).toBeGreaterThanOrEqual(388);
  await page.locator("[data-canopyx-host]").evaluate(host => host.canopyx.closeMenus());
  await expect(page.locator("details[open]")).toHaveCount(0);
});

test("a column menu opens by tap and its entries sort the column", async ({ page }) => {
  await open(page, gridView({}));
  await page.getByRole("button", { name: "Menu for Name", exact: true }).tap();
  const menu = page.getByRole("menu", { name: "Menu for Name" });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390 + 0.5);
  await menu.getByRole("menuitem", { name: "Sort descending", exact: true }).tap();
  await expect(page.locator('.cx-hcell[data-cx-column="name"]')).toHaveAttribute("aria-sort", "descending");
  await expect(menu).toBeHidden();
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll(".cx-row[data-cx-id]")]
    .sort((a, b) => a.getAttribute("aria-rowindex") - b.getAttribute("aria-rowindex"))[0].getAttribute("data-cx-id"))).toBe("r119");
});

test("a tap on a phone row activates it once and opens its record details, without changing the selection", async ({ page }) => {
  await open(page, gridView({}));
  await row(page, "r001").locator(".cx-cell").nth(1).tap();
  expect(await activations(page, 1)).toEqual(["r001:false"]);
  const drawer = page.locator("dialog.cx-drawer");
  await expect(drawer.locator("h4")).toHaveText("server-001");
  await expect(page.locator('.cx-row[aria-selected="true"]')).toHaveCount(0);
  await drawer.getByRole("button", { name: "Close record details", exact: true }).tap();
  await expect(drawer).toHaveCount(0);
  await row(page, "r004").locator(".cx-cell").nth(1).tap();
  expect(await activations(page, 1)).toEqual(["r004:false"]);
  await expect(drawer.locator("h4")).toHaveText("server-004");
});
test("in a tree a tap selects a row and a tap on the expander opens and closes it", async ({ page }) => {
  await open(page, treeView);
  await row(page, "f1").locator(".cx-cell").first().locator(".cx-label, .cx-text").first().tap();
  await expect(row(page, "f1")).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "f1")).toHaveAttribute("aria-expanded", "false");
  await row(page, "f2").locator(".cx-exp").tap();
  await expect(row(page, "f2")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "f2-0")).toBeVisible();
  // Wait out the double-tap interval: a second tap inside it is a double tap, which toggles the row again.
  await page.waitForTimeout(600);
  await row(page, "f2").locator(".cx-exp").tap();
  await expect(row(page, "f2")).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "f2-0")).toHaveCount(0);
  expect(await activations(page)).toEqual([]);
});

test("a touch scroll moves the rows, recycles them and neither selects nor activates a row", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Only Chromium can dispatch native touch points that scroll.");
  await open(page, gridView({}));
  const grid = page.locator(".cx-data-grid .cx-grid");
  const box = await grid.boundingBox();
  const x = Math.round(box.x + box.width / 2), start = Math.round(box.y + box.height - 40);
  const cdp = await page.context().newCDPSession(page);
  try {
    // A finger drags up across the rows: the touch starts on a record, so a scroll must not turn into a tap.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: start }] });
    for (let step = 1; step <= 24; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: start - step * 25 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await cdp.detach();
  }
  await expect.poll(() => grid.evaluate(element => element.scrollTop)).toBeGreaterThan(300);
  await nextFrames(page);
  // The rendered window followed the scroll: the first records were recycled for later ones.
  await expect(row(page, "r000")).toHaveCount(0);
  const visible = await page.locator(".cx-row[data-cx-id]").evaluateAll(list => list.map(element => Number(element.getAttribute("data-cx-id").slice(1))));
  expect(Math.max(...visible)).toBeGreaterThan(25);
  expect(await activations(page)).toEqual([]);
  await expect(page.locator('.cx-row[aria-selected="true"]')).toHaveCount(0);
  await expect(page.locator("dialog.cx-drawer")).toHaveCount(0);
});

// Row activation lets a host open its own view of a row: grids and trees dispatch the cancelable canopyx:rowActivate event
// and call onRowActivate before their own action (record details or the row's link; a tree's toggle), by mouse and keyboard.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { viewPage, nextFrames } from "./support.mjs";

const gridView = patch => ({ protocol: "canopyx/2", type: "grid", id: "activate", label: "Servers", pageSize: 20, selection: "single", search: false,
  source: { kind: "inline" }, columns: [{ id: "name", title: "Name", kind: "text" }, { id: "state", title: "State", kind: "text" }],
  rows: Array.from({ length: 6 }, (_, i) => ({ id: "r" + i, cells: { name: "Server " + i, state: "Pass" } })), ...patch });
const treeView = { protocol: "canopyx/2", type: "view", id: "activate", label: "Folders", pageSize: 50, selection: "single", source: { kind: "inline" },
  columns: [{ id: "name", title: "Name" }, { id: "size", title: "Size", kind: "number" }],
  roots: [{ id: "a", label: "Alpha", cells: { size: 1 }, children: [{ id: "a1", label: "Alpha one", cells: { size: 2 } }] }, { id: "b", label: "Beta", cells: { size: 3 } }] };

/** Opens the view; the page records rowActivate events and, while window.takeOver is set, cancels them. */
async function open(page, view, script = "") {
  const html = viewPage(view).replace("</head>", "<script>window.activations=[];window.takeOver=false;document.addEventListener(\"canopyx:rowActivate\",event=>{" +
    "window.activations.push({id:event.detail.id,keyboard:event.detail.keyboard,row:!!(event.detail.row||event.detail.node)});if(window.takeOver)event.preventDefault();},true);" +
    script + "</script></head>");
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.route("http://canopyx.test/activate", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://canopyx.test/activate");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}
const row = (page, id) => page.locator('.cx-row[data-cx-id="' + id + '"]');
const activations = page => page.evaluate(() => window.activations.splice(0));
async function capture(page, name) { if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, name + ".png") }); }

test("a grid host takes over row activation by mouse and keyboard and keeps the drawer closed", async ({ page }) => {
  await open(page, gridView({ rowAction: "details" }));
  await page.evaluate(() => { window.takeOver = true; });
  await row(page, "r1").locator(".cx-cell").first().click();
  expect(await activations(page)).toEqual([{ id: "r1", keyboard: false, row: true }]);
  // A double click is one activation: its first click activates, its second click and the dblclick add nothing.
  await row(page, "r2").locator(".cx-cell").first().dblclick();
  expect(await activations(page)).toEqual([{ id: "r2", keyboard: false, row: true }]);
  // Enter on a focused row and Ctrl+Enter in a cell are keyboard activations.
  await row(page, "r3").focus();
  await page.keyboard.press("Enter");
  expect(await activations(page)).toEqual([{ id: "r3", keyboard: true, row: true }]);
  await page.keyboard.press("F2");
  await page.keyboard.press("Control+Enter");
  expect(await activations(page)).toEqual([{ id: "r3", keyboard: true, row: true }]);
  await expect(page.locator(".cx-drawer")).toHaveCount(0);
  // Without a host taking over, the same Enter opens the record drawer.
  await page.evaluate(() => { window.takeOver = false; });
  await row(page, "r4").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cx-drawer")).toBeVisible();
  expect(await activations(page)).toEqual([{ id: "r4", keyboard: true, row: true }]);
  await capture(page, "row-activation-grid-default-drawer");
});

test("without a row action a grid activates a row by double click, once, and a plain click activates nothing", async ({ page }) => {
  await open(page, gridView({}));
  await page.evaluate(() => { window.takeOver = true; });
  await row(page, "r1").locator(".cx-cell").first().click();
  expect(await activations(page)).toEqual([]);
  await row(page, "r2").locator(".cx-cell").first().dblclick();
  expect(await activations(page)).toEqual([{ id: "r2", keyboard: false, row: true }]);
  await expect(page.locator(".cx-drawer")).toHaveCount(0);
  await page.evaluate(() => { window.takeOver = false; });
  await row(page, "r3").locator(".cx-cell").first().dblclick();
  await expect(page.locator(".cx-drawer")).toBeVisible();
});

test("onRowActivate returning false keeps a grid's link and details from running", async ({ page }) => {
  const view = gridView({ rowAction: "link", columns: [{ id: "name", title: "Name", kind: "text", presenter: { kind: "link", hrefColumn: "url" } },
    { id: "state", title: "State", kind: "text" }, { id: "url", title: "Address", kind: "text", hidden: true }],
    rows: Array.from({ length: 3 }, (_, i) => ({ id: "r" + i, cells: { name: "Server " + i, state: "Pass", url: "#server-" + i } })) });
  await open(page, view, "window.hooked=[];CanopyX.configure(\"activate\",{onRowActivate:event=>{window.hooked.push(event.id+':'+event.keyboard+':'+event.row.cells.state);return false;}});");
  await row(page, "r1").locator(".cx-cell").nth(1).click();
  expect(await page.evaluate(() => window.hooked)).toEqual(["r1:false:Pass"]);
  expect(await page.evaluate(() => location.hash)).toBe("");
  await row(page, "r2").focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.hooked)).toEqual(["r1:false:Pass", "r2:true:Pass"]);
  await expect(page.locator(".cx-drawer")).toHaveCount(0);
  // The row object is a frozen copy: a host cannot change the grid's data through it.
  expect(await page.evaluate(() => new Promise(resolve => {
    document.querySelector("[data-canopyx-host]").addEventListener("canopyx:rowActivate", event => resolve(Object.isFrozen(event.detail.row) && Object.isFrozen(event.detail.row.cells)), { once: true });
    document.querySelector('.cx-row[data-cx-id="r0"] .cx-cell:nth-child(2)').click();
  }))).toBe(true);
});

test("a tree host takes over Enter and double-click activation; Space, the expander and the default stay", async ({ page }) => {
  await open(page, treeView);
  // Without a host taking over, Enter selects and toggles, and a double click toggles.
  await row(page, "a").focus();
  await page.keyboard.press("Enter");
  await expect(row(page, "a")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "a")).toHaveAttribute("aria-selected", "true");
  expect(await activations(page)).toEqual([{ id: "a", keyboard: true, row: true }]);
  await row(page, "b").locator(".cx-cell").nth(1).dblclick();
  expect(await activations(page)).toEqual([{ id: "b", keyboard: false, row: true }]);
  // A host taking over keeps the tree's own action from running.
  await page.evaluate(() => { window.takeOver = true; });
  await row(page, "a").focus();
  await page.keyboard.press("Enter");
  await expect(row(page, "a")).toHaveAttribute("aria-expanded", "true");
  await row(page, "a").locator(".cx-cell").nth(1).dblclick();
  await expect(row(page, "a")).toHaveAttribute("aria-expanded", "true");
  expect((await activations(page)).map(item => item.id + ":" + item.keyboard)).toEqual(["a:true", "a:false"]);
  // Space selects without activating.
  await row(page, "b").focus();
  await page.keyboard.press(" ");
  await expect(row(page, "b")).toHaveAttribute("aria-selected", "true");
  expect(await activations(page)).toEqual([]);
  // The callback form: onRowActivate(node, { keyboard }) returning false.
  await page.evaluate(() => { window.takeOver = false; });
  await page.evaluate(() => {
    const host = document.querySelector("[data-canopyx-host]"), view = host.canopyx.view;
    host.canopyx.destroy(); host.removeAttribute("data-canopyx-mounted");
    window.hooked = [];
    CanopyX.createTreeGrid(host, { view, onRowActivate: (node, context) => { window.hooked.push(node.id + ":" + context.keyboard); return false; } });
  });
  await page.waitForSelector("[data-cx-ready]");
  await row(page, "a").focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.hooked)).toEqual(["a:true"]);
  await expect(row(page, "a")).toHaveAttribute("aria-expanded", "false");
  await capture(page, "row-activation-tree");
});

// The drawer's title: whether it has focus and shows a focus ring, and its subtitle.
const drawerTitle = page => page.locator(".cx-drawer h4").evaluate(title => ({ focused: document.activeElement === title,
  ring: title.matches(":focus-visible") && getComputedStyle(title).outlineStyle !== "none", subtitle: title.nextElementSibling.hidden ? null : title.nextElementSibling.textContent }));

for (const theme of ["light", "dark"]) {
  test("the record drawer takes focus with a ring for keyboard activation only, and shows no raw id (" + theme + ")", async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await open(page, gridView({ rowAction: "details" }));
    await page.locator("[data-canopyx-host]").evaluate((host, value) => host.setAttribute("data-cx-theme", value), theme);
    await page.locator('.cx-row[data-cx-id="r4"] .cx-cell').first().click();
    await expect(page.locator(".cx-drawer h4")).toHaveText("Server 4");
    expect(await drawerTitle(page)).toEqual({ focused: true, ring: false, subtitle: null });
    await capture(page, "drawer-mouse-" + theme + "-1100");
    await page.keyboard.press("Escape");
    await row(page, "r4").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".cx-drawer h4")).toHaveText("Server 4");
    expect(await drawerTitle(page)).toEqual({ focused: true, ring: true, subtitle: null });
    await capture(page, "drawer-keyboard-" + theme + "-1100");
  });
}

test("a double click opens the drawer without a ring, and a configured secondary column is its subtitle", async ({ page }) => {
  await open(page, gridView({ columns: [{ id: "name", title: "Name", kind: "text", presenter: { kind: "identifier", secondaryColumn: "site" } },
    { id: "state", title: "State", kind: "text" }, { id: "site", title: "Site", kind: "text" }],
    rows: Array.from({ length: 3 }, (_, i) => ({ id: "r" + i, cells: { name: "Server " + i, state: "Pass", site: "Site " + i } })) }));
  await row(page, "r1").locator(".cx-cell").nth(1).dblclick();
  await expect(page.locator(".cx-drawer h4")).toHaveText("Server 1");
  expect(await drawerTitle(page)).toEqual({ focused: true, ring: false, subtitle: "Site 1" });
});
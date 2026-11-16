// Tree filter switches show how many nodes match, and record drawers copy the record as plain text for a ticket.
import { expect, test } from "@playwright/test";
import { definition } from "./record-panel-fixtures.mjs";
import { viewPage } from "./support.mjs";

const tree = { protocol: "canopyx/2", type: "view", id: "users", label: "Users", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", width: 260, kind: "text" }, { id: "status", title: "Status", width: 120, kind: "text", section: "Account" },
    { id: "logons", title: "Logons", width: 100, kind: "number", section: "Account" }],
  filters: [{ id: "risk", label: "Has risks", flag: "risk" }, { id: "new", label: "New", flag: "new" },
    { id: "stale", label: "Stale", flag: "stale", count: 1234 }, { id: "host", label: "Host only", flag: "host", hidden: true }],
  source: { kind: "inline" },
  roots: [
    { id: "a", label: "Admins", flags: ["new"], children: [
      { id: "a/1", label: "Ada", flags: ["risk", "new"], cells: { status: { value: "Enabled", tone: "success" }, logons: 1200 } },
      { id: "a/2", label: "Ben", flags: ["new"], cells: { status: "Disabled" } }] },
    { id: "b", label: "Builders", flags: ["new", "host"] }] };

const grid = { protocol: "canopyx/2", type: "grid", id: "people", label: "People", rowHeight: 32, pageSize: 50, selection: "single",
  columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true }, { id: "mail", title: "Mail", kind: "text", section: "Contact" },
    { id: "seen", title: "Last seen", kind: "datetime", section: "Activity" }, { id: "score", title: "Score", kind: "number", section: "Activity" }],
  source: { kind: "inline" },
  rows: [{ id: "p1", cells: { name: "Ada Lovelace", mail: "ada@example.test", seen: "2026-01-02T03:04:00Z", score: 7.5 } }, { id: "p2", cells: { name: "Ben" } }] };

const clipboard = `<script>window.copied = [];
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: text => { window.copied.push(text); return Promise.resolve(); } } });</script>`;

async function open(page, view) {
  await page.route("http://canopyx.test/page.html", route => route.fulfill({ contentType: "text/html",
    body: viewPage(view).replace("<body class=\"cx-page\">", "<body class=\"cx-page\">" + clipboard) }));
  await page.goto("http://canopyx.test/page.html");
  await page.waitForSelector("[data-cx-ready]");
}

test("filter switches show the matching nodes beside their labels", async ({ page }) => {
  await open(page, tree);
  const switches = page.locator(".cx-toolbar .cx-switch");
  await expect(switches).toHaveText(["Has risks·1", "New·4", "Stale·1,234"]);
  // The dot is decoration: the switch reads its label and the count.
  await expect(page.getByRole("checkbox", { name: "Has risks 1", exact: true })).toBeVisible();
  await expect(page.locator(".cx-switch-dot").first()).toHaveAttribute("aria-hidden", "true");
  // The counts are totals: turning a filter on keeps every count.
  await page.getByRole("checkbox", { name: "Has risks 1" }).check();
  await expect(switches).toHaveText(["Has risks·1", "New·4", "Stale·1,234"]);
});

test("a tree that loads nodes on demand shows only the counts its host gives", async ({ page }) => {
  const hosted = { ...tree, source: { kind: "remote", children: "children/{id}", search: "search?q={query}" }, roots: undefined };
  await page.route("http://canopyx.test/children/**", route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify({ protocol: "canopyx/2", type: "children", parent: null, items: tree.roots.map(({ children, ...node }) => ({ ...node, hasChildren: !!children })), next: null }) }));
  await open(page, hosted);
  await expect(page.locator(".cx-toolbar .cx-switch")).toHaveText(["Has risks", "New", "Stale·1,234"]);
});

test("Copy details copies a grid record as labelled lines under their sections", async ({ page }) => {
  await open(page, grid);
  await page.evaluate("document.querySelector('.cx-host').canopyx.openDetails('p1')");
  const copy = page.locator(".cx-drawer .cx-drawer-copy");
  await expect(copy).toHaveAttribute("aria-label", "Copy details");
  await copy.click();
  await expect(page.locator(".cx-drawer [role=status]")).toHaveText("Details copied");
  const text = await page.evaluate(() => window.copied[0]);
  expect(text.split("\n")).toEqual(["Ada Lovelace", "", "Details", "Name: Ada Lovelace", "", "Contact", "Mail: ada@example.test", "", "Activity",
    expect.stringMatching(/^Last seen: .*2026/), "Score: 7.5"]);
  // An empty field says so instead of leaving a dangling label.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".cx-drawer h4")).toHaveText("Ben");
  await copy.click();
  await expect.poll(() => page.evaluate(() => window.copied[1])).toContain("Mail: —");
});

test("Copy details copies a tree node and a record panel's fields", async ({ page }) => {
  await open(page, tree);
  await page.evaluate("document.querySelector('.cx-host').canopyx.expandPath(['a', 'a/1'])");
  await page.evaluate("document.querySelector('.cx-host').canopyx.openDetails('a/1')");
  await page.locator(".cx-drawer .cx-drawer-copy").click();
  await expect.poll(() => page.evaluate(() => window.copied[0])).toBe("Ada\n\nAccount\nStatus: Enabled\nLogons: 1,200");

  await page.unrouteAll();
  await open(page, definition());
  await page.evaluate("document.querySelector('.cx-host').canopyx.openDetails('c001')");
  await page.locator(".cx-drawer .cx-drawer-copy").click();
  const text = await page.evaluate(() => window.copied[0]);
  // Every tab's fields are in the text, each section once, with structured values flattened to one line.
  expect(text.split("\n")[0]).toBe(await page.locator(".cx-drawer h4").textContent());
  expect(text).toMatch(/\n\n[^\n]+\n[^\n:]+: /);
  expect(text).not.toContain("\t");
});

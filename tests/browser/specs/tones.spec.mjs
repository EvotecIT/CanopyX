// Tones are names. The stylesheet colours six of them; any other tone takes its colours from the host theme, through
// --cx-tone-<name> (text) and --cx-tone-<name>-bg (badge background), so a host can carry its own scale of states.
import { expect, test } from "@playwright/test";
import { nextFrames, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "tones", label: "Tones", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", width: 260, kind: "text" }, { id: "state", title: "State", width: 200, kind: "text" }],
  source: { kind: "inline" },
  roots: [
    { id: "critical", label: "Critical", badges: [{ text: "Critical", tone: "critical" }, { text: "Planned", tone: "maintenance" }], cells: { state: { value: "down", tone: "critical" } } },
    { id: "built-in", label: "Built in", badges: [{ text: "ok", tone: "success" }], cells: { state: { value: "fine", tone: "success" } } },
    { id: "unthemed", label: "Unthemed", cells: { state: { value: "plain", tone: "no-colour-in-theme" } } },
    { id: "malformed", label: "Malformed", cells: { state: { value: "odd", tone: "Red alert" } } },
    { id: "open", label: "Open", expanded: true, children: [{ id: "open/detail", label: "Detail",
      detail: { type: "table", columns: ["Severity"], rows: [[{ value: "High", tone: "high", badges: [{ text: "new", tone: "high" }] }]] } }] }
  ] };
// What a host theme adds next to canopyx.css. "maintenance" has no background of its own, so its badge gets a tint.
const theme = ".cx-host { --cx-tone-critical: rgb(150, 20, 30); --cx-tone-critical-bg: rgb(255, 230, 232); --cx-tone-high: rgb(160, 80, 0);"
  + " --cx-tone-maintenance: rgb(60, 60, 140); }";

async function open(page) {
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view).replace("</style>", theme + "</style>") }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

const style = (locator, property) => locator.evaluate((element, name) => getComputedStyle(element)[name], property);
const stateCell = (page, id) => page.locator('[data-cx-id="' + id + '"] [aria-colindex="2"]');

test("a host tone takes its text and badge colours from the theme", async ({ page }) => {
  await open(page);
  const cell = stateCell(page, "critical");
  await expect(cell).toHaveClass(/cx-tone-critical cx-toned/);
  expect(await style(cell, "color")).toBe("rgb(150, 20, 30)");
  const badge = page.locator('[data-cx-id="critical"] .cx-badge.cx-tone-critical');
  expect(await style(badge, "color")).toBe("rgb(150, 20, 30)");
  expect(await style(badge, "backgroundColor")).toBe("rgb(255, 230, 232)");
  // Without a background in the theme, the badge gets a tint of its text colour instead of the surface.
  const planned = page.locator('[data-cx-id="critical"] .cx-badge.cx-tone-maintenance');
  expect(await style(planned, "color")).toBe("rgb(60, 60, 140)");
  const surface = await style(page.locator(".cx-grid"), "backgroundColor");
  expect([surface, "rgba(0, 0, 0, 0)"]).not.toContain(await style(planned, "backgroundColor"));
  // A detail table is toned the same way.
  const detail = page.locator('[data-cx-id="open/detail"] td');
  expect(await style(detail, "color")).toBe("rgb(160, 80, 0)");
  expect(await style(detail.locator(".cx-badge"), "color")).toBe("rgb(160, 80, 0)");
});

test("the six shipped tones, an unthemed tone, and a malformed tone keep working as text", async ({ page }) => {
  await open(page);
  const text = await style(stateCell(page, "malformed"), "color");
  await expect(stateCell(page, "built-in")).toHaveClass(/cx-tone-success/);
  await expect(stateCell(page, "built-in")).not.toHaveClass(/cx-toned/);
  expect(await style(stateCell(page, "built-in"), "color")).not.toBe(text);
  // A tone the theme has no colour for reads as normal text; a tone that is not a name adds no class at all.
  await expect(stateCell(page, "unthemed")).toHaveClass(/cx-tone-no-colour-in-theme cx-toned/);
  expect(await style(stateCell(page, "unthemed"), "color")).toBe(text);
  await expect(stateCell(page, "malformed")).not.toHaveClass(/cx-tone|alert/);
  await expect(stateCell(page, "malformed")).toHaveText("odd");
});

test("a cell that changes from a host tone to a shipped one drops the host colours", async ({ page }) => {
  await open(page);
  const cell = stateCell(page, "critical");
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.applyCounts({ protocol: "canopyx/1", type: "counts",
    items: [{ id: "critical", cells: { state: { value: "recovered", tone: "success" } } }] }));
  await nextFrames(page);
  await expect(cell).toHaveText("recovered");
  await expect(cell).not.toHaveClass(/cx-toned/);
  expect(await cell.evaluate((element) => element.style.getPropertyValue("--cx-t"))).toBe("");
  expect(await style(cell, "color")).toBe(await style(stateCell(page, "built-in"), "color"));
});

test("CanopyX.badge draws a badge in a host renderer as the grid draws one, host tones included", async ({ page }) => {
  await open(page);
  // The renderer draws the node's own badges with the exported helper into the state column.
  await page.evaluate(() => {
    const host = document.querySelector(".cx-host");
    const data = host.canopyx.view;
    host.canopyx.destroy();
    window.api = CanopyX.createTreeGrid(host, { view: data, renderers: { state(node, element) {
      if (!node.badges) return false;
      node.badges.forEach((badge) => element.appendChild(CanopyX.badge(Object.assign({ title: "from the host" }, badge))));
      return true;
    } } });
    return window.api.ready;
  });
  await nextFrames(page);
  const look = (locator) => locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { className: element.className, text: element.textContent, color: computed.color, background: computed.backgroundColor,
      radius: computed.borderRadius, padding: computed.padding, font: computed.fontSize };
  });
  for (const tone of ["critical", "maintenance"]) {
    const drawn = page.locator('[data-cx-id="critical"] [aria-colindex="2"] .cx-badge.cx-tone-' + tone);
    const painted = page.locator('[data-cx-id="critical"] [aria-colindex="1"] .cx-badge.cx-tone-' + tone);
    expect(await look(drawn)).toEqual(await look(painted));
    await expect(drawn).toHaveAttribute("title", "from the host");
  }
  expect(await look(page.locator('[data-cx-id="built-in"] [aria-colindex="2"] .cx-badge'))).toEqual(await look(page.locator('[data-cx-id="built-in"] [aria-colindex="1"] .cx-badge')));
  // A badge without a tone is neutral, and a badge without text is a mistake the host hears about at once.
  expect(await page.evaluate(() => CanopyX.badge({ text: "plain" }).className)).toBe("cx-badge cx-tone-neutral");
  expect(await page.evaluate(() => { try { CanopyX.badge({ tone: "success" }); return null; } catch (e) { return e.message; } })).toContain("badge needs");
});

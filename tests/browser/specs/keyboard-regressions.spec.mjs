import { expect, test } from "@playwright/test";
import { focusedId, nextFrames, viewPage } from "./support.mjs";

async function open(page, roots) {
  const view = { protocol: "canopyx/1", type: "view", id: "keyboard", label: "Keyboard", rowHeight: 28, pageSize: 100,
    columns: [{ id: "name", title: "Name", width: 300, kind: "text", sortable: true }], source: { kind: "inline" }, roots };
  await page.route("https://canopyx.test/", r => r.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  await nextFrames(page);
}

test("hiding a focused child transfers focus to its visible ancestor without stealing toolbar focus", async ({ page }) => {
  await open(page, [{ id: "parent", label: "Parent", expanded: true, children: [{ id: "child", label: "Child" }] }]);
  await page.locator('[data-cx-id="child"]').focus();
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setState({ expanded: [] }));
  await nextFrames(page);
  expect(await focusedId(page)).toBe("parent");
  await page.getByRole("button", { name: "Name", exact: true }).focus();
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setFilter(() => false));
  await nextFrames(page);
  await expect(page.getByRole("button", { name: "Name", exact: true })).toBeFocused();
});

test("hiding a focused show-more row transfers focus to its ancestor", async ({ page }) => {
  await open(page, [{ id: "parent", label: "Parent", expanded: true, children: Array.from({ length: 110 }, (_, i) => ({ id: "c" + i, label: "Child" })) }]);
  await page.locator(".cx-grid").evaluate(grid => grid.scrollTop = grid.scrollHeight);
  await nextFrames(page);
  await page.locator("[data-cx-status=more]").focus();
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setState({ expanded: [] }));
  await nextFrames(page);
  expect(await focusedId(page)).toBe("parent");
});

test("filtering the last focused row leaves an accessible grid focus target", async ({ page }) => {
  await open(page, [{ id: "only", label: "Only" }]);
  await page.locator('[data-cx-id="only"]').focus();
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.setFilter(() => false));
  await nextFrames(page);
  await expect(page.getByRole("treegrid")).toBeFocused();
});

test("keyboard resizing updates widths and retains its control through header rebuilding", async ({ page }) => {
  await open(page, [{ id: "row", label: "Row" }]);
  const resize = page.getByRole("separator", { name: "Resize Name" });
  await resize.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".cx-hcell")).toHaveCSS("width", "310px");
  await expect(resize).toHaveAttribute("aria-valuetext", "310 pixels");
  await page.evaluate(() => document.querySelector(".cx-host").canopyx.sort("name", "asc"));
  await expect(resize).toBeFocused();
  await page.screenshot({ path: "../../artifacts/takeover/resize-wide.png" });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.screenshot({ path: "../../artifacts/takeover/resize-compact.png" });
  await page.keyboard.press("Home");
  await expect(page.locator(".cx-hcell")).toHaveCSS("width", "40px");
});

test("page navigation uses detail-row pixel geometry", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 400 });
  await open(page, [{ id: "start", label: "Start" }, { id: "detail", label: "Detail", detail: { kind: "html", height: 8, html: "Detail" } },
    ...Array.from({ length: 20 }, (_, i) => ({ id: "n" + i, label: "Node " + i }))]);
  await page.locator('[data-cx-id="start"]').focus();
  const expected = await page.evaluate(() => {
    const grid = document.querySelector(".cx-grid");
    const distance = grid.clientHeight - document.querySelector(".cx-head").offsetHeight - 28;
    return distance < 252 ? "detail" : "n" + Math.floor((distance - 252) / 28);
  });
  await page.keyboard.press("PageDown");
  expect(await focusedId(page)).toBe(expected);
  await page.keyboard.press("PageUp");
  expect(await focusedId(page)).toBe("start");
});

for (const theme of ["dark", "auto"]) {
  test(`print resets semantic tones on a white page (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, [{ id: "tone", label: "Tone", cells: { name: { value: "Danger", tone: "danger" } }, badges: [{ text: "Warning", tone: "warning" }] }]);
    await page.locator(".cx-host").evaluate((host, theme) => host.setAttribute("data-cx-theme", theme), theme);
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    await expect(page.locator(".cx-outline .cx-tone-danger")).toHaveCSS("color", "rgb(179, 38, 30)");
    await expect(page.locator(".cx-host")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.screenshot({ path: `../../artifacts/takeover/print-${theme}.png`, fullPage: true });
  });
}

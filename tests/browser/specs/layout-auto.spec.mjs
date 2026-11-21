// The automatic layout (docs/layout-modes.md): cards while the view's host is narrower than cardsBelow, the wide layout
// otherwise, following the host's own width (a narrow panel on a wide window gets cards) until the reader picks a layout.
import { test, expect } from "@playwright/test";
import { runtimeAssets, nextFrames } from "./support.mjs";

test.use({ viewport: { width: 1200, height: 800 } });

const view = layout => ({ protocol: "canopyx/2", type: "grid", id: "orders", label: "Orders", rowHeight: 32, pageSize: 50, selection: "none", search: true,
  source: { kind: "inline" }, layout, columns: [{ id: "name", title: "Name", kind: "text", rowHeader: true, sortable: true }, { id: "owner", title: "Owner", kind: "text" },
    { id: "amount", title: "Amount", kind: "number" }],
  rows: Array.from({ length: 12 }, (_, i) => ({ id: "o" + i, cells: { name: "Order " + i, owner: "Owner " + i, amount: i } })) });

async function open(page, layout, width) {
  const { script, style } = runtimeAssets("grid");
  page.errors = []; page.on("pageerror", error => page.errors.push(error.message));
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Auto layout</title><style>${style}</style><script>${script}</script></head><body>` +
    `<div id="panel" style="width:${width}px"><div class="cx-host" data-canopyx-host data-cx-height="480px"><script type="application/json" class="cx-config">` +
    JSON.stringify(view(layout)).replace(/</g, "\\u003c") + "</script></div></div></body></html>";
  await page.route("http://canopyx.test/auto", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto("http://canopyx.test/auto");
  await page.waitForSelector("[data-cx-ready]");
}
const host = page => page.locator("[data-canopyx-host]");
const layout = page => page.evaluate(() => { const { mode, active } = document.querySelector("[data-canopyx-host]").canopyx.getLayout(); return mode + ":" + active; });
const resize = (page, width) => page.locator("#panel").evaluate((panel, value) => { panel.style.width = value + "px"; }, width);

test("a narrow panel shows cards and a wide one the wide layout, switching as the panel resizes", async ({ page }) => {
  await open(page, { mode: "auto", cardsBelow: 600, wide: "scroll" }, 480);
  await expect(host(page)).toHaveAttribute("data-cx-layout", "cards");
  expect(await layout(page)).toBe("auto:cards");
  await page.evaluate(() => { window.layouts = []; document.querySelector("[data-canopyx-host]").addEventListener("canopyx:layout", event => window.layouts.push(event.detail.mode + ":" + event.detail.active)); });
  await resize(page, 900);
  await expect(host(page)).toHaveAttribute("data-cx-layout", "scroll");
  await expect.poll(() => layout(page)).toBe("auto:scroll");
  await resize(page, 400);
  await expect(host(page)).toHaveAttribute("data-cx-layout", "cards");
  expect(await page.evaluate(() => window.layouts)).toEqual(["auto:scroll", "auto:cards"]);
  // The saved choice stays automatic, so a restored view keeps following its panel.
  expect(await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.getState().layout.mode)).toBe("auto");
  expect(page.errors).toEqual([]);
});

test("the reader's own choice stops the switching until Automatic is chosen again", async ({ page }) => {
  await open(page, { mode: "auto" }, 900);
  await expect(host(page)).not.toHaveAttribute("data-cx-layout", /./);
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setLayout({ mode: "fit" }));
  await resize(page, 400);
  // The observer answers on the next frame; two frames later the layout has had its chance to switch.
  await nextFrames(page); await nextFrames(page);
  await expect(host(page)).not.toHaveAttribute("data-cx-layout", /./);
  expect(await layout(page)).toBe("fit:fit");
  await page.evaluate(() => document.querySelector("[data-canopyx-host]").canopyx.setLayout({ mode: "auto" }));
  await expect(host(page)).toHaveAttribute("data-cx-layout", "cards");
  await page.locator(".cx-grid-layout summary").click();
  await expect(page.getByRole("radio", { name: "Automatic" })).toBeChecked();
});

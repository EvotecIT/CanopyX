import { test, expect } from "@playwright/test";
import { api, definition, drawer } from "./record-panel-fixtures.mjs";
import { settleOverlayMotion, viewPage } from "./support.mjs";

for (const width of [1440, 390]) for (const chrome of ["panel", "embedded"]) {
  test(`record evidence fills the viewport with ${chrome} chrome at ${width}px`, async ({ page }) => {
    const height = width === 390 ? 844 : 900;
    await page.setViewportSize({ width, height });
    const view = definition();
    view.record.tabs = chrome === "embedded" ? [] : [{ id: "evidence", label: "Evidence", sections: view.record.sections.map(section => section.id) }];
    // An embedded view lives in an ordinary host page, without standalone cx-page viewport sizing.
    const html = viewPage(view).replace('<body class="cx-page">', '<body><main><h1>Records</h1><section>')
      .replace('data-canopyx-host data-cx-theme', `data-canopyx-host data-cx-chrome="${chrome}" style="height:320px" data-cx-theme`)
      .replace('</head>', '<script>window.reviewed=0;CanopyX.configure("certificates",{recordActions:[{label:"Review evidence",prominent:true,run(){window.reviewed++}}]});</script></head>')
      .replace('</body>', '</section></main></body>');
    await page.route("http://canopyx.test/embedded-records", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://canopyx.test/embedded-records");
    await page.waitForSelector("[data-cx-ready]");
    await page.evaluate(api + ".ready");
    await page.evaluate(api + ".openDetails('c001')");
    const sheet = drawer(page);
    await expect(sheet).toBeVisible();
    await settleOverlayMotion(sheet);
    const geometry = await sheet.evaluate(dialog => {
      const body = dialog.querySelector(".cx-drawer-body"), style = getComputedStyle(dialog);
      const chrome = [...dialog.children].filter(element => element !== body && getComputedStyle(element).display !== "none")
        .reduce((sum, element) => { const style = getComputedStyle(element); return sum + element.getBoundingClientRect().height
          + parseFloat(style.marginTop) + parseFloat(style.marginBottom); }, 0);
      return { viewport: innerHeight, sheet: dialog.getBoundingClientRect().height, body: body.getBoundingClientRect().height,
        border: parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom), chrome, evidence: body.scrollHeight,
        width: dialog.getBoundingClientRect().width };
    });
    expect(geometry.sheet).toBeGreaterThanOrEqual(height - 2);
    expect(geometry.body).toBeGreaterThanOrEqual(height - geometry.chrome - geometry.border - 2);
    expect(geometry.evidence).toBeGreaterThan(geometry.body);
    if (width === 390) expect(geometry.width).toBeGreaterThanOrEqual(width - 2);
    const body = sheet.locator(".cx-drawer-body");
    await body.hover(); await page.mouse.wheel(0, 1200);
    await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(sheet.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
    const action = sheet.getByRole("button", { name: "Review evidence", exact: true });
    await expect(action).toBeInViewport();
    await action.click();
    expect(await page.evaluate(() => window.reviewed)).toBe(1);
  });
}

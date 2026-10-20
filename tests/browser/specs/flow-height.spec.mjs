import { test, expect } from "@playwright/test";
import { openFlow } from "./flow-support.mjs";

for (const name of ["inline", "nonce"]) test(`an explicit 600px height wins with the ${name} writer path`, async ({ page }) => {
  await openFlow(page, `flow-height/${name}-600.html`);
  const host = page.locator("[data-canopyx-host]");
  await expect(host).toHaveCSS("height", "600px");
  if (name === "nonce") {
    await expect(host).toHaveAttribute("data-cx-height", "600px");
    expect(await host.getAttribute("style")).toBeNull();
    expect(await page.locator('style[nonce]').evaluateAll(styles => styles.some(style => style.nonce === "flow-height-example" && style.textContent.includes('[data-cx-height="600px"]')))).toBe(true);
    // The generated selector also works in a host that does not apply a nonce policy.
    await page.locator('style[nonce]').evaluateAll(styles => styles.forEach(style => style.removeAttribute("nonce")));
    await expect(host).toHaveCSS("height", "600px");
  }
});

for (const name of ["inline", "nonce"]) test(`without Height the ${name} flow host grows with its content`, async ({ page }) => {
  await openFlow(page, `flow-height/${name}-auto.html`);
  const host = page.locator("[data-canopyx-host]");
  expect(await host.getAttribute("data-cx-height")).toBeNull();
  const before = await host.evaluate(element => element.getBoundingClientRect().height);
  await host.locator("textarea").evaluate(element => { element.style.height = "800px"; });
  await expect.poll(() => host.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(before + 300);
});

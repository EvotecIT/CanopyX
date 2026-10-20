import { test, expect } from "@playwright/test";
import { mountContract as mount } from "./flow-contract-support.mjs";

for (const type of ["list", "multiChoice"]) for (const initial of [{}, { items: null }]) test(`an ${Object.hasOwn(initial, "items") ? "explicit null" : "omitted"} edit ${type} stays empty and unchanged through focus`, async ({ page }) => {
  await mount(page, [{ id: "items", type, label: "Items", path: "items", default: ["a"],
    ...(type === "multiChoice" ? { options: [{ value: "a", label: "A" }] } : {})
  }], "({onSubmit:detail=>{window.__proposal=detail;return {status:'saved'};}})", initial);
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({ items: null });
  const input = page.locator('.cx-flow-stage [data-cx-field="items"] input').first();
  await input.press("Tab");
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({ items: null });
  expect(await page.evaluate(() => window.__api.isDirty())).toBe(false);
  await page.evaluate(() => window.__api.submit());
  expect(await page.evaluate(() => window.__proposal.patch)).toEqual([]);
  await page.evaluate(() => window.__api.reset());
  if (type === "list") { await input.fill("a"); await input.press("Tab"); }
  else await input.check();
  expect(await page.evaluate(() => window.__api.getValues())).toEqual({ items: ["a"] });
  await page.evaluate(() => window.__api.submit());
  expect(await page.evaluate(() => window.__proposal.patch)).toEqual([{ op: "add", path: "/items", value: ["a"] }]);
});

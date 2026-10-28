import { test, expect } from "@playwright/test";
import { openExample, settleOverlayMotion } from "./support.mjs";

const drawer = page => page.locator("dialog.cx-drawer");

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("phones: the record panel is a full-screen sheet with a scrolling tab bar, cards for collections and large targets", async ({ page }) => {
  await openExample(page, "certificate-inventory.html");
  await page.locator('.cx-row[data-cx-id="cert-0004"]').tap();
  const dialog = drawer(page);
  await expect(dialog).toHaveClass(/cx-phone/);
  await settleOverlayMotion(dialog);
  const box = await dialog.boundingBox();
  expect(box.width).toBeCloseTo(390, 1); expect(box.height).toBeCloseTo(844, 1);
  expect(box.x).toBeCloseTo(0, 1); expect(box.y).toBeCloseTo(0, 1);
  const tabs = dialog.getByRole("tablist");
  expect(await tabs.evaluate(list => list.scrollWidth > list.clientWidth && getComputedStyle(list).overflowX)).toBe("auto");
  // Firefox may report a CSS44px target a few millionths below44 in viewport coordinates.
  for (const target of await dialog.locator(".cx-record-tab, .cx-record-menu-btn, .cx-record-toggle").all())
    expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44 - 0.01);
  // Collections are cards: one per contact, the role as its title.
  await expect(dialog.locator('.cx-record-block-b[data-cx-field="contacts"] .cx-record-card')).toHaveCount(4);
  await expect(dialog.locator('.cx-record-block-b[data-cx-field="contacts"] .cx-record-card-title').first()).toHaveText("Owner");
  await expect(dialog.locator(".cx-record-nested")).toHaveCount(0);
  // The last tab scrolls into reach and works by touch.
  await dialog.getByRole("tab", { name: "Related" }).tap();
  const card = dialog.locator('.cx-record-block-b[data-cx-field="chain"] .cx-record-card').first();
  await expect(card.locator(".cx-record-link")).toHaveText("app1.example.com");
  await card.locator(".cx-record-link").tap();
  await expect(dialog.locator("h4")).toHaveText("app1.example.com");
  // Only Back shows on phones, not the breadcrumbs.
  await expect(dialog.locator(".cx-record-back")).toBeVisible();
  await expect(dialog.locator(".cx-record-crumbs")).toBeHidden();
  // No horizontal scroll inside the sheet.
  expect(await dialog.locator(".cx-drawer-body").evaluate(body => body.scrollWidth <= body.clientWidth + 1)).toBe(true);
});

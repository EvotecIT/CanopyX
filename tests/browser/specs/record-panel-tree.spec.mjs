import { test, expect } from "@playwright/test";
import { openExample, viewPage } from "./support.mjs";

const api = "document.querySelector('[data-canopyx-host]').canopyx";
const drawer = page => page.locator("dialog.cx-drawer");

test("tree parity: the tree drawer has the record panel with its summary, sections, structured values and links", async ({ page }) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await openExample(page, "certificate-tree.html");
  await page.evaluate(api + ".openDetails('tree-cert-0004')");
  const dialog = drawer(page);
  await expect(dialog.locator("h4")).toHaveText("app4.example.com");
  await expect(dialog.locator(".cx-record-status .cx-tone-danger")).toHaveText("Expired");
  await expect(dialog.locator(".cx-record-fact dt")).toHaveText(["Days left"]);
  await expect(dialog.locator('dd[data-cx-field="names"] .cx-record-chip')).toHaveCount(6);
  await expect(dialog.locator('.cx-record-block-b[data-cx-field="contacts"] .cx-row[data-cx-id]')).toHaveCount(4);
  await expect(dialog.locator('.cx-record-block-b[data-cx-field="timeline"] .cx-timeline-item')).toHaveCount(4);
  // A link to another node opens it in place; Back returns.
  await dialog.getByRole("button", { name: /app7\.example\.com/ }).click();
  await expect(drawer(page).locator("h4")).toHaveText("app7.example.com");
  await expect(drawer(page).getByRole("button", { name: "Back to app4.example.com" })).toBeVisible();
  // The deep link names the node's id path.
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toBe("#record=certificate-tree:issuer-1/tree-cert-0007");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(drawer(page).locator("h4")).toHaveText("app4.example.com");
  expect(errors).toEqual([]);
});

test("tree deep links expand the path and open the drawer", async ({ page }) => {
  await openExample(page, "certificate-tree.html", "#record=certificate-tree:issuer-2/tree-cert-0011");
  await expect(drawer(page).locator("h4")).toHaveText("app11.example.com");
});

// A tree without a record panel keeps its plain drawer, now with sections, tones and badges, and drawer: false.
const plain = {
  protocol: "canopyx/2", type: "view", id: "plain-tree", label: "Plain tree", rowHeight: 28, pageSize: 100, selection: "single",
  columns: [{ id: "name", title: "Name", kind: "text", width: 200 }, { id: "state", title: "State", kind: "text", width: 120, section: "Health" },
    { id: "owner", title: "Owner", kind: "text", width: 120 }, { id: "internal", title: "Internal", kind: "text", width: 120, drawer: false }],
  source: { kind: "inline" },
  roots: [{ id: "a", label: "Alpha", cells: { state: { value: "Failing", tone: "danger", badges: [{ text: "new", tone: "info" }] }, owner: "Team A", internal: "x" } }]
};

test("the plain tree drawer keeps tones, badges and sections, and an onDetails hook replaces it", async ({ page }) => {
  await page.route("http://canopyx.test/tree.html", route => route.fulfill({ contentType: "text/html", body: viewPage(plain) }));
  await page.goto("http://canopyx.test/tree.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
  await page.evaluate(api + ".openDetails('a')");
  await expect(drawer(page).locator(".cx-drawer-s")).toHaveText(["Health", "Details"]);
  await expect(drawer(page).locator('dd[data-cx-field="state"] .cx-tone-danger')).toHaveText("Failing");
  await expect(drawer(page).locator('dd[data-cx-field="state"] .cx-badge')).toHaveText("new");
  await expect(drawer(page).locator('[data-cx-field="internal"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  const hooked = viewPage(plain).replace("<body class=\"cx-page\">", "<body class=\"cx-page\"><script>CanopyX.configure(\"plain-tree\", { onDetails: ({ node }) => { window.details = node.label; } });</script>");
  await page.route("http://canopyx.test/tree2.html", route => route.fulfill({ contentType: "text/html", body: hooked }));
  await page.goto("http://canopyx.test/tree2.html");
  await page.waitForSelector("[data-cx-ready]");
  await page.evaluate(api + ".ready");
  await page.evaluate(api + ".openDetails('a')");
  expect(await page.evaluate("window.details")).toBe("Alpha");
  await expect(drawer(page)).toHaveCount(0);
});

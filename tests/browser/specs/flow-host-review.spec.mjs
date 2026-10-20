// The review page's host extras, presets, drafts and deep links (docs/flow.md): the preview, the equivalent command with its
// variants, the JSON patch and Copy; presets with "changed" marks; a session draft that resumes, warns when the settings
// changed since, starts again, and never keeps a secret; and an address that names the open step.
import { test, expect } from "@playwright/test";
import { openFlow, flowCall, field, next, stepTitle } from "./flow-support.mjs";
import { exampleUrl } from "./support.mjs";

/** Walks the mail-checks flow to its review page; each step's required check runs on Next. */
async function toReview(page) {
  await next(page);
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
  await next(page);
  await expect(stepTitle(page)).toHaveText("Where does the mail go?");
  await expect(field(page, "relay").locator(".cx-flow-loading")).toBeHidden();
  await next(page);
  await expect(stepTitle(page)).toHaveText("Check your answers");
}

test("the review page shows the host's preview, the command with its variant and the patch, and copies them", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openFlow(page, "flow-mail-checks.html");
  await field(page, "host").locator("input").fill("smtp2.example.com");
  await toReview(page);
  const preview = page.locator(".cx-flow-preview");
  await expect(preview.locator(".cx-flow-answer").first()).toContainText("Immediately, without a restart");
  await expect(preview.locator(".cx-flow-tone-success")).toHaveText("Immediately, without a restart");
  await expect(preview.locator(".cx-flow-preview-note")).toHaveText("A test message goes to ops@example.com after saving.");

  const command = page.locator(".cx-flow-command");
  await command.locator("summary").click();
  await expect(command.getByRole("tab")).toHaveText(["Command", "C#", "JSON patch"]);
  await expect(command.locator(".cx-flow-code")).toHaveText("Set-MailServer -Server smtp2.example.com");
  await command.getByRole("tab", { name: "Command" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(command.getByRole("tab", { name: "C#" })).toHaveAttribute("aria-selected", "true");
  await expect(command.locator(".cx-flow-code")).toContainText("Server = \"smtp2.example.com\"");
  await command.getByRole("tab", { name: "JSON patch" }).click();
  expect(JSON.parse(await command.locator(".cx-flow-code").textContent())).toEqual([{ op: "replace", path: "/mail/host", value: "smtp2.example.com" }]);
  if (browserName === "chromium") {
    await command.getByRole("button", { name: "Copy" }).click();
    await expect(command.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("/mail/host");
  }
});

test("a check on the review page runs again in place, keeping the reader and focus on the review page", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await toReview(page);
  const checks = page.locator(".cx-flow-review-checks");
  const row = checks.locator(".cx-flow-answer").filter({ hasText: "Test the connection" });
  await expect(row).toHaveAttribute("data-cx-state", "pass");
  // A check is no answer: its row offers Run again, never Change.
  await expect(checks.getByRole("button", { name: /^Change/ })).toHaveCount(0);
  await flowCall(page, "setValues", { host: "other.example.com" });
  await expect(row).toHaveAttribute("data-cx-state", "stale");
  const again = page.getByRole("button", { name: "Run “Test the connection” again" });
  await expect(again).toHaveText("Run again");
  // From the keyboard (WebKit does not focus a clicked button): the repainted rows keep focus on the same check's button.
  await again.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("data-cx-state", "pass");
  await expect(stepTitle(page)).toHaveText("Check your answers");
  expect(await page.evaluate(() => document.activeElement?.dataset.cxCheck)).toBe("connection");
  // The page checked itself again after the run: its status line has an answer, not the ellipsis of a running check.
  await expect(page.locator(".cx-flow-stage .cx-flow-banner").first()).not.toHaveText("…");
});
test("a preset sets its answers, edits after it carry a changed mark, and the review and proposal name it", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await page.evaluate(() => document.addEventListener("canopyx:flowSubmit", event => { window.__preset = event.detail.preset; }, { capture: true }));
  await page.getByLabel("Start from").selectOption({ label: "Office relay" });
  await expect(field(page, "host").locator("input")).toHaveValue("relay.office.example.com");
  await expect(field(page, "port").locator("input")).toHaveValue("25");
  await expect(page.locator(".cx-flow-mark-changed")).toHaveCount(0);
  await field(page, "host").locator("input").fill("relay2.office.example.com");
  await expect(field(page, "host").locator(".cx-flow-mark-changed")).toHaveText("Changed");
  await expect(field(page, "port").locator(".cx-flow-mark-changed")).toHaveCount(0);
  await toReview(page);
  await expect(page.locator(".cx-flow-preset-line")).toHaveText("Based on Office relay, 1 change");
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-result")).toBeVisible();
  expect(await page.evaluate(() => window.__preset)).toBe("office");
});

test("a session draft resumes, warns when the settings changed since, starts again, and never keeps a secret", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await field(page, "host").locator("input").fill("draft.example.com");
  await next(page);
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
  await field(page, "password").locator("input").fill("Draft-secret-77");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator(".cx-flow-draft-note")).toHaveText("Draft saved");
  const stored = await page.evaluate(() => sessionStorage.getItem("canopyx:flow-draft:mail-connect"));
  expect(stored).not.toContain("Draft-secret-77");
  expect(JSON.parse(stored)).toMatchObject({ kind: "flowDraft", step: "sign-in", baseline: "rev-12", values: { host: "draft.example.com" } });

  await page.reload();
  await expect(page.locator(".cx-flow-resume")).toContainText("You have a draft saved");
  await expect(page.locator(".cx-flow-resume .cx-flow-banner-warn")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume where you left off" }).click();
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
  expect((await flowCall(page, "getValues")).host).toBe("draft.example.com");
  await expect(field(page, "password").locator("input")).toHaveValue("");

  await page.evaluate(() => { const draft = JSON.parse(sessionStorage.getItem("canopyx:flow-draft:mail-connect")); draft.baseline = "rev-11"; sessionStorage.setItem("canopyx:flow-draft:mail-connect", JSON.stringify(draft)); });
  await page.reload();
  await expect(page.locator(".cx-flow-resume .cx-flow-banner-warn")).toHaveText("The settings changed after this draft was saved.");
  await page.getByRole("button", { name: "Start again" }).click();
  await expect(page.locator(".cx-flow-resume")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("canopyx:flow-draft:mail-connect"))).toBeNull();
});

test("the address names the open step, and a link to a reachable step opens it", async ({ page }) => {
  await openFlow(page, "flow-mail-checks.html");
  await next(page);
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
  expect(await page.evaluate(() => location.hash)).toBe("#mail-connect/sign-in");
  await page.evaluate(() => { location.hash = "#mail-connect/server"; });
  await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
  await page.evaluate(() => { location.hash = "#mail-connect/sign-in"; });
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
  // Opening the page with a link opens that step when the steps before it hold valid answers (the edited settings do).
  await page.goto(exampleUrl("flow-mail-checks.html") + "#mail-connect/route");
  await expect(stepTitle(page)).toHaveText("Where does the mail go?");
  // A link past a step whose answers are missing opens that step instead.
  await flowCall(page, "setValues", { host: null });
  await page.evaluate(() => { location.hash = "#mail-connect/review"; });
  await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
  expect(await page.evaluate(() => location.href)).not.toContain("example.com/");
});

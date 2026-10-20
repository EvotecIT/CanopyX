// Flow behaviour (docs/flow.md): validation, navigation, conditions, the review page, the field types flows add, the
// events, edit mode with its proposal, and the host's answers. The pages come from CanopyX.Examples (flow-*.html).
import { test, expect } from "@playwright/test";
import { openFlow, flowCall, stepTitle, field, recordEvents, next, mailToReview, replaceFlow } from "./flow-support.mjs";

const rail = page => page.locator(".cx-flow-rail .cx-flow-mark");
const received = async page => JSON.parse((await page.locator("#flow-received").textContent()).split("\n\n")[0]);

test.describe("mail server flow", () => {
  test.beforeEach(async ({ page }) => openFlow(page, "flow-mail-server.html"));

  test("a required field blocks Next with a summary, aria-invalid and a described message", async ({ page }) => {
    await next(page);
    await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
    const summary = page.locator(".cx-flow-stage .cx-flow-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toHaveAttribute("role", "alert");
    await expect(summary).toContainText("Fix these before you continue");
    await expect(summary.getByRole("button", { name: "Server name is required." })).toBeVisible();
    const input = field(page, "host").locator("input");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    const described = (await input.getAttribute("aria-describedby")).split(" ");
    const message = field(page, "host").locator(".cx-flow-error");
    expect(described).toContain(await message.getAttribute("id"));
    expect(described).toContain(await field(page, "host").locator(".cx-flow-help:not(.cx-flow-hint)").getAttribute("id"));
    await expect(message).toHaveText("Server name is required.");
    // The summary link moves focus to the field; fixing it clears the message.
    await summary.getByRole("button", { name: "Server name is required." }).click();
    await expect(input).toBeFocused();
    await input.fill("smtp.example.com");
    await input.blur();
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
    await expect(message).toBeHidden();
  });

  test("Next and Back keep the answers", async ({ page }) => {
    await field(page, "host").locator("input").fill("smtp.example.com");
    await field(page, "port").locator("input").fill("2525");
    await next(page);
    await expect(stepTitle(page)).toHaveText("How should the certificate be checked?");
    await page.locator(".cx-flow-actions .cx-flow-back").click();
    await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
    await expect(field(page, "host").locator("input")).toHaveValue("smtp.example.com");
    await expect(field(page, "port").locator("input")).toHaveValue("2525");
    expect(await flowCall(page, "getValues")).toMatchObject({ host: "smtp.example.com", port: 2525, security: "starttls" });
  });

  test("a conditional step hides with its answers and the rail counts only visible steps", async ({ page }) => {
    await expect(rail(page)).toHaveCount(5);
    expect(Object.keys(await flowCall(page, "getValues"))).toEqual(expect.arrayContaining(["verify", "minimum"]));
    await field(page, "security").getByText("No encryption").click();
    await expect(rail(page)).toHaveCount(4);
    await expect(page.locator(".cx-flow-rail")).not.toContainText("How should the certificate be checked?");
    const values = await flowCall(page, "getValues");
    expect(values.security).toBe("none");
    expect(Object.keys(values)).not.toContain("verify");
    expect(Object.keys(values)).not.toContain("minimum");
    expect(Object.keys(values)).not.toContain("serverName");
    // The hidden answers stay: choosing a secure connection again brings them back.
    await field(page, "security").getByText("TLS from the start").click();
    await expect(rail(page)).toHaveCount(5);
    expect(await flowCall(page, "getValues")).toMatchObject({ verify: true, minimum: "1.2" });
  });

  test("a conditional section hides with its fields", async ({ page }) => {
    await field(page, "host").locator("input").fill("smtp.example.com");
    await next(page);
    await next(page);
    await expect(stepTitle(page)).toHaveText("How does it sign in?");
    const account = page.locator(".cx-flow-stage .cx-flow-section").filter({ hasText: "Account" });
    await expect(account).toBeVisible();
    await expect(account).toHaveAttribute("role", "group");
    await field(page, "auth").getByText("No sign-in").click();
    await expect(account).toBeHidden();
    const values = await flowCall(page, "getValues");
    expect(values.auth).toBe("none");
    expect(Object.keys(values)).not.toContain("user");
    // Without the section, Next no longer asks for the user name or the password.
    await next(page);
    await expect(stepTitle(page)).toHaveText("Who receives the mail?");
  });

  test("a linear flow locks later steps and goTo opens the first incomplete step", async ({ page }) => {
    const buttons = page.locator(".cx-flow-rail .cx-flow-mark-btn");
    await expect(buttons.nth(0)).toHaveAttribute("aria-current", "step");
    for (const index of [1, 2, 3, 4]) await expect(buttons.nth(index)).toHaveAttribute("aria-disabled", "true");
    // Playwright treats aria-disabled controls as disabled; the reader can still press them, and nothing happens.
    await buttons.nth(3).click({ force: true });
    await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
    await field(page, "host").locator("input").fill("smtp.example.com");
    await next(page);
    await expect(buttons.nth(0)).not.toHaveAttribute("aria-disabled", "true");
    await expect(buttons.nth(2)).toHaveAttribute("aria-disabled", "true");
    await page.locator(".cx-flow-actions .cx-flow-back").click();
    await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
    expect(await flowCall(page, "goTo", "recipients")).toBe(true);
    await expect(stepTitle(page)).toHaveText("How should the certificate be checked?");
    expect(await flowCall(page, "getStep")).toBe("tls");
  });

  test("Enter in a single-line field moves to the next step", async ({ page }) => {
    const input = field(page, "host").locator("input");
    await input.fill("smtp.example.com");
    await input.press("Enter");
    await expect(stepTitle(page)).toHaveText("How should the certificate be checked?");
    await expect(stepTitle(page)).toBeFocused();
  });

  test("Ctrl+Enter submits from the review page", async ({ page }) => {
    await mailToReview(page);
    await page.locator(".cx-flow-review .cx-flow-change").first().focus();
    await page.keyboard.press("Control+Enter");
    await expect(page.locator(".cx-flow-result")).toBeVisible();
    expect((await received(page)).values.host).toBe("smtp.example.com");
  });

  test("the review page has Change buttons that return to it, and says Not provided for empty answers", async ({ page }) => {
    await mailToReview(page);
    const change = page.getByRole("button", { name: "Change Server name" });
    await expect(change).toHaveText("Change");
    const serverName = page.locator(".cx-flow-answer").filter({ has: page.locator("dt", { hasText: "Expected certificate name" }) });
    await expect(serverName.locator(".cx-flow-now")).toHaveText("Not provided");
    await change.click();
    await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
    await expect(field(page, "host").locator("input")).toBeFocused();
    await field(page, "host").locator("input").fill("relay.example.com");
    await next(page);
    // Next returns straight to the review page, past the steps in between.
    await expect(stepTitle(page)).toHaveText("Check your answers");
    await expect(page.locator(".cx-flow-answer").filter({ has: page.locator("dt", { hasText: "Server name" }) }).locator(".cx-flow-now")).toHaveText("relay.example.com");
  });

  test("pasting several lines into a list makes rows, and an item rule marks only the bad rows", async ({ page }) => {
    await field(page, "host").locator("input").fill("smtp.example.com");
    await next(page); await next(page);
    await field(page, "user").locator("input").fill("alerts@example.com");
    await field(page, "password").locator("input").fill("Pa55word!");
    await next(page);
    const rows = field(page, "to").locator(".cx-flow-list-item input");
    await expect(rows).toHaveCount(1);
    await rows.first().evaluate(input => {
      const data = new DataTransfer();
      data.setData("text/plain", "a@example.com\nnot-an-address\r\n\nb@example.com\n");
      // Firefox drops the data of a constructed ClipboardEvent, so the event carries it as a property, as a real paste does.
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", { value: data });
      input.dispatchEvent(paste);
    });
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveValue("a@example.com");
    await expect(rows.nth(1)).toHaveValue("not-an-address");
    await expect(rows.nth(2)).toHaveValue("b@example.com");
    await expect(rows.nth(1)).toHaveAttribute("aria-label", "Recipients, item 2");
    expect((await flowCall(page, "getValues")).to).toEqual(["a@example.com", "not-an-address", "b@example.com"]);
    await next(page);
    await expect(stepTitle(page)).toHaveText("Who receives the mail?");
    await expect(field(page, "to").locator(".cx-flow-error")).toHaveText("“not-an-address” is not an email address.");
    await expect(rows.nth(1)).toHaveAttribute("aria-invalid", "true");
    await expect(rows.nth(0)).not.toHaveAttribute("aria-invalid", "true");
    await expect(rows.nth(2)).not.toHaveAttribute("aria-invalid", "true");
  });

  test("a duration writes ISO 8601 and reads as words on the review page", async ({ page }) => {
    const timeout = field(page, "timeout");
    await expect(timeout.locator(".cx-flow-amount")).toHaveValue("30");
    await expect(timeout.locator(".cx-flow-unit")).toHaveValue("seconds");
    expect((await flowCall(page, "getValues")).timeout).toBe("PT30S");
    await timeout.locator(".cx-flow-amount").fill("2");
    await timeout.locator(".cx-flow-unit").selectOption("minutes");
    expect((await flowCall(page, "getValues")).timeout).toBe("PT2M");
    await timeout.locator(".cx-flow-amount").fill("90");
    await timeout.locator(".cx-flow-unit").selectOption("seconds");
    expect((await flowCall(page, "getValues")).timeout).toBe("PT1M30S");
    await mailToReview(page);
    await expect(page.locator(".cx-flow-answer").filter({ has: page.locator("dt", { hasText: "Give up after" }) }).locator(".cx-flow-now")).toHaveText("90 seconds");
  });

  test("the flow raises its events, and cancelling flowStepChanging keeps the step", async ({ page }) => {
    const events = await recordEvents(page);
    await field(page, "host").locator("input").fill("smtp.example.com");
    await page.evaluate(() => document.addEventListener("canopyx:flowStepChanging", window.__cancelStep = event => event.preventDefault(), { once: true }));
    await next(page);
    await expect(stepTitle(page)).toHaveText("Which server sends the mail?");
    await next(page);
    await expect(stepTitle(page)).toHaveText("How should the certificate be checked?");
    let seen = await events();
    const changed = seen.find(entry => entry.name === "flowValueChanged" && entry.detail.field === "host" && entry.detail.value === "smtp.example.com");
    expect(changed.detail).toMatchObject({ field: "host", source: "edit" });
    expect(seen.filter(entry => entry.name === "flowStepChanging").map(entry => entry.detail)).toEqual([
      { from: "server", to: "tls", direction: "forward" }, { from: "server", to: "tls", direction: "forward" }]);
    expect(seen.filter(entry => entry.name === "flowStepChanged").map(entry => entry.detail)).toEqual([{ from: "server", to: "tls" }]);
    await page.locator(".cx-flow-actions .cx-flow-back").click();
    await field(page, "host").locator("input").press("Enter");
    await next(page);
    await field(page, "user").locator("input").fill("alerts@example.com");
    await field(page, "password").locator("input").fill("Pa55word!");
    await next(page);
    await field(page, "to").locator("input").first().fill("ops@example.com");
    await next(page);
    await expect(page.locator(".cx-flow-review .cx-flow-ready")).toBeVisible();
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-result")).toBeVisible();
    seen = await events();
    const submit = seen.find(entry => entry.name === "flowSubmit");
    expect(submit.detail).toMatchObject({ kind: "flowSubmission", flow: "mail-server", version: 1, mode: "create", secrets: { password: { state: "set" } } });
    expect(seen.find(entry => entry.name === "flowSubmitted").detail).toMatchObject({ status: "saved", message: "Mail settings saved. A test message is on its way to ops@example.com." });
    // A secret's change says only that it changed.
    const secret = seen.filter(entry => entry.name === "flowValueChanged" && entry.detail.field === "password");
    expect(secret.length).toBeGreaterThan(0);
    for (const entry of secret) expect(Object.keys(entry.detail).sort()).toEqual(["field", "source"]);
  });

  test("a submit nobody answers says that no host received the answers", async ({ page }) => {
    const small = { kind: "flow", version: 1, id: "lonely", title: "Lonely", mode: "free", steps: [
      { id: "one", title: "One", fields: [{ id: "name", type: "text", label: "Name" }] }, { id: "review", type: "review" }] };
    await replaceFlow(page, small, { isolate: true });
    await flowCall(page, "goTo", "review");
    await expect(stepTitle(page)).toHaveText("Check your answers");
    const answer = await flowCall(page, "submit");
    expect(answer).toEqual({ status: "error", message: "No host received the answers." });
    const banner = page.locator(".cx-flow-answer-banner");
    await expect(banner).toHaveAttribute("role", "alert");
    await expect(banner).toHaveText("No host received the answers.");
  });
});

test.describe("mail server flow at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the walkthrough, a required field and the submit work at 390 pixels", async ({ page }) => {
    await openFlow(page, "flow-mail-server.html");
    await expect(page.locator(".cx-flow-layout")).toHaveClass(/cx-flow-stack/);
    await next(page);
    await expect(page.locator(".cx-flow-stage .cx-flow-summary")).toContainText("Server name is required.");
    await mailToReview(page);
    await expect(page.getByRole("button", { name: "Change Server name" })).toBeVisible();
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-result")).toBeVisible();
    expect((await received(page)).values).toMatchObject({ host: "smtp.example.com", to: ["ops@example.com"] });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe("a flow without a review page", () => {
  test("shows the host's error on its last step", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await page.evaluate(() => { window.flowAnswer = () => ({ status: "error", message: "Pausing failed here." }); });
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    const banner = page.locator(".cx-flow [role=alert]").filter({ hasText: "Pausing failed here." });
    await expect(banner).toBeVisible();
    await expect(stepTitle(page)).toHaveText("For how long?");
  });

  test("says when no host received the answers", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    const doc = await page.evaluate(() => JSON.parse(document.querySelector("script.cx-config").textContent));
    await replaceFlow(page, doc, { isolate: true });
    expect(await flowCall(page, "submit")).toMatchObject({ status: "error", message: "No host received the answers." });
    await expect(page.locator(".cx-flow [role=alert]").filter({ hasText: "No host received the answers." })).toBeVisible();
  });
});

test.describe("multiple choice", () => {
  test("the selected count follows the check boxes, Select all and Clear", async ({ page }) => {
    await openFlow(page, "flow-schedule-report.html");
    const formats = field(page, "formats");
    const count = formats.locator(".cx-flow-count");
    await expect(count).toHaveText("1 of 5 selected");
    await expect(count).toHaveAttribute("aria-live", "polite");
    await formats.getByLabel("Excel").check();
    await expect(count).toHaveText("2 of 5 selected");
    await formats.getByRole("button", { name: "Select all" }).click();
    await expect(count).toHaveText("5 of 5 selected");
    expect((await flowCall(page, "getValues")).formats).toEqual(["pdf", "docx", "xlsx", "csv", "json"]);
    await formats.getByRole("button", { name: "Clear" }).click();
    await expect(count).toHaveText("0 of 5 selected");
    expect((await flowCall(page, "getValues")).formats).toEqual([]);
    await expect(formats.locator(".cx-flow-multi-group")).toHaveText(["Documents", "Data"]);
  });
});

test.describe("edit settings flow", () => {
  test.beforeEach(async ({ page }) => openFlow(page, "flow-edit-settings.html"));

  const answer = (page, value) => page.locator(`#flow-mock input[value="${value}"]`).check();
  const row = (page, label) => page.locator(".cx-flow-review .cx-flow-answer").filter({ has: page.locator("dt", { hasText: label }) });

  test("the review page shows only the changes by default, with what they were", async ({ page }) => {
    await field(page, "location").locator("input").fill("archive-two");
    await flowCall(page, "goTo", "review");
    await expect(stepTitle(page)).toHaveText("Check your answers");
    const toggle = page.getByRole("switch", { name: "Show changes only" });
    await expect(toggle).toBeChecked();
    await expect(page.locator(".cx-flow-review-tools .cx-flow-count")).toHaveText("Changed answers: 1");
    await expect(page.locator(".cx-flow-review .cx-flow-answer")).toHaveCount(1);
    await expect(row(page, "Location").locator(".cx-flow-now")).toHaveText("archive-two");
    await expect(row(page, "Location").locator(".cx-flow-was")).toHaveText("Was: records-archive");
    await toggle.uncheck();
    await expect(row(page, "Archive to")).toBeVisible();
    await expect(row(page, "Keep archives for").locator(".cx-flow-now")).toHaveText("90 days");
    await expect(row(page, "Access key").locator(".cx-flow-now")).toHaveText("Unchanged");
    expect(await page.locator(".cx-flow-review .cx-flow-answer").count()).toBeGreaterThan(5);
  });

  test("no changes say so on the review page", async ({ page }) => {
    await flowCall(page, "goTo", "review");
    await expect(page.locator(".cx-flow-review .cx-flow-none")).toHaveText("No answers have changed.");
  });

  test("the proposal carries edit mode, the baseline, the changes, a patch and the secret states", async ({ page }) => {
    await field(page, "location").locator("input").fill("archive-two");
    await field(page, "compress").locator("input").uncheck();
    await flowCall(page, "goTo", "retention");
    await field(page, "copies").locator("input").fill("");
    await flowCall(page, "goTo", "review");
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-result")).toBeVisible();
    const proposal = await received(page);
    expect(proposal).toMatchObject({ kind: "flowSubmission", flow: "archive-settings", version: 1, mode: "edit", baseline: "rev-41" });
    expect(proposal.secrets).toEqual({ accessKey: { state: "keep" } });
    expect(proposal.changes).toEqual([
      { field: "location", path: "archive.location", from: "records-archive", to: "archive-two" },
      { field: "compress", path: "archive.compress", from: true, to: false },
      { field: "copies", path: "archive.copies", from: 3, to: null }]);
    expect(proposal.patch).toEqual([
      { op: "replace", path: "/archive/location", value: "archive-two" },
      { op: "replace", path: "/archive/compress", value: false },
      { op: "remove", path: "/archive/copies" }]);
    expect(proposal.values.location).toBe("archive-two");
    expect(proposal.values).not.toHaveProperty("accessKey");
  });

  test("a typed secret is set, and a field without an initial value is added", async ({ page }) => {
    const doc = await page.evaluate(() => JSON.parse(document.querySelector("script.cx-config").textContent));
    // The same settings without a stored copy count: answering it adds the setting.
    delete doc.initial.copies;
    await replaceFlow(page, doc);
    await field(page, "accessKey").locator("input").fill("NEW-KEY-123");
    await flowCall(page, "setValues", { copies: 5 });
    await flowCall(page, "goTo", "review");
    await expect(row(page, "Access key").locator(".cx-flow-now")).toHaveText("Set");
    const events = await recordEvents(page);
    await page.evaluate(() => document.addEventListener("canopyx:flowSubmit", event => event.detail.respondWith({ status: "saved" }), { once: true }));
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-result")).toBeVisible();
    const proposal = (await events()).find(entry => entry.name === "flowSubmit").detail;
    expect(proposal.secrets).toEqual({ accessKey: { state: "set" } });
    expect(proposal.patch).toEqual([{ op: "add", path: "/archive/copies", value: 5 }]);
    expect(proposal.changes).toEqual([{ field: "copies", path: "archive.copies", from: null, to: 5 }]);
  });

  test("saved shows the result panel with a once row, and Start another resets the flow", async ({ page }) => {
    await field(page, "location").locator("input").fill("archive-two");
    await flowCall(page, "goTo", "review");
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    const panel = page.locator(".cx-flow-result");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(/Saved/);
    await expect(panel.getByRole("heading", { level: 3 })).toBeFocused();
    await expect(panel).toContainText("Archive settings saved: 1 changes.");
    const once = panel.locator(".cx-flow-once");
    await expect(once.locator("dt")).toHaveText("New access key");
    await expect(once.locator("output")).toHaveText("AK-7Q2M-91XD-4PLC");
    const copy = once.getByRole("button", { name: "Copy" });
    await expect(copy).toBeVisible();
    await expect(copy).toHaveAccessibleDescription("New access key");
    await expect(page.locator(".cx-flow-actions:not(.cx-flow-panel-actions)")).toBeHidden();
    // A value shown once is acknowledged before the panel that holds it can go.
    await expect(panel.getByRole("button", { name: "Start another" })).toBeDisabled();
    await once.getByRole("checkbox", { name: "I have saved it" }).check();
    await panel.getByRole("button", { name: "Start another" }).click();
    await expect(page.locator(".cx-flow-result")).toHaveCount(0);
    await expect(stepTitle(page)).toHaveText("Storage");
    await expect(field(page, "location").locator("input")).toHaveValue("records-archive");
    await expect(page.locator("output.cx-flow-result-value")).toHaveCount(0);
  });

  test("accepted shows progress the host moves, then the saved panel", async ({ page }) => {
    await answer(page, "accepted");
    await flowCall(page, "goTo", "review");
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    const progress = page.locator(".cx-flow-progress");
    await expect(progress).toBeVisible();
    await expect(progress.getByRole("heading", { level: 3 })).toHaveText(/In progress/);
    await expect(progress.locator(".cx-flow-panel-text")).toHaveText(/Rewriting archive [1-4] of 4\.|Existing archives are being rewritten/);
    await expect(progress.locator("progress")).toHaveAttribute("aria-valuetext", /[1-4] of 4/);
    await expect(page.locator(".cx-flow-result")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".cx-flow-result")).toContainText("every archive was rewritten");
  });

  test("error returns to the review page with the host's banner and field error", async ({ page }) => {
    await answer(page, "error");
    await flowCall(page, "goTo", "review");
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    const banner = page.locator(".cx-flow-answer-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "alert");
    await expect(banner).toHaveText("The location could not be reached.");
    await expect(banner).toBeFocused();
    await expect(stepTitle(page)).toHaveText("Check your answers");
    await page.getByRole("switch", { name: "Show changes only" }).uncheck();
    await expect(row(page, "Location").locator(".cx-flow-error")).toHaveText("Not reachable from the archive service.");
    await page.getByRole("button", { name: "Change Location" }).click();
    await expect(field(page, "location").locator(".cx-flow-error")).toHaveText("Not reachable from the archive service.");
    await expect(field(page, "location").locator("input")).toHaveAttribute("aria-invalid", "true");
  });

  test("conflict offers to reload the current settings", async ({ page }) => {
    await answer(page, "conflict");
    const events = await recordEvents(page);
    await flowCall(page, "goTo", "review");
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    const banner = page.locator(".cx-flow-answer-banner");
    await expect(banner).toContainText("Someone changed these settings after you opened them.");
    await banner.getByRole("button", { name: "Reload current settings" }).click();
    await expect(page.locator("#flow-received")).toHaveText("The host was asked to reload the current settings.");
    expect((await events()).filter(entry => entry.name === "flowReload").map(entry => entry.detail)).toEqual([{ baseline: "rev-41" }]);
  });
});

// Secrets never leak (docs/flow.md#secrets): a typed secret lives only in its input and in detail.secret(id) inside the submit
// handler, once. It is never in the DOM's markup, the values, the state, storage, the address, any event detail, the host's
// received JSON or the review page.
import { test, expect } from "@playwright/test";
import { openFlow, flowCall, field, recordEvents, mailToReview } from "./flow-support.mjs";

const SECRET = "Zq7-UNIQUE-secret-48151623";

test("a typed secret appears only in its input and, once, in the submit handler's accessor", async ({ page }) => {
  await openFlow(page, "flow-mail-server.html");
  const events = await recordEvents(page);
  // A second listener reads the accessor before the page's mock host does, twice, and again after the answer settles.
  await page.evaluate(() => {
    window.__secretReads = [];
    document.addEventListener("canopyx:flowSubmit", event => {
      const detail = event.detail;
      window.__secretReads.push(detail.secret("password"), detail.secret("password"), detail.secret("user"));
      window.__lateSecret = () => detail.secret("password");
    }, { capture: true, once: true });
  });
  await mailToReview(page, { password: SECRET });
  const leaks = async where => {
    const found = await page.evaluate(secret => {
      const places = {
        markup: document.documentElement.outerHTML,
        values: JSON.stringify(document.querySelector("[data-canopyx-host]").canopyx.getValues()),
        state: JSON.stringify(document.querySelector("[data-canopyx-host]").canopyx.getState()),
        local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }),
        href: location.href, text: document.body.innerText,
        attributes: [...document.querySelectorAll("*")].flatMap(element => [...element.attributes].map(attribute => attribute.value)).join("\n")
      };
      return Object.entries(places).filter(([, text]) => text.includes(secret)).map(([name]) => name);
    }, SECRET);
    expect(found, where).toEqual([]);
  };
  await leaks("on the review page");
  await expect(page.locator(".cx-flow-answer").filter({ has: page.locator("dt", { hasText: "Password" }) }).locator(".cx-flow-now")).toHaveText("Set");
  // The input itself holds the value as its property, never as markup.
  await page.getByRole("button", { name: "Change Password" }).click();
  expect(await field(page, "password").locator("input").inputValue()).toBe(SECRET);
  expect(await field(page, "password").locator("input").getAttribute("value")).toBeNull();
  await expect(field(page, "password").locator("input")).toHaveAttribute("type", "password");
  await expect(field(page, "password").locator("input")).toHaveAttribute("autocomplete", "new-password");
  await leaks("on the step that holds the input");
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-result")).toBeVisible();

  // The accessor gave the value once, then null, and nothing for a field that is not a secret.
  expect(await page.evaluate(() => window.__secretReads)).toEqual([SECRET, null, null]);
  expect(await page.evaluate(() => window.__lateSecret())).toBeNull();
  // The page's mock host read it after this listener, so it got nothing; it prints only lengths, never values.
  const received = await page.locator("#flow-received").textContent();
  expect(received).not.toContain(SECRET);
  const proposal = JSON.parse(received.split("\n\n")[0]);
  expect(proposal.secrets).toEqual({ password: { state: "set" } });
  expect(proposal.values).not.toHaveProperty("password");
  // The secret field writes no setting: no patch operation names it (the sign-in choice may hold the word "password").
  expect(proposal.patch.filter(operation => /password$/i.test(operation.path))).toEqual([]);
  for (const entry of await events()) expect(JSON.stringify(entry.detail), entry.name).not.toContain(SECRET);
  await leaks("after the answer");
  // Starting again leaves no trace either.
  await page.getByRole("button", { name: "Start another" }).click();
  await leaks("after starting again");
  expect(await flowCall(page, "isDirty")).toBe(false);
});

test("the mock host reads each secret once and prints only its length", async ({ page }) => {
  await openFlow(page, "flow-mail-server.html");
  await mailToReview(page, { password: SECRET });
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(page.locator(".cx-flow-result")).toBeVisible();
  const received = await page.locator("#flow-received").textContent();
  expect(received).toContain("password: received once, " + SECRET.length + " characters, not shown");
  expect(received).not.toContain(SECRET);
});

test("a secret revealed with Show is concealed again when the step changes", async ({ page }) => {
  await openFlow(page, "flow-mail-server.html");
  await field(page, "host").locator("input").fill("smtp.example.com");
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  const input = field(page, "password").locator("input");
  await input.fill(SECRET);
  const reveal = page.getByRole("button", { name: "Show Password" });
  await reveal.click();
  await expect(input).toHaveAttribute("type", "text");
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(secret => document.documentElement.outerHTML.includes(secret), SECRET)).toBe(false);
  await page.locator(".cx-flow-actions .cx-flow-back").click();
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await page.locator(".cx-flow-actions .cx-flow-next").click();
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toHaveValue(SECRET);
});

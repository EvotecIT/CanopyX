// The flow's API and hooks (docs/flow.md#javascript-api, #validation, #the-proposal-and-the-hosts-answer): answer links,
// lookups, host field and step errors, validators and step and flow rules, setFieldError, state, configure, custom editors,
// date and time fields, and the layouts. Flows here are built in the page from small documents.
import { test, expect } from "@playwright/test";
import { openFlow, flowCall, field, next, stepTitle, mailToReview } from "./flow-support.mjs";

/**
 * Replaces the page's flow with one built from a document. optionsSource is a JavaScript expression evaluated in the page
 * for the options beside flow (hooks, editors, callbacks); isolate keeps the page's mock host from answering.
 */
async function mount(page, doc, optionsSource = "({})", { isolate = false } = {}) {
  await page.evaluate(([doc, source, isolate]) => {
    for (const old of document.querySelectorAll("[data-canopyx-host]")) { old.canopyx?.destroy(); old.remove(); }
    const host = document.createElement("div");
    host.setAttribute("data-canopyx-host", "");
    if (isolate) host.addEventListener("canopyx:flowSubmit", event => event.stopPropagation());
    document.querySelector(".cx-main").prepend(host);
    const options = new Function("return " + source)();
    window.CanopyX.createFlow(host, Object.assign({}, options, { flow: doc }));
  }, [doc, optionsSource, isolate]);
  await page.waitForSelector("[data-canopyx-host][data-cx-ready]", { state: "attached" });
}

const doc = (steps, extra = {}) => Object.assign({ kind: "flow", version: 1, id: "api", title: "API flow", steps }, extra);
const banner = page => page.locator(".cx-flow-review .cx-flow-banner");
const answerRow = (page, label) => page.locator(".cx-flow-review .cx-flow-answer").filter({ has: page.locator("dt", { hasText: label }) });
const markState = (page, index) => page.locator(".cx-flow-rail .cx-flow-mark").nth(index).locator(".cx-flow-mark-state");

test.describe("the host's answer", () => {
  test("links keep only web, mail and same-origin relative addresses, at most ten per answer", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    // An answer keeps at most ten links (the cap is intended), so the refused and the kept ones go in separate answers.
    const shown = async hrefs => {
      await page.evaluate(hrefs => {
        window.flowAnswer = () => ({ status: "saved", message: "Done.", links: hrefs.map((href, index) => ({ label: "Link " + index, href })) });
      }, hrefs);
      await page.locator(".cx-flow-actions .cx-flow-next").click();
      await expect(page.locator(".cx-flow-result")).toBeVisible();
      const kept = await page.locator(".cx-flow-result .cx-flow-links a").evaluateAll(links => links.map(link => link.getAttribute("href")));
      await page.getByRole("button", { name: "Start another" }).click();
      return kept;
    };
    expect(await shown(["javascript:alert(1)", "java\tscript:alert(1)", "\x01javascript:alert(1)", "//evil.example/x", "/\\evil.example/x"])).toEqual([]);
    expect(await shown(["data:text/html,hi", "JAVASCRIPT:alert(1)", " javascript:alert(1)", "vbscript:msgbox(1)"])).toEqual([]);
    const good = ["https://example.com/report", "mailto:ops@example.com", "reports/latest", "/schedules", "#delivery-log"];
    expect(await shown(good)).toEqual(good);
    const twelve = Array.from({ length: 12 }, (_, index) => "https://example.com/" + index);
    expect(await shown(twelve)).toEqual(twelve.slice(0, 10));
  });

  test("a resubmit goes through after a host field error, without touching the field", async ({ page }) => {
    await openFlow(page, "flow-edit-settings.html");
    await page.locator('#flow-mock input[value="error"]').check();
    await flowCall(page, "goTo", "review");
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-answer-banner")).toHaveText("The location could not be reached.");
    await page.locator('#flow-mock input[value="saved"]').check();
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-result")).toBeVisible();
  });

  test("host step errors show on the review page and in the rail, survive revalidation and clear when the step changes", async ({ page }) => {
    await openFlow(page, "flow-mail-server.html");
    await page.evaluate(() => { window.flowAnswer = () => ({ status: "error", message: "Not saved.", stepErrors: { server: "The server refused the connection." } }); });
    await mailToReview(page);
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-answer-banner")).toContainText("Not saved.");
    const group = page.locator(".cx-flow-review-group").filter({ has: page.locator("h4", { hasText: "Which server sends the mail?" }) });
    await expect(group.locator(".cx-flow-error").first()).toHaveText("The server refused the connection.");
    await expect(markState(page, 0)).toHaveText("Errors: 1");
    // The review page checks the answers again as it opens; the host's message stays.
    await page.locator(".cx-flow-rail .cx-flow-mark-btn").nth(1).click();
    await page.locator(".cx-flow-rail .cx-flow-mark-btn").last().click();
    await expect(stepTitle(page)).toHaveText("Check your answers");
    await expect(group.locator(".cx-flow-error").first()).toHaveText("The server refused the connection.");
    await expect(markState(page, 0)).toHaveText("Errors: 1");
    // Changing an answer of that step clears it.
    await page.getByRole("button", { name: "Change Server name" }).click();
    await field(page, "host").locator("input").fill("relay.example.com");
    await next(page);
    await expect(stepTitle(page)).toHaveText("Check your answers");
    await expect(page.locator(".cx-flow-review")).not.toContainText("The server refused the connection.");
    await expect(markState(page, 0)).not.toHaveText("Errors: 1");
  });
});

test.describe("lookups", () => {
  test("a keyboard pick updates the answers before the field loses focus, and Next works", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await mount(page, doc([
      { id: "one", title: "Who owns it?", fields: [{ id: "owner", type: "lookup", label: "Owner", required: true, options: [{ value: "alex", label: "Alex Morgan" }, { value: "sam", label: "Sam Lee" }] }] },
      { id: "two", title: "Done", fields: [{ id: "note", type: "text", label: "Note" }] }]), "({})", { isolate: true });
    const input = field(page, "owner").locator("input");
    await input.click();
    await input.pressSequentially("a");
    await expect(page.locator(".cx-flow-stage [role=option]")).toHaveCount(2);
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(input).toHaveValue("Sam Lee");
    await expect(input).toBeFocused();
    expect((await flowCall(page, "getValues")).owner).toBe("sam");
    await input.press("Enter");
    await expect(stepTitle(page)).toHaveText("Done");
  });
});

test.describe("hooks", () => {
  const steps = [
    { id: "one", title: "Names", fields: [{ id: "name", type: "text", label: "Name", required: true }, { id: "code", type: "text", label: "Code" }] },
    { id: "review", type: "review" }];
  const hooks = `({ hooks: {
    validators: {
      name: value => value === "bad" ? "Not this name." : null,
      code: async value => { await new Promise(resolve => setTimeout(resolve, 20)); if (value === "boom") throw new Error("Validator broke."); return value === "taken" ? "That code is taken." : null; }
    },
    validateStep: (id, values) => id === "one" ? { warnings: values.name === "warn" ? ["Names like this are rare."] : [], fieldErrors: values.name === "dup" ? { name: "Already used." } : {} } : null,
    validateFlow: values => values.name === "block" ? { errors: ["The flow says no."] } : null,
    submit: () => ({ status: "saved", message: "Saved by the hook." })
  } })`;

  test("validators run sync and async, and a throwing one raises canopyx:error with its message in place", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await mount(page, doc(steps, { mode: "free" }), hooks, { isolate: true });
    await page.evaluate(() => { window.__errors = []; document.addEventListener("canopyx:error", event => window.__errors.push({ hook: event.detail.hook, message: event.detail.error?.message })); });
    const name = field(page, "name").locator("input"), code = field(page, "code").locator("input");
    await name.fill("bad");
    await next(page);
    await expect(field(page, "name").locator(".cx-flow-error")).toHaveText("Not this name.");
    await name.fill("good");
    await code.fill("taken");
    await next(page);
    await expect(field(page, "code").locator(".cx-flow-error")).toHaveText("That code is taken.");
    await code.fill("boom");
    await next(page);
    await expect(field(page, "code").locator(".cx-flow-error")).toHaveText("Validator broke.");
    expect(await page.evaluate(() => window.__errors)).toContainEqual({ hook: "validators.code", message: "Validator broke." });
    await code.fill("");
    // A field showing a problem is checked again as the reader types; the asynchronous check settles before Next.
    await expect(field(page, "code").locator(".cx-flow-error")).toBeHidden();
    await next(page);
    await expect(stepTitle(page)).toHaveText("Check your answers");
  });

  test("validateStep adds field errors and warnings the review page shows", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await mount(page, doc(steps, { mode: "free" }), hooks, { isolate: true });
    await field(page, "name").locator("input").fill("dup");
    await next(page);
    await expect(field(page, "name").locator(".cx-flow-error")).toHaveText("Already used.");
    await field(page, "name").locator("input").fill("warn");
    await next(page);
    await expect(stepTitle(page)).toHaveText("Check your answers");
    await expect(banner(page)).toContainText("Ready to submit");
    await expect(banner(page)).toContainText("Warnings: 1");
    await expect(banner(page).locator(".cx-flow-warning")).toHaveText("Names like this are rare.");
    await page.locator(".cx-flow-actions .cx-flow-next").click();
    await expect(page.locator(".cx-flow-result")).toContainText("Saved by the hook.");
  });

  test("validateFlow errors block submitting", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await mount(page, doc(steps, { mode: "free" }), hooks, { isolate: true });
    await field(page, "name").locator("input").fill("block");
    await next(page);
    await expect(banner(page)).toContainText("Errors to fix: 1");
    await expect(banner(page)).toContainText("The flow says no.");
    expect(await flowCall(page, "submit")).toBeNull();
    await expect(page.locator(".cx-flow-result")).toHaveCount(0);
  });

  test("a throwing step rule becomes a step error and canopyx:error", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await mount(page, doc(steps), `({ hooks: { validateStep: () => { throw new Error("Step rule broke."); } } })`, { isolate: true });
    await page.evaluate(() => { window.__errors = []; document.addEventListener("canopyx:error", event => window.__errors.push(event.detail.hook)); });
    await field(page, "name").locator("input").fill("Ann");
    await next(page);
    await expect(page.locator(".cx-flow-stage .cx-flow-summary")).toContainText("Step rule broke.");
    expect(await page.evaluate(() => window.__errors)).toContain("validateStep");
  });
});

test.describe("the API", () => {
  const steps = [
    { id: "one", title: "First", fields: [{ id: "name", type: "text", label: "Name" }, { id: "size", type: "number", label: "Size" }] },
    { id: "two", title: "Second", fields: [{ id: "tags", type: "list", label: "Tags" }] },
    { id: "review", type: "review" }];

  test("setFieldError shows a message that stays across blur until the value changes, and clears with null", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await mount(page, doc(steps), "({})", { isolate: true });
    const name = field(page, "name").locator("input"), message = field(page, "name").locator(".cx-flow-error");
    await flowCall(page, "setFieldError", "name", "The host rejected this name.");
    await expect(message).toHaveText("The host rejected this name.");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await name.focus();
    await name.blur();
    await expect(message).toHaveText("The host rejected this name.");
    await name.fill("Other");
    await name.blur();
    await expect(message).toBeHidden();
    await flowCall(page, "setFieldError", "name", "Again.");
    await expect(message).toHaveText("Again.");
    await flowCall(page, "setFieldError", "name", null);
    await expect(message).toBeHidden();
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
  });

  test("getState and setState round trip, and reset starts over", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await mount(page, doc(steps), "({})", { isolate: true });
    await field(page, "name").locator("input").fill("Ann");
    await field(page, "size").locator("input").fill("4");
    await next(page);
    await field(page, "tags").locator("input").first().fill("red");
    const state = await flowCall(page, "getState");
    expect(state).toMatchObject({ step: "two", values: { name: "Ann", size: 4, tags: ["red"] }, completed: ["one"] });
    expect(await flowCall(page, "isDirty")).toBe(true);
    expect(await flowCall(page, "reset")).toBe(true);
    await expect(stepTitle(page)).toHaveText("First");
    await expect(field(page, "name").locator("input")).toHaveValue("");
    expect(await flowCall(page, "isDirty")).toBe(false);
    expect(await flowCall(page, "setState", state)).toBe(true);
    await expect(stepTitle(page)).toHaveText("Second");
    await expect(field(page, "tags").locator("input").first()).toHaveValue("red");
    expect(await flowCall(page, "getState")).toEqual(state);
  });

  test("configure registers hooks for a flow mounted later", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await page.evaluate(() => {
      window.__configured = [];
      window.CanopyX.configure("configured", { onStepChange: detail => window.__configured.push(detail.to), hooks: { validators: { name: value => value === "no" ? "Configured says no." : null } } });
      const host = document.createElement("div");
      host.setAttribute("data-canopyx-host", ""); host.setAttribute("data-cx-mount", "manual"); host.id = "configured";
      const config = document.createElement("script");
      config.type = "application/json"; config.className = "cx-config";
      config.textContent = JSON.stringify({ kind: "flow", version: 1, id: "configured", title: "Configured", steps: [
        { id: "one", title: "One", fields: [{ id: "name", type: "text", label: "Name" }] }, { id: "two", title: "Two", fields: [{ id: "note", type: "text", label: "Note" }] }] });
      host.appendChild(config);
      document.querySelector(".cx-main").append(host);
      window.CanopyX.mount(host);
    });
    await page.waitForSelector("#configured[data-cx-ready]");
    const name = page.locator("#configured [data-cx-field=name] input");
    await name.fill("no");
    await page.locator("#configured .cx-flow-next").click();
    await expect(page.locator("#configured [data-cx-field=name] .cx-flow-error")).toHaveText("Configured says no.");
    await name.fill("yes");
    await page.locator("#configured .cx-flow-next").click();
    await expect(page.locator("#configured .cx-flow-step-title")).toHaveText("Two");
    expect(await page.evaluate(() => window.__configured)).toEqual(["two"]);
    // Configuring a mounted flow is refused.
    expect(await page.evaluate(() => { try { window.CanopyX.configure("configured", {}); return "accepted"; } catch (error) { return error.message; } })).toMatch(/already mounted/);
  });

  for (const route of ["editors", "CanopyX.use"]) {
    test(`a custom field takes its editor from ${route}`, async ({ page }) => {
      await openFlow(page, "flow-pause.html");
      const editor = `{ create: context => {
        const box = document.createElement("div"), input = document.createElement("input");
        box.className = "stars"; input.type = "range"; input.min = "1"; input.max = "5"; input.value = String(context.value ?? 1);
        box.appendChild(input);
        window.__context = { mode: context.mode, column: context.column.id, value: context.value };
        return { element: box, control: input, getValue: () => Number(input.value) };
      } }`;
      if (route === "CanopyX.use") await page.evaluate(source => { window.__dispose = window.CanopyX.use({ name: "stars-plugin", editors: { stars: new Function("return " + source)() } }); }, editor);
      await mount(page, doc([{ id: "one", title: "Rate it", fields: [{ id: "rating", type: "custom", editor: "stars", label: "Rating", default: 3 }] }, { id: "review", type: "review" }]),
        route === "editors" ? `({ editors: { stars: ${editor} } })` : "({})", { isolate: true });
      expect(await page.evaluate(() => window.__context)).toEqual({ mode: "flow", column: "rating", value: 3 });
      const input = field(page, "rating").locator(".stars input");
      await input.fill("5");
      expect((await flowCall(page, "getValues")).rating).toBe(5);
      await expect(page.locator(`label[for="${await input.getAttribute("id")}"]`)).toHaveText(/^Rating/);
      if (route === "CanopyX.use") await page.evaluate(() => window.__dispose());
    });
  }
});

test.describe("dates and times", () => {
  test("date, time and date-and-time fields write ISO values and read in words on the review page", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await mount(page, doc([
      { id: "one", title: "When?", fields: [{ id: "day", type: "date", label: "Day" }, { id: "at", type: "time", label: "At" }, { id: "until", type: "datetime", label: "Until" }] },
      { id: "review", type: "review" }], { mode: "free" }), "({})", { isolate: true });
    await field(page, "day").locator("input").fill("2026-11-02");
    await field(page, "at").locator("input").fill("07:30");
    await field(page, "until").locator("input").fill("2027-06-30T12:00");
    await field(page, "until").locator("input").blur();
    const values = await flowCall(page, "getValues");
    expect(values.day).toBe("2026-11-02");
    expect(values.at).toBe("07:30");
    expect(values.until).toMatch(/^2027-06-30T12:00(:00(\.000)?)?Z$/);
    await flowCall(page, "goTo", "review");
    await expect(answerRow(page, "Day").locator(".cx-flow-now")).toHaveText("Nov 2, 2026");
    await expect(answerRow(page, "At").locator(".cx-flow-now")).toHaveText("07:30");
    await expect(answerRow(page, "Until").locator(".cx-flow-now")).toHaveText(/^Jun 30, 2027(?:,| at)? 12:00\sPM UTC$/);
  });
});

test.describe("layouts", () => {
  test("an automatic horizontal rail that does not fit turns vertical, and short titles stay horizontal", async ({ page }) => {
    await openFlow(page, "flow-mail-server.html");
    await page.evaluate(() => { document.querySelector("[data-canopyx-host]").style.width = "900px"; });
    await expect(page.locator(".cx-flow-layout")).toHaveClass(/cx-flow-vertical/);
    await mount(page, doc(["A", "B", "C", "D"].map(letter => ({ id: "s" + letter, title: letter, fields: [{ id: "f" + letter, type: "text", label: letter }] }))), "({})", { isolate: true });
    await page.evaluate(() => { document.querySelector("[data-canopyx-host]").style.width = "900px"; });
    await expect(page.locator(".cx-flow-layout")).toHaveClass(/cx-flow-horizontal/);
    const rail = await page.locator(".cx-flow-rail").evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(rail.scroll).toBeLessThanOrEqual(rail.client + 1);
  });

  test("a single-step flow shows no rail", async ({ page }) => {
    await openFlow(page, "flow-pause.html");
    await expect(page.locator(".cx-flow-layout")).toHaveClass(/cx-flow-single/);
    await expect(page.locator(".cx-flow-rail")).toBeHidden();
  });

  test("focus stays on the radio button when its answer hides a step", async ({ page }) => {
    await openFlow(page, "flow-mail-server.html");
    const starttls = field(page, "security").getByRole("radio", { name: /STARTTLS/ });
    await starttls.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".cx-flow-rail .cx-flow-mark")).toHaveCount(4);
    await expect(field(page, "security").getByRole("radio", { name: /No encryption/ })).toBeFocused();
    await expect(field(page, "security").getByRole("radio", { name: /No encryption/ })).toBeChecked();
  });

  test.describe("at phone width", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("the current step opens inside its item of the stacked steps", async ({ page }) => {
      await openFlow(page, "flow-mail-server.html");
      await expect(page.locator(".cx-flow-layout")).toHaveClass(/cx-flow-stack/);
      const current = page.locator(".cx-flow-mark").filter({ has: page.locator("[aria-current=step]") });
      await expect(current.locator(".cx-flow-main .cx-flow-step-title")).toHaveText("Which server sends the mail?");
      await field(page, "host").locator("input").fill("smtp.example.com");
      await next(page);
      await expect(current.locator(".cx-flow-main .cx-flow-step-title")).toHaveText("How should the certificate be checked?");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
});

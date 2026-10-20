// Shared helpers for the flow specs: opening a flow example, reaching its API, and walking the mail-server flow.
import { expect } from "@playwright/test";
import { exampleUrl, nextFrames } from "./support.mjs";

/** Opens a flow example page and waits until its flow has painted its first step. */
export async function openFlow(page, name) {
  await page.goto(exampleUrl(name));
  await waitForFlow(page);
}

/** Waits until the page's (first) flow is ready: its parts installed and the first step painted. */
export async function waitForFlow(page, selector = "[data-canopyx-host]") {
  await page.waitForSelector(selector + "[data-cx-ready]", { state: "attached" });
  await nextFrames(page);
}

/** Calls a member of the page's flow API and returns its (awaited) result. */
export function flowCall(page, name, ...args) {
  return page.evaluate(([name, args]) => Promise.resolve(document.querySelector("[data-canopyx-host]").canopyx[name](...args)), [name, args]);
}

/** The current step's heading text. */
export function stepTitle(page) {
  return page.locator(".cx-flow-stage .cx-flow-step-title").first();
}

/** The visible field wrapper of a field id. */
export function field(page, id) {
  return page.locator(`.cx-flow-stage [data-cx-field="${id}"]`);
}

/** Records every canopyx:* event detail the page raises, as JSON text, plus flowSubmit details for later use. */
export async function recordEvents(page) {
  await page.evaluate(() => {
    window.__flowEvents = [];
    for (const name of ["flowReady", "flowStepChanging", "flowStepChanged", "flowValueChanged", "flowSubmit", "flowSubmitted", "flowReload", "error"]) {
      document.addEventListener("canopyx:" + name, event => {
        let text;
        try { text = JSON.stringify(event.detail, (key, value) => value instanceof Error ? { error: value.message } : value); } catch (error) { text = String(error); }
        window.__flowEvents.push({ name, detail: text });
      }, true);
    }
  });
  return () => page.evaluate(() => window.__flowEvents.map(entry => ({ name: entry.name, detail: JSON.parse(entry.detail ?? "null") })));
}

/** Clicks the primary action (Next or the submit button). */
export function next(page) {
  return page.locator(".cx-flow-actions .cx-flow-next").click();
}

/** Walks the mail-server flow to its review page, answering every required field. */
export async function mailToReview(page, { password = "Pa55word!", recipients = ["ops@example.com"] } = {}) {
  await field(page, "host").locator("input").fill("smtp.example.com");
  await next(page);
  await expect(stepTitle(page)).toHaveText("How should the certificate be checked?");
  await next(page);
  await expect(stepTitle(page)).toHaveText("How does it sign in?");
  await field(page, "user").locator("input").fill("alerts@example.com");
  await field(page, "password").locator("input").fill(password);
  await next(page);
  await expect(stepTitle(page)).toHaveText("Who receives the mail?");
  const rows = field(page, "to").locator("input");
  for (const [index, address] of recipients.entries()) {
    if (index > 0) await field(page, "to").locator(".cx-flow-list-add").click();
    await rows.nth(index).fill(address);
  }
  await next(page);
  await expect(stepTitle(page)).toHaveText("Check your answers");
  // The review page validates as it opens; the banner says when it has finished.
  await expect(page.locator(".cx-flow-review .cx-flow-banner .cx-flow-banner-title")).toHaveText(/Ready to submit|Errors to fix/);
}

/** Replaces the page's mounted flow with a new one built from a document, in a fresh host; returns nothing. */
export async function replaceFlow(page, documentJson, { isolate = false } = {}) {
  await page.evaluate(([doc, isolate]) => {
    const old = document.querySelector("[data-canopyx-host]");
    old.canopyx?.destroy();
    old.remove();
    const host = document.createElement("div");
    host.setAttribute("data-canopyx-host", "");
    // Isolated hosts keep their events away from the page's mock host, so nobody answers the proposal.
    if (isolate) host.addEventListener("canopyx:flowSubmit", event => event.stopPropagation());
    document.querySelector(".cx-main").prepend(host);
    window.CanopyX.createFlow(host, { flow: doc });
  }, [documentJson, isolate]);
  await waitForFlow(page);
}

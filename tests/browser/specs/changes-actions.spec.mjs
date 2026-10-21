// The change list's actions (docs/changes.md#the-change-list): actions that ask for a reason, actions no host claims, links, reveals,
// the bar's tools and exports, and what paper shows of a list and of a diff that mounts while the page prints.
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames, repo } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
const envelope = (type, extra) => Object.assign({ protocol: "canopyx/2", type }, extra);

async function mount(page, view, options = "{}") {
  const json = JSON.stringify(view).replace(/</g, "\\u003c");
  const body = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Changes</title><style>" + asset("canopyx-grid.css") + asset("canopyx-changes.css") +
    "</style><script>" + asset("canopyx-grid.js") + "\n" + asset("canopyx-changes.js") + "</script></head><body style=\"margin:0;padding:16px\"><div id=\"host\" data-cx-theme=\"light\"></div>" +
    "<script>window.events=[];for(const name of ['changeAction','changeExport'])document.addEventListener('canopyx:'+name,e=>events.push([name,e.detail]));" +
    "window.api=CanopyX.createChangeList(document.getElementById('host'),Object.assign({view:JSON.parse(" + JSON.stringify(json) + ")}," + options + "));</script></body></html>";
  await page.route("https://canopyx.test/actions", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto("https://canopyx.test/actions");
  await page.evaluate(() => api.ready);
  await nextFrames(page);
}

test("an action that asks for a reason needs one, and the host receives it", async ({ page }) => {
  await page.goto(exampleUrl("changes.html"));
  await page.waitForSelector(".cx-changes");
  const item = page.locator(".cx-chg-item[data-cx-item=\"payload\"]");
  const acknowledge = item.getByRole("button", { name: "Acknowledge" });
  await expect(acknowledge).toHaveAttribute("aria-expanded", "false");
  await acknowledge.click();
  await expect(acknowledge.first()).toHaveAttribute("aria-expanded", "true");
  const field = item.getByRole("textbox", { name: "Reason" });
  await expect(field).toBeFocused();
  await expect(item.locator(".cx-chg-hint")).toHaveText("Acknowledge: say why. The reason is kept with the action.");
  await item.locator(".cx-chg-panel").getByRole("button", { name: "Acknowledge" }).click();
  await expect(item.getByRole("alert")).toHaveText("Enter a reason first.");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.fill("Planned agent rollout");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator("#changes-status")).toHaveText("The host would acknowledge Scripts/Logon/agent.exe because: Planned agent rollout.");
  await expect(item.locator(".cx-chg-panel")).toHaveCount(0);
  await expect(acknowledge).toBeFocused();
  // Escape closes the field without acting.
  await acknowledge.click();
  await page.keyboard.press("Escape");
  await expect(item.locator(".cx-chg-panel")).toHaveCount(0);
  await expect(acknowledge).toBeFocused();
});

test("an action nobody claims says so and offers its request to copy", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(exampleUrl("changes.html"));
  await page.waitForSelector(".cx-changes");
  const bar = page.locator(".cx-changes .cx-chg-bar");
  await expect(bar.getByRole("group", { name: "Actions for Changes on the deployment share" })).toBeVisible();
  await bar.getByRole("button", { name: "Mark as expected" }).click();
  await page.locator(".cx-chg-barpanel").getByRole("textbox", { name: "Reason" }).fill("Rollout ticket 4711");
  await page.locator(".cx-chg-barpanel").getByRole("button", { name: "Mark as expected" }).click();
  const note = page.locator(".cx-chg-barpanel .cx-chg-note");
  await expect(note).toHaveText("This page cannot carry out “Mark as expected” itself. Copy the request to pass it on.");
  await expect(page.locator(".cx-chg-barpanel").getByRole("button", { name: "Copy request" })).toBeFocused();
  if (browserName === "chromium") {
    await page.locator(".cx-chg-barpanel").getByRole("button", { name: "Copy request" }).click();
    const request = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    expect(request).toMatchObject({ list: "share-changes", action: "expected", item: null, reason: "Rollout ticket 4711", values: { share: "#share/deploy" } });
  }
  await page.locator(".cx-chg-barpanel").getByRole("button", { name: "Cancel" }).click();
  await expect(note).toHaveCount(0);
});

test("a host claims an action through onAction, links open only safe addresses, and a reveal opens the diff", async ({ page }) => {
  const view = envelope("changes", { id: "l", label: "List",
    actions: [{ id: "ack", label: "Acknowledge", icon: "check" }, { id: "go", label: "Open", icon: "open", link: "address" }, { id: "see", label: "Open the diff", icon: "diff", reveal: "diff" }],
    items: [
      { id: "a", kind: "modified", path: "a.txt", values: { address: "#object/a" }, diff: { id: "d", label: "a.txt", before: "one\n", after: "two\n" } },
      { id: "b", kind: "added", path: "b.txt", values: { address: "javascript:alert(1)" } },
      { id: "c", kind: "added", path: "c.txt", values: { address: "/\\evil.example" } }] });
  await mount(page, view, "{onAction:detail=>{window.claimed=detail.action;}}");
  const a = page.locator(".cx-chg-item[data-cx-item=\"a\"]"), b = page.locator(".cx-chg-item[data-cx-item=\"b\"]");
  await a.getByRole("button", { name: "Acknowledge" }).click();
  expect(await page.evaluate(() => window.claimed)).toBe("ack");
  await expect(page.locator(".cx-chg-note")).toHaveCount(0);
  await expect(a.getByRole("link", { name: "Open" })).toHaveAttribute("href", "#object/a");
  await expect(b.getByRole("link", { name: "Open" })).toHaveCount(0);
  await expect(page.locator(".cx-chg-item[data-cx-item=\"c\"]").getByRole("link", { name: "Open" })).toHaveCount(0);
  await expect(b.getByRole("button", { name: "Open the diff" })).toHaveCount(0);
  await a.getByRole("button", { name: "Open the diff" }).click();
  await expect(a.locator(".cx-chg-diff .cx-diff-scroll")).toBeFocused();
  expect(await page.evaluate(() => events.filter(([name]) => name === "changeAction").map(([, detail]) => [detail.action, detail.reveal ?? null]))).toEqual([["ack", null], ["see", "diff"]]);
});

test("the bar exports the items the filters keep as CSV and JSON", async ({ page }) => {
  await page.goto(exampleUrl("changes.html"));
  await page.waitForSelector(".cx-changes");
  const list = page.locator(".cx-changes");
  await list.getByRole("checkbox", { name: /Flagged only/ }).check();
  const [csv] = await Promise.all([page.waitForEvent("download"), list.getByRole("button", { name: "Export CSV" }).click()]);
  expect(csv.suggestedFilename()).toBe("share-changes.csv");
  const rows = fs.readFileSync(await csv.path(), "utf8").replace(/^﻿/, "").trim().split("\r\n");
  expect(rows[0]).toBe("kind,kindLabel,path,previousPath,secondary,sizeBefore,sizeAfter,hashBefore,hashAfter,timeBefore,timeAfter,flags,facts,values.unc");
  expect(rows).toHaveLength(4);
  expect(rows[1]).toContain("added,,Scripts/Logon/agent.exe,,Not managed by any setting,,1248256,");
  const [json] = await Promise.all([page.waitForEvent("download"), list.getByRole("button", { name: "Export JSON" }).click()]);
  const data = JSON.parse(fs.readFileSync(await json.path(), "utf8"));
  expect(data.filters).toEqual({ kinds: [], flaggedOnly: true });
  expect(data.items.map(item => item.path)).toEqual(["Scripts/Logon/agent.exe", "Scripts/Logon/map-drives.ps1", "Scripts/Startup/install.ps1"]);
  expect(data.items[1].diff.unified).toContain("+    Legal   = '\\\\files.example.net\\legal'");
  expect(data.items[0].after.time).toBe("2026-10-21T10:42:00.000Z");
});

test("a CSV export keeps text from being read as a formula", async ({ page }) => {
  await mount(page, envelope("changes", { id: "x y", label: "X", exports: ["csv"], items: [{ id: "a", kind: "added", path: "=cmd|' /C calc'!A0", secondary: "plain, \"quoted\"" }] }));
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export CSV" }).click()]);
  expect(csv.suggestedFilename()).toBe("x-y.csv");
  const row = fs.readFileSync(await csv.path(), "utf8").trim().split("\r\n")[1];
  expect(row).toBe("added,,'=cmd|' /C calc'!A0,,\"plain, \"\"quoted\"\"\",,,,,,,,");
});

test("paper shows every item the filters keep, the filters in effect, and a diff that opens while printing", async ({ page }) => {
  const items = Array.from({ length: 25 }, (_, index) => ({ id: "i" + index, kind: index % 2 ? "added" : "modified", path: "folder/file-" + String(index).padStart(2, "0") + ".txt",
    flags: index % 2 ? [{ id: "f", label: "Flag", reason: "Why." }] : undefined, diff: index === 3 ? { id: "d", label: "file-03.txt", before: "a\n", after: "b\n" } : undefined }));
  await mount(page, envelope("changes", { id: "p", label: "Paper", pageSize: 10, items }));
  await page.evaluate(() => api.setState({ flaggedOnly: true }));
  await expect(page.locator(".cx-chg-item")).toHaveCount(10);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".cx-chg-item")).toHaveCount(12);
  await expect(page.locator(".cx-chg-printnote")).toHaveText("Filtered: Flagged only");
  await expect(page.locator(".cx-chg-switch")).toBeHidden();
  await page.evaluate(() => api.toggle("i3", true));
  await expect(page.locator(".cx-chg-item[data-cx-item=\"i3\"] .cx-diff-print table tr")).toHaveCount(2);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".cx-chg-item")).toHaveCount(10);
  await expect(page.locator(".cx-chg-printnote")).toBeHidden();
});

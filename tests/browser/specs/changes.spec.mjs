// The change views (docs/changes.md): the diff (the comparison shared with C#, layouts, word marks, folded regions, change navigation,
// copy, windowing, states), the change list (filters, details with diffs, actions, keyboard), the propagation view (states, delays,
// phones), accessibility in both palettes at both widths, printing, and documents that fail.
import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { exampleUrl, nextFrames, repo } from "./support.mjs";

const asset = name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets", name), "utf8");
const cases = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/diff-cases.json"), "utf8"));
const envelope = (type, extra) => Object.assign({ protocol: "canopyx/2", type }, extra);

async function mount(page, create, view, { width = 1200, theme = "light", options = "{}", lang = "en", script = "" } = {}) {
  const json = JSON.stringify(view).replace(/</g, "\\u003c");
  const body = "<!DOCTYPE html><html lang=\"" + lang + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Changes</title><style>" +
    asset("canopyx-grid.css") + asset("canopyx-changes.css") + "</style><script>" + asset("canopyx-grid.js") + "\n" + asset("canopyx-changes.js") + "\n" + script + "</script></head>" +
    "<body style=\"margin:0;padding:16px\"><div id=\"frame\" style=\"width:" + width + "px;max-width:100%\"><div id=\"host\" data-cx-theme=\"" + theme + "\"></div></div>" +
    "<script>window.events=[];for(const name of ['changeAction','changeToggle','changesState','diffCopy','diffLayout'])document.addEventListener('canopyx:'+name,e=>events.push([name,e.detail]));" +
    "window.api=CanopyX." + create + "(document.getElementById('host'),Object.assign({view:JSON.parse(" + JSON.stringify(json) + ")}," + options + "));</script></body></html>";
  // A secure origin, so the Clipboard API is there as on a served page.
  await page.route("https://canopyx.test/changes", route => route.fulfill({ contentType: "text/html", body }));
  await page.goto("https://canopyx.test/changes");
  await page.evaluate(() => api.ready);
  await nextFrames(page);
}

test("the browser compares texts as C# does: the shared fixture's hunks", async ({ page }) => {
  await mount(page, "createDiff", envelope("diff", { id: "seed", label: "Seed", before: "a\n", after: "b\n" }));
  for (const entry of cases.lines) {
    const hunks = await page.evaluate(view => { api.update(view); return api.getHunks(); },
      envelope("diff", { id: "case", label: entry.name, before: entry.before, after: entry.after, context: entry.context }));
    expect(hunks, entry.name).toEqual(entry.hunks);
  }
});

test("word marks match the shared fixture, as del and ins inside the changed lines", async ({ page }) => {
  for (const entry of cases.words) {
    await page.unrouteAll();
    await mount(page, "createDiff", envelope("diff", { id: "w", label: "W", before: entry.before + "\n", after: entry.after + "\n", layout: "inline" }));
    const marks = await page.evaluate(() => ["del", "ins"].map(tag => [...document.querySelectorAll(".cx-diff-code " + tag)].map(mark => {
      const code = mark.closest(".cx-diff-code"), sr = code.querySelector(".cx-sr-only").textContent.length;
      let start = 0; for (const node of code.childNodes) { if (node === mark) break; start += node.textContent.length; }
      return [start - sr, start - sr + mark.textContent.length];
    })));
    expect(marks, entry.before).toEqual(entry.marks ? [entry.marks.before, entry.marks.after] : [[], []]);
  }
});

test("a diff switches layouts, folds unchanged regions that open in place, and moves between changes", async ({ page }) => {
  const before = Array.from({ length: 40 }, (_, i) => "line " + (i + 1)).join("\n") + "\n";
  const after = before.replace("line 5\n", "line five\n").replace("line 30\n", "line thirty\nextra\n");
  await mount(page, "createDiff", envelope("diff", { id: "d", label: "notes.txt", path: "docs/notes.txt", before, after }));
  expect(await page.evaluate(() => api.getLayout())).toBe("split");
  await expect(page.locator(".cx-diff-colhead")).toHaveText(["Before", "After"]);
  await expect(page.locator(".cx-diff-stats .cx-sr-only")).toHaveText("Lines added: 3, removed: 2");
  await page.getByRole("radio", { name: "Inline" }).click();
  expect(await page.evaluate(() => api.getLayout())).toBe("inline");
  expect(await page.evaluate(() => events.filter(event => event[0] === "diffLayout").map(event => event[1].layout))).toEqual(["inline"]);
  await expect(page.locator(".cx-diff-columns")).toBeHidden();
  // Lines 9 to 26 are folded between the two changes; the trailing lines are folded after the last one.
  const expand = page.getByRole("button", { name: "Show 18 more lines" });
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(page.getByRole("button", { name: "Show 18 more lines" })).toHaveCount(0);
  await expect(page.locator(".cx-diff-row", { hasText: "line 15" })).toHaveCount(1);
  await expect(page.locator(".cx-diff-scroll")).toBeFocused();
  await page.keyboard.press("n");
  await expect(page.locator(".cx-diff-current").first()).toContainText("line 5");
  await expect(page.locator(".cx-diff [aria-live]")).toHaveText("Change 1 of 2");
  await page.keyboard.press("n");
  await expect(page.locator(".cx-diff-current").first()).toContainText("line 30");
  await page.getByRole("button", { name: "Previous change" }).click();
  await expect(page.locator(".cx-diff [aria-live]")).toHaveText("Change 1 of 2");
  // A screen reader hears what each line is before its text.
  await expect(page.locator(".cx-diff-del .cx-diff-code .cx-sr-only").first()).toHaveText("Removed line 5: ");
});

test("copy writes the unified diff, and a host's own diff when it gives one", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Clipboard permissions are a Chromium feature.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mount(page, "createDiff", envelope("diff", { id: "c", label: "c.txt", path: "c.txt", before: "a\nb\n", after: "a\nc\n" }));
  await page.getByRole("button", { name: "Copy diff" }).click();
  await expect(page.locator(".cx-diff [aria-live]")).toHaveText("Copied");
  // The system clipboard may write line breaks as CRLF.
  expect(await page.evaluate(() => navigator.clipboard.readText().then(text => text.replace(/\r\n/g, "\n")))).toBe("--- a/c.txt\n+++ b/c.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+c\n");
  expect(await page.evaluate(() => events.find(event => event[0] === "diffCopy")[1])).toEqual({ diff: "c", copied: true });
  await page.evaluate(view => api.update(view), envelope("diff", { id: "c", label: "c.txt", before: "a\n", after: "b\n", unified: "host diff" }));
  expect(await page.evaluate(() => api.copy())).toBe(true);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("host diff");
});

test("a long diff mounts only the rows in view", async ({ page }) => {
  await page.goto(exampleUrl("changes-diff-large.html"));
  await page.waitForSelector("[data-cx-ready]");
  const host = page.locator("[data-canopyx-host]");
  await host.evaluate(element => element.canopyx.expandAll());
  await nextFrames(page);
  const rows = await page.evaluate(() => ({ mounted: document.querySelectorAll(".cx-diff-row").length, count: +document.querySelector(".cx-diff-scroll").getAttribute("aria-rowcount") }));
  expect(rows.count).toBeGreaterThan(19000);
  expect(rows.mounted).toBeLessThan(200);
  await page.locator(".cx-diff-scroll").evaluate(scroll => { scroll.scrollTop = scroll.scrollHeight / 2; });
  await nextFrames(page);
  const middle = await page.evaluate(() => { const scroll = document.querySelector(".cx-diff-scroll"), box = scroll.getBoundingClientRect(); return document.elementFromPoint(box.left + 200, box.top + box.height / 2)?.closest(".cx-diff-row") !== null; });
  expect(middle).toBe(true);
});

test("a supported large folded region expands without an argument limit", async ({ page }) => {
  const prefix = "same\n".repeat(180000);
  await mount(page, "createDiff", envelope("diff", { id: "large", label: "large.txt", layout: "inline", before: prefix + "old\n", after: prefix + "new\n",
    hunks: [{ before: 180001, after: 180001, lines: ["-old", "+new"] }] }));
  await page.getByRole("button", { name: "Show 180,000 more lines" }).click();
  await expect(page.getByRole("button", { name: "Show 180,000 more lines" })).toHaveCount(0);
  await expect(page.locator(".cx-diff-scroll")).toBeFocused();
  await expect(page.locator(".cx-diff-scroll")).toHaveAttribute("aria-rowcount", "180003");
  expect(await page.locator(".cx-diff-row").count()).toBeLessThan(200);
  await page.evaluate(() => api.update({ protocol: "canopyx/2", type: "diff", id: "large", label: "large.txt", layout: "inline",
    before: "same\n".repeat(180000) + "old\n", after: "same\n".repeat(180000) + "new\n",
    hunks: [{ before: 180001, after: 180001, lines: ["-old", "+new"] }] }));
  await page.evaluate(() => api.expandAll());
  await expect(page.locator(".cx-diff-scroll")).toHaveAttribute("aria-rowcount", "180003");
});

test("copied unified diffs preserve final newline state", async ({ page }) => {
  await mount(page, "createDiff", envelope("diff", { id: "eof", label: "file.txt", before: "a\n", after: "b" }));
  await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.copiedDiff = text; }; });
  for (const [before, after, lines] of [
    ["a\n", "b", "-a\n+b\n\\ No newline at end of file\n"],
    ["a", "b\n", "-a\n\\ No newline at end of file\n+b\n"],
    ["a", "b", "-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n"],
    ["a\n", "a", "-a\n+a\n\\ No newline at end of file\n"],
    ["a", "a\n", "-a\n\\ No newline at end of file\n+a\n"]
  ]) {
    await page.evaluate(view => api.update(view), envelope("diff", { id: "eof", label: "file.txt", before, after }));
    expect(await page.evaluate(() => api.copy())).toBe(true);
    expect(await page.evaluate(() => window.copiedDiff)).toBe("--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n" + lines);
  }
  for (const [before, after, patch] of [
    ["a", "a\nb\n", "@@ -1 +1,2 @@\n-a\n\\ No newline at end of file\n+a\n+b\n"],
    ["a\nb", "A\nb", "@@ -1,2 +1,2 @@\n-a\n+A\n b\n\\ No newline at end of file\n"],
    ["", "b", "@@ -0,0 +1 @@\n+b\n\\ No newline at end of file\n"],
    ["a", "", "@@ -1 +0,0 @@\n-a\n\\ No newline at end of file\n"],
    ["a\r\n", "b\r\n", "@@ -1 +1 @@\n-a\n+b\n"]
  ]) {
    await page.evaluate(view => api.update(view), envelope("diff", { id: "eof", label: "file.txt", before, after }));
    expect(await page.evaluate(() => api.copy())).toBe(true);
    expect(await page.evaluate(() => window.copiedDiff)).toBe("--- a/file.txt\n+++ b/file.txt\n" + patch);
  }
});

for (const [content, text] of [["binary", "Binary file: compared by size and hash, not by lines."], ["unavailable", "Withheld by policy."], ["identical", "The text did not change."]]) {
  test("a " + content + " diff shows its state instead of lines", async ({ page }) => {
    await mount(page, "createDiff", envelope("diff", Object.assign({ id: "s", label: "agent.exe", content }, content === "unavailable" ? { message: "Withheld by policy." } : {})));
    await expect(page.locator(".cx-diff-state")).toHaveText(text);
    await expect(page.locator(".cx-diff-scroll")).toBeHidden();
    await expect(page.locator(".cx-diff-tools")).toBeHidden();
  });
}

test("texts too long to compare in the browser say so", async ({ page }) => {
  const long = Array.from({ length: 5001 }, (_, i) => "x" + i).join("\n");
  await mount(page, "createDiff", envelope("diff", { id: "l", label: "L", before: long, after: long + "\ny" }));
  await expect(page.locator(".cx-diff-state")).toHaveText("These texts are too long to compare here.");
});

test("a change list filters by kind and flags, opens details with their diff, and raises actions", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(exampleUrl("changes.html"));
  await page.waitForSelector(".cx-changes");
  const list = page.locator(".cx-changes");
  await expect(list.locator(".cx-chg-name")).toHaveText(["settings.ini", "policy.xml", "agent.exe", "map-drives.ps1", "cleanup.cmd", "install.ps1", "legacy-inventory.vbs"]);
  await expect(list.locator(".cx-chg-foldername")).toHaveText(["Config", "Scripts/Logon", "Scripts/Startup", "Tools"]);
  await list.getByRole("checkbox", { name: /Flagged only/ }).check();
  await expect(list.locator(".cx-chg-name")).toHaveText(["agent.exe", "map-drives.ps1", "install.ps1"]);
  await expect(list.locator(".cx-chg-summary")).toHaveText("3 of 7 shown");
  await list.getByRole("button", { name: /^Added/ }).click();
  await expect(list.locator(".cx-chg-name")).toHaveText(["agent.exe", "install.ps1"]);
  expect(await page.locator(".cx-change-host").first().evaluate(host => host.canopyx.getState())).toEqual({ kinds: ["added"], flaggedOnly: true, open: [] });
  // The details list the flags with their reasons and the versions side by side; a diff mounts in them.
  await list.getByRole("button", { name: "Details of agent.exe" }).click();
  await expect(list.getByRole("button", { name: "Details of agent.exe" })).toHaveAttribute("aria-expanded", "true");
  await expect(list.locator(".cx-chg-reasons li").first()).toHaveText("Unsigned — The file has no embedded signature.");
  await expect(list.locator(".cx-chg-facts")).toContainText("Not signed");
  await list.getByRole("button", { name: "Details of install.ps1" }).click();
  await expect(list.locator(".cx-chg-diff .cx-diff-path")).toHaveText("Scripts/Startup/install.ps1");
  // Up and Down move between the details buttons.
  await list.getByRole("button", { name: "Details of agent.exe" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Details of install.ps1");
  // A host action is raised for the host; a copy action copies the value and says so.
  await list.locator(".cx-chg-item[data-cx-item=\"payload\"]").getByRole("button", { name: "Compare across servers" }).click();
  await expect(page.locator("#changes-status")).toHaveText("The host would compare Scripts/Logon/agent.exe.");
  if (browserName === "chromium") {
    await list.locator(".cx-chg-item[data-cx-item=\"payload\"]").getByRole("button", { name: "Copy the network path" }).click();
    await expect(page.locator("#changes-status")).toHaveText("Copied the path of Scripts/Logon/agent.exe.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("\\\\fs01.example.net\\deploy\\Scripts\\Logon\\agent.exe");
    await list.locator(".cx-chg-item[data-cx-item=\"payload\"] .cx-chg-hashbtn").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("9f2c41d07be35a18c6e0d4f9a2b7c3e15d8f60a4b9c2e7d1f3a5b8c0d2e4f6a8");
  }
});

test("the propagation view counts each state and reads as stacked rows on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(exampleUrl("changes.html"));
  await page.waitForSelector(".cx-prop");
  const view = page.locator(".cx-prop");
  await expect(view.locator(".cx-prop-state")).toHaveText("Fault");
  await expect(view.locator(".cx-prop-count")).toHaveText(["Converged3", "Propagating1", "Fault1", "Unknown1"]);
  await expect(view.locator(".cx-prop-group th")).toHaveText(["Oslo · 3 servers", "Lyon · 3 servers"]);
  await expect(view.locator(".cx-prop-row", { hasText: "FS03" }).locator(".cx-prop-delay")).toHaveText("+6 min");
  await expect(view.locator(".cx-prop-row", { hasText: "FS04" }).locator(".cx-prop-first")).toHaveText("Not seen yet");
  expect(await view.locator(".cx-prop-row").first().evaluate(row => getComputedStyle(row).display)).toBe("grid");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const [width, theme] of [[1440, "light"], [1440, "dark"], [390, "light"], [390, "dark"]]) {
  test("the change views pass axe at " + width + " in " + theme, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(exampleUrl(theme === "dark" ? "changes-dark.html" : "changes.html"));
    await page.waitForSelector(".cx-prop");
    await page.locator(".cx-changes").getByRole("button", { name: "Details of map-drives.ps1" }).click();
    await page.waitForSelector(".cx-chg-diff .cx-diff-row");
    const result = await new AxeBuilder({ page }).include(".cx-change-host").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map(item => item.id + ": " + item.nodes.map(node => node.target.join(" ")).slice(0, 3).join(", "))).toEqual([]);
  });
}

test("printing draws every diff line in one table and hides the tools", async ({ page }) => {
  await page.goto(exampleUrl("changes.html"));
  await page.waitForSelector(".cx-diff-row");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  const diff = page.locator("section", { hasText: "map-drives.ps1" }).last().locator(".cx-diff");
  await expect(diff.locator(".cx-diff-print table")).toBeVisible();
  await expect(diff.locator(".cx-diff-scroll")).toBeHidden();
  await expect(diff.locator(".cx-diff-print tr.cx-diff-add").first()).toContainText("Legal");
  await expect(page.locator(".cx-chg-kinds")).toBeHidden();
  await expect(page.locator(".cx-chg-tools")).toBeHidden();
});

for (const [name, create, view, message] of [
  ...[0, 2, 4].map(omitted => {
    const after = ["a", "B", "c", "D", "e"]; after[omitted] = "omitted";
    return ["an omitted replacement at line " + (omitted + 1), "createDiff", envelope("diff", { id: "x", label: "X", before: "a\nb\nc\nd\ne", after: after.join("\n"),
      hunks: [{ before: 2, after: 2, lines: ["-b", "+B"] }, { before: 4, after: 4, lines: ["-d", "+D"] }] }), "do not account for every difference"];
  }),
  ["a diff hunk that does not match its text", "createDiff", envelope("diff", { id: "x", label: "X", before: "a\n", after: "b\n", hunks: [{ before: 1, after: 1, lines: ["-z", "+b"] }] }), "does not match its text"],
  ["a diff with one text", "createDiff", envelope("diff", { id: "x", label: "X", before: "a" }), "both texts or neither"],
  ["a renamed item without its earlier path", "createChangeList", envelope("changes", { id: "x", label: "X", items: [{ id: "a", kind: "renamed", path: "a.txt" }] }), "previous path"],
  ["an item offering an undeclared action", "createChangeList", envelope("changes", { id: "x", label: "X", items: [{ id: "a", kind: "added", path: "a", actions: ["nope"] }] }), "undeclared action"],
  ["a propagation view without replicas", "createPropagation", envelope("propagation", { id: "x", label: "X", witnesses: [] }), "1 to 2000 replicas"],
  ["an unknown property", "createPropagation", envelope("propagation", { id: "x", label: "X", extra: 1, witnesses: [{ id: "a", label: "A", state: "converged" }] }), "unknown property 'extra'"]
]) {
  test("a document with " + name + " fails with a message", async ({ page }) => {
    await page.route("http://canopyx.test/bad", route => route.fulfill({ contentType: "text/html", body: "<!DOCTYPE html><html lang=\"en\"><head><title>x</title><script>" + asset("canopyx-grid.js") + "\n" + asset("canopyx-changes.js") +
      "</script></head><body><div id=\"host\"></div><script>window.diagnostics=[];document.addEventListener('canopyx:error',e=>diagnostics.push(e.detail.error.message));window.api=CanopyX." + create + "(document.getElementById('host'),{view:" + JSON.stringify(view).replace(/</g, "\\u003c") + "});window.result=api.ready.then(()=>'ready',e=>e.message);</script></body></html>" }));
    await page.goto("http://canopyx.test/bad");
    expect(await page.evaluate(() => window.result)).toContain(message);
    await expect(page.locator("#host")).toHaveAttribute("data-cx-error", /not valid/);
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.evaluate(() => diagnostics)).toEqual([await page.evaluate(() => result)]);
    await expect(page.getByRole("button", { name: /Copy diff|Export JSON/ })).toHaveCount(0);
    if (create === "createDiff" && view.hunks) await expect(page.getByRole("alert")).toContainText("This diff can't be shown: the supplied hunks don't match the file text");
  });
}

for (const nested of [false, true]) {
  test((nested ? "a change list" : "a diff") + " rejects an inconsistent update with a diagnostic and no stale exports, then recovers", async ({ page }, testInfo) => {
    const valid = { id: "d", label: "file.txt", before: "a\nb\nc", after: "a\nB\nc", hunks: [{ before: 2, after: 2, lines: ["-b", "+B"] }] };
    const wrap = diff => nested ? envelope("changes", { id: "list", label: "Changes", exports: ["json"], items: [{ id: "item", kind: "modified", path: "file.txt", diff }] }) : envelope("diff", diff);
    await mount(page, nested ? "createChangeList" : "createDiff", wrap(valid));
    await page.evaluate(() => { window.diagnostics = []; document.addEventListener("canopyx:error", event => diagnostics.push(event.detail.error.message)); });
    const invalid = wrap({ ...valid, after: "omitted\nB\nc" });
    const failure = await page.evaluate(view => { try { api.update(view); return null; } catch (error) { return error.message; } }, invalid);
    expect(failure).toContain("This diff can't be shown: the supplied hunks don't match the file text");
    await expect(page.getByRole("alert")).toHaveText(failure);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("#host")).toHaveAttribute("data-cx-error", failure);
    await expect(page.locator(".cx-diff-row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Copy diff|Export JSON/ })).toHaveCount(0);
    expect(await page.evaluate(() => diagnostics)).toEqual([failure]);
    if (!nested) expect(await page.evaluate(() => { try { api.copy(); return null; } catch (error) { return error.message; } })).toBe(failure);
    if (testInfo.project.name === "chromium") {
      for (const width of [1200, 390]) {
        await page.setViewportSize({ width, height: 800 });
        await page.screenshot({ path: testInfo.outputPath("invalid-" + width + ".png") });
      }
    }
    await page.evaluate(view => api.update(view), wrap(valid));
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator("#host")).not.toHaveAttribute("data-cx-error");
    await expect(page.getByRole("button", { name: nested ? "Export JSON" : "Copy diff" })).toBeVisible();
    if (nested) {
      const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export JSON" }).click()]);
      expect(JSON.parse(fs.readFileSync(await download.path(), "utf8")).items[0].diff.unified).toContain("-b\n+B\n");
    } else {
      await expect(page.getByRole("cell", { name: "Added line 2: B", exact: true })).toBeVisible();
      expect(await page.evaluate(() => api.getHunks())).toEqual(valid.hunks);
    }
    await page.evaluate(() => api.destroy());
    await expect(page.locator("#host")).toBeEmpty();
  });
}

test("labels come from a label pack, and host text stays text", async ({ page }) => {
  const view = envelope("changes", { id: "x", label: "X", items: [{ id: "a", kind: "added", path: "<img src=x onerror=alert(1)>.ps1", flags: [{ id: "f", label: "<b>flag</b>", reason: "r" }] }] });
  await mount(page, "createChangeList", view, { lang: "pl", script: asset("canopyx-labels-pl.js"), options: "{labels:CanopyXLocales.pl.labels}" });
  await expect(page.locator(".cx-chg-kind .cx-chg-badge")).toHaveText("Dodany");
  await expect(page.locator(".cx-chg-name")).toHaveText("<img src=x onerror=alert(1)>.ps1");
  await expect(page.locator(".cx-changes img, .cx-changes b")).toHaveCount(0);
});

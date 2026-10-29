// Task planning on the existing resource timeline. The host receives proposals; CanopyX never accepts or writes them.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { repo, runtimeAssets, nextFrames } from "./support.mjs";

const iso = day => "2026-10-" + String(day).padStart(2, "0") + "T00:00:00.000Z";
function definition() {
  const rows = [["prepare", "Prepare migration", "platform", 12, 14], ["migrate", "Move workloads", "platform", 14, 18],
    ["notes", "Update runbooks", "operations", 14, 16], ["verify", "Verify workloads", "validation", 18, 20], ["release", "Release milestone", "operations", 20, 20]]
    .map(([id, title, owner, start, end]) => ({ id, cells: { title, owner, starts: iso(start), ends: iso(end), baselineStart: iso(start - 1), baselineEnd: iso(end - 1), milestone: id === "release" } }));
  return { protocol: "canopyx/2", type: "grid", id: "plan-test", label: "Migration plan", pageSize: 100, selection: "single", source: { kind: "inline" },
    columns: [{ id: "title", title: "Task", kind: "text", rowHeader: true }, { id: "owner", title: "Team", kind: "text" },
      ...["starts", "ends", "baselineStart", "baselineEnd"].map(id => ({ id, title: id, kind: "datetime" })), { id: "milestone", title: "Milestone", kind: "text", hidden: true }], rows,
    calendar: { start: "starts", end: "ends", title: "title", resource: "owner", view: "timeline", views: ["timeline"], phone: "timeline", date: "2026-10-16", timeZone: "UTC", nowIndicator: false,
      resources: { view: { protocol: "canopyx/2", type: "view", id: "teams", label: "Teams", rowHeight: 34, selection: "single", source: { kind: "inline" }, columns: [{ id: "name", title: "Team", kind: "text" }],
        roots: [["platform", "Platform"], ["validation", "Validation"], ["operations", "Operations"]].map(([id, label]) => ({ id, label })) } } },
    plan: { baselineStart: "baselineStart", baselineEnd: "baselineEnd", milestone: "milestone", proposeMoves: true,
      dependencies: [["prepare", "migrate"], ["prepare", "notes"], ["migrate", "verify"], ["verify", "release"], ["notes", "release"]].map(([predecessor, successor]) => ({ predecessor, successor })) } };
}

async function openPlan(page, { dark = false, width = 1440, rtl = false, handler = "none", change } = {}) {
  const view = definition();
  change?.(view);
  const { script, style } = runtimeAssets("grid");
  const planScript = fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-plan.js"), "utf8");
  const planStyle = fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-plan.css"), "utf8");
  const editable = view.columns.some(column => column.editable);
  const editing = editable ? ["forms", "editing"].map(name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".js"), "utf8")).join("\n") : "";
  const editingStyle = editable ? ["forms", "editing"].map(name => fs.readFileSync(path.join(repo, "CanopyX.Html/Assets/canopyx-" + name + ".css"), "utf8")).join("\n") : "";
  const json = JSON.stringify(view).replace(/</g, "\\u003c");
  const html = '<!doctype html><html lang="en"' + (rtl ? ' dir="rtl"' : '') + '><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Migration plan</title><style>body{margin:16px;font-family:system-ui}#plan-host{height:560px}' + style + planStyle + editingStyle + '</style>' +
    '<div id="plan-host" data-canopyx-host data-cx-theme="' + (dark ? "dark" : "light") + '"></div><script>' + script + "\n" + planScript + "\n" + editing +
    '\nwindow.proposals=[]; window.writerCalls=0; window.errors=[]; const host=document.getElementById("plan-host");' +
    'host.addEventListener("canopyx:planChangeProposal",event=>{ window.proposals.push(JSON.parse(JSON.stringify(event.detail))); if(window.cancelProposal)event.preventDefault(); });' +
    'const options={view:' + json + ',onError:detail=>window.errors.push(String(detail.error)),editing:{commit:()=>{window.writerCalls++;throw new Error("Plan called a writer");}}};' +
    (handler === "none" ? "" : handler === "reject" ? 'options.plan={propose:async()=>{throw new Error("Host refused proposal");}};' :
      'options.plan={propose:async(detail)=>{window.hostProposal=detail; await new Promise(resolve=>window.finishProposal=resolve);}};') +
    'window.planApi=CanopyX.createDataGrid(host,options); window.planApi.ready.then(()=>window.initialRows=JSON.stringify(window.planApi.view.rows));</script></html>';
  await page.clock.setFixedTime(new Date("2026-10-16T10:30:00Z"));
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.setViewportSize({ width, height: 760 });
  await page.route("http://127.0.0.1/plan-test.html", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://127.0.0.1/plan-test.html");
  expect(pageErrors, "the plan fixture must mount without script errors").toEqual([]);
  await page.evaluate(() => window.planApi.ready);
  await page.waitForSelector(width < 640 ? ".cx-plan-agenda-title" : ".cx-plan-task");
  await nextFrames(page);
}

const task = (page, id) => page.locator('.cx-plan-task[data-cx-record="' + id + '"]');
const actuals = page => page.evaluate(() => ({ changed: JSON.stringify(window.planApi.view.rows) !== window.initialRows, writes: window.writerCalls }));

for (const width of [768, 1024, 1440]) for (const dark of [false, true]) {
  test(`plan connectors enter horizontally and labels remain legible without collisions at ${width} ${dark ? "dark" : "light"}`, async ({ page }) => {
    await openPlan(page, { width, dark });
    const result = await page.evaluate(() => {
      const rect = element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; };
      const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const collisions = [], clipped = [];
      for (const lane of document.querySelectorAll(".cx-tl-lane")) {
        const tasks = [...lane.querySelectorAll(".cx-plan-task")];
        for (const element of tasks) {
          const title = element.querySelector(".cx-cal-ev-title"); if (!title) continue;
          if (title.scrollHeight > title.clientHeight + 1) clipped.push(title.textContent);
          if (element.classList.contains("cx-plan-label-outside") && tasks.some(other => other !== element &&
              (overlap(rect(title), rect(other)) || overlap(rect(title), rect(other.querySelector(".cx-cal-ev-title")))))) collisions.push(title.textContent);
        }
      }
      return { collisions, clipped, routes: [...document.querySelectorAll(".cx-plan-links path")].map(path => path.getAttribute("d").split(" M")[0]) };
    });
    expect(result.collisions).toEqual([]); expect(result.clipped).toEqual([]);
    expect(result.routes.length).toBeGreaterThan(0);
    for (const route of result.routes) {
      expect(route).toMatch(/ H-?[\d.]+$/);
      if (route.includes(" V")) {
        const horizontal = [...route.matchAll(/ H(-?[\d.]+)/g)].map(match => Number(match[1]));
        expect(Math.abs(horizontal.at(-1) - horizontal.at(-2))).toBeGreaterThanOrEqual(8);
      }
    }
    expect(await actuals(page)).toEqual({ changed: false, writes: 0 });
  });
}

test("plan blocks calendar keyboard writes with proposals enabled or disabled", async ({ page }) => {
  for (const proposeMoves of [true, false]) {
    await openPlan(page, { change: view => {
      view.plan.proposeMoves = proposeMoves; view.calendar.editable = true;
      for (const column of view.columns) if (["starts", "ends", "owner"].includes(column.id)) column.editable = true;
    } });
    await task(page, "migrate").focus(); await page.keyboard.press("F2");
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
    await nextFrames(page);
    expect(await actuals(page)).toEqual({ changed: false, writes: 0 });
    expect(await page.evaluate(() => window.planApi.getChanges())).toEqual([]);
    expect(await page.evaluate(() => !!window.planApi.calMoving)).toBe(false);
    expect(await page.evaluate(() => window.proposals.length)).toBe(0);
  }
});

test("plan keeps the calendar writer closed during a pending host proposal", async ({ page }) => {
  await openPlan(page, { handler: "pending", change: view => {
    view.calendar.editable = true;
    for (const column of view.columns) if (["starts", "ends", "owner"].includes(column.id)) column.editable = true;
  } });
  await task(page, "migrate").focus(); await page.keyboard.press("Alt+ArrowRight");
  await page.waitForFunction(() => typeof window.finishProposal === "function");
  const box = await task(page, "notes").boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 64, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
  await task(page, "verify").focus(); await page.keyboard.press("F2");
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
  await page.evaluate(() => window.finishProposal()); await nextFrames(page);
  expect(await actuals(page)).toEqual({ changed: false, writes: 0 });
  expect(await page.evaluate(() => window.planApi.getChanges())).toEqual([]);
  expect(await page.evaluate(() => window.proposals.length)).toBe(1);
});

test("plan renders task bars, milestones, dependency arrows, full-network criticality and baseline", async ({ page }) => {
  await openPlan(page, { change: view => view.plan.dependencies.push({ predecessor: "prepare", successor: "release" }) });
  await expect(page.locator(".cx-plan-task")).toHaveCount(5);
  await expect(page.locator(".cx-plan-links path")).toHaveCount(6);
  // The redundant direct edge joins two critical tasks, but has slack and is not itself on the critical path.
  await expect(page.locator(".cx-plan-link-critical")).toHaveCount(3);
  // Zero-duration milestone baselines add no elapsed-duration bar.
  await expect(page.locator(".cx-plan-baseline")).toHaveCount(4);
  await expect(task(page, "release")).toHaveClass(/cx-plan-milestone/);
  for (const id of ["prepare", "migrate", "verify", "release"]) await expect(task(page, id)).toHaveClass(/cx-plan-critical/);
  await expect(task(page, "notes")).not.toHaveClass(/cx-plan-critical/);
  await expect(task(page, "prepare")).toHaveAttribute("aria-label", /Baseline:.*2026/);
  await expect(page.locator(".cx-plan")).toHaveAttribute("data-cx-plan-complete", "true");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
});

test("plan keeps criticality from offscreen inline tasks and shows actual dependency violations", async ({ page }) => {
  await openPlan(page, { change: view => {
    view.rows.find(row => row.id === "verify").cells.ends = "2026-11-20T00:00:00.000Z";
    view.columns.find(column => column.id === "ends").editable = true;
  } });
  await expect(task(page, "verify")).toHaveClass(/cx-plan-critical/);
  await expect(task(page, "release")).toHaveClass(/cx-plan-conflict/);
  await expect(page.locator(".cx-plan-link-conflict")).toHaveCount(1);
  await page.evaluate(() => window.planApi.setCellValue("verify", "ends", "2026-10-19T00:00:00.000Z"));
  await expect(task(page, "release")).not.toHaveClass(/cx-plan-conflict/);
  await page.evaluate(() => window.planApi.setQuery({ search: "runbooks" }));
  await expect(task(page, "notes")).toBeVisible();
  await expect(task(page, "notes")).not.toHaveClass(/cx-plan-critical/);
});

test("keyboard proposes dates and dependency conflicts without a host and never changes actual records", async ({ page }) => {
  await openPlan(page);
  await task(page, "migrate").focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(() => page.evaluate(() => window.proposals.length)).toBe(1);
  const proposal = await page.evaluate(() => window.proposals[0]);
  expect(proposal.id).toBe("migrate");
  expect(proposal.proposed.start).toBe(iso(13));
  expect(proposal.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "dependency", id: "prepare" })]));
  expect(await actuals(page)).toEqual({ changed: false, writes: 0 });
  await expect(page.locator(".cx-plan-proposal")).toHaveCount(0);
});

test("pointer drag previews dependency conflicts and emits the proposed resource on drop", async ({ page }) => {
  await openPlan(page, { handler: "pending", change: view => {
    view.calendar.editable = true;
    for (const column of view.columns) if (["starts", "ends", "owner"].includes(column.id)) column.editable = true;
  } });
  const bar = await task(page, "migrate").boundingBox(), lane = await page.locator('.cx-tl-lane[data-cx-resource="validation"]').boundingBox();
  await page.mouse.move(bar.x + 20, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + 64, lane.y + lane.height / 2, { steps: 8 });
  await expect(page.locator(".cx-plan-proposal-invalid")).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => !!window.hostProposal)).toBe(true);
  expect(await page.evaluate(() => window.hostProposal.proposed.resource)).toBe("validation");
  expect(await actuals(page)).toEqual({ changed: false, writes: 0 });
  await page.evaluate(() => window.finishProposal());
  await expect(page.locator(".cx-plan-proposal")).toHaveCount(0);
  expect(await actuals(page)).toEqual({ changed: false, writes: 0 });
});

test("canceling a drag or a proposal and a rejecting async host preserve the original task", async ({ page }) => {
  await openPlan(page, { handler: "reject" });
  const box = await task(page, "migrate").boundingBox();
  await page.mouse.move(box.x + 12, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + 60, box.y + 12, { steps: 6 });
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect(await page.evaluate(() => window.proposals.length)).toBe(0);
  await page.evaluate(() => window.cancelProposal = true);
  await task(page, "migrate").focus(); await page.keyboard.press("Alt+ArrowRight");
  expect(await page.evaluate(() => window.errors)).toEqual([]);
  await page.evaluate(() => window.cancelProposal = false);
  await task(page, "migrate").focus(); await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(() => page.evaluate(() => window.errors)).toContain("Error: Host refused proposal");
  expect(await actuals(page)).toEqual({ changed: false, writes: 0 });
});

test("print includes milestone baseline criticality and conflict text with localized headings", async ({ page }) => {
  await openPlan(page, { change: view => {
    view.labels = { planMilestone: "Kamień milowy", planBaselineLabel: "Plan bazowy", planCritical: "Ścieżka krytyczna", planDependencies: "Zależności" };
    view.rows.find(row => row.id === "release").cells.starts = iso(19); view.rows.find(row => row.id === "release").cells.ends = iso(19);
  } });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const print = page.locator(".cx-plan-print");
  await expect(print.locator("tbody tr")).toHaveCount(5);
  await expect(print).toContainText("Kamień milowy"); await expect(print).toContainText("Ścieżka krytyczna");
  await expect(print.locator("thead")).toContainText("Plan bazowy"); await expect(print.locator("thead")).toContainText("Zależności");
  await expect(print.locator("tbody")).toContainText("Dependency conflict with Verify workloads");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(print).toHaveCount(0);
});

for (const sample of [{ width: 1440, dark: false }, { width: 390, dark: true }, { width: 900, dark: false, rtl: true }]) {
  test("plan remains contained and keyboard reachable at " + sample.width + (sample.dark ? " dark" : " light") + (sample.rtl ? " RTL" : ""), async ({ page }) => {
    await openPlan(page, sample);
    const target = sample.width < 640 ? page.locator('[data-cx-plan-record="migrate"]') : task(page, "migrate");
    await target.focus();
    await page.keyboard.press("Alt+ArrowRight");
    const expected = sample.rtl ? iso(13) : iso(15);
    expect(await page.evaluate(() => window.proposals[0].proposed.start)).toBe(expected);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const results = await new AxeBuilder({ page }).include(".cx-cal").analyze();
    expect(results.violations.filter(item => ["critical", "serious"].includes(item.impact)).map(item => item.id)).toEqual([]);
    if (process.env.CANOPYX_EVIDENCE) await page.screenshot({ path: path.join(process.env.CANOPYX_EVIDENCE, "plan-" + sample.width + (sample.dark ? "-dark" : "-light") + (sample.rtl ? "-rtl" : "") + ".png") });
  });
}

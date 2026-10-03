import { test, expect } from "@playwright/test";
import { viewPage, row, nextFrames } from "./support.mjs";

const definition = { protocol: "canopyx/2", type: "view", id: "eligibility", label: "Records", rowHeight: 28,
  pageSize: 50, selection: "multiple", dragDrop: true, source: { kind: "inline" },
  columns: [{ id: "name", title: "Name", kind: "text", width: 320, editable: true },
    { id: "amount", title: "Amount", kind: "number", width: 140, editable: true }],
  roots: [{ id: "a", label: "Atlas" }, { id: "b", label: "Beacon" }] };

async function mount(page, options, view = definition) {
  const html = viewPage(view).replace("</head>", `<script>CanopyX.configure('eligibility',${options});</script></head>`);
  await page.route("https://eligibility.test/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://eligibility.test/"); await page.waitForSelector("[data-cx-ready]"); await nextFrames(page);
}

for (const cells of [undefined, { amount: null }, { amount: { text: "Not set" } }]) {
  test(`empty number cells submit a numeric first value (${JSON.stringify(cells)})`, async ({ page }) => {
    const view = { ...definition, roots: [{ id: "a", label: "Atlas", cells }, definition.roots[1]] };
    await mount(page, "{onEdit(proposal){window.edit=proposal;return true}}", view);
    await page.evaluate(() => document.querySelector(".cx-host").canopyx.beginEdit("a", "amount"));
    const editor = page.getByRole("spinbutton", { name: "Edit Amount" });
    await expect(editor).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect(await page.evaluate(() => window.edit)).toBeUndefined();
    await editor.fill("23.5"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.edit)).toEqual({
      nodeId: "a", path: ["a"], column: "amount", previous: null, value: 23.5
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("move menus expose eligibility for each placement and preserve a rejected move", async ({ page }) => {
  await mount(page, `{canDrop(proposal){window.proposal=proposal;return proposal.placement==='after'},
    onDrop(proposal){window.drop=proposal;return true}}`);
  await row(page, "a").press("Control+Shift+x"); await row(page, "b").press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Move here", exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("menuitem", { name: "Move before", exact: true })).toHaveAttribute("aria-disabled", "true");
  const after = page.getByRole("menuitem", { name: "Move after", exact: true });
  await expect(after).not.toHaveAttribute("aria-disabled", "true");
  await page.getByRole("menuitem", { name: "Move here", exact: true }).press("Enter");
  expect(await page.evaluate(() => window.drop)).toBeUndefined();
  await after.click();
  await expect.poll(() => page.evaluate(() => window.drop)).toEqual({
    nodes: [{ nodeId: "a", path: ["a"] }], target: { nodeId: "b", path: ["b"] }, placement: "after"
  });
});

test("a rejected keyboard move leaves the command available to the host", async ({ page }) => {
  await mount(page, `{canDrop:()=>false,onDrop(){window.calls=(window.calls||0)+1;return true}}`);
  await row(page, "a").press("Control+Shift+x"); await row(page, "b").focus();
  await page.evaluate(() => document.addEventListener("keydown", event => {
    if (event.key.toLowerCase() === "v") queueMicrotask(() => window.consumed = event.defaultPrevented);
  }, { capture: true }));
  await page.keyboard.press("Control+Shift+v");
  expect(await page.evaluate(() => ({ consumed: window.consumed, calls: window.calls || 0 }))).toEqual({ consumed: false, calls: 0 });
});

test("native drag indicators honor the placement before advertising a target", async ({ page }) => {
  await mount(page, `{canDrop:proposal=>proposal.placement==='before',onDrop:()=>true}`);
  const result = await page.evaluate(() => {
    const source = document.querySelector('[data-cx-id="a"]'), target = document.querySelector('[data-cx-id="b"]');
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    const bounds = target.getBoundingClientRect();
    const probe = fraction => {
      const event = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer,
        clientX: bounds.left + 20, clientY: bounds.top + bounds.height * fraction });
      target.dispatchEvent(event);
      return { consumed: event.defaultPrevented, highlighted: target.classList.contains("cx-drop-target"),
        placement: target.getAttribute("data-cx-drop-placement") };
    };
    const inside = probe(0.5), before = probe(0.1), after = probe(0.9);
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
    return { inside, before, after };
  });
  expect(result).toEqual({ inside: { consumed: false, highlighted: false, placement: null },
    before: { consumed: true, highlighted: true, placement: "before" },
    after: { consumed: false, highlighted: false, placement: null } });
});

test("the move-source menu honors every selected member's drag eligibility", async ({ page }) => {
  await mount(page, "{canDrag:node=>node.id!=='b',onDrop:()=>true}");
  expect(await page.evaluate(() => document.querySelector(".cx-host").canopyx.setSelection(["a", "b"]))).toBe(true);
  await row(page, "a").press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Move this node", exact: true })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("menuitem", { name: "Move this node", exact: true }).press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
});

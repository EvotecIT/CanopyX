// What a host relies on when it searches a bundle: the index documents of "Search Index" in docs/data-protocol.md are
// read as written, a query loads a bounded part of the index, and an exact label match is never crowded out.
import { expect, test } from "@playwright/test";
import { searchIndex, shardKey, viewPage } from "./support.mjs";

const view = { protocol: "canopyx/1", type: "view", id: "index", label: "Index", columns: [{ id: "name", title: "Name", width: 400 }],
  source: { kind: "inline" }, roots: [] };

/** Serves the documents as a sidecar bundle and returns the references the page requested, in order. */
async function serve(page, docs) {
  const requested = [];
  await page.route("https://canopyx.test/", (route) => route.fulfill({ contentType: "text/html", body: viewPage(view) }));
  await page.route("https://canopyx.test/data/**", (route) => {
    const ref = new URL(route.request().url()).pathname.slice(6, -3);
    requested.push(ref);
    if (!docs[ref]) return route.abort();
    return route.fulfill({ contentType: "application/javascript", body: `(self.CanopyXSidecar=self.CanopyXSidecar||[]).push(${JSON.stringify([view.id, ref, docs[ref]])});` });
  });
  await page.goto("https://canopyx.test/");
  await page.waitForSelector("[data-cx-ready]");
  return requested;
}

/** Searches through one sidecar source per page, so later queries see what earlier ones loaded. */
function search(page, query, limit = 20) {
  return page.evaluate(({ id, query, limit }) => {
    window.indexSource = window.indexSource || CanopyX.sources.sidecar({ id, source: { kind: "sidecar", base: "/data/" } });
    return window.indexSource.search(query, limit);
  }, { id: view.id, query, limit });
}

const manifest = (index) => ({ protocol: "canopyx/1", type: "manifest", view: view.id, root: "r/0", search: index });

test.beforeEach(({ page }) => {
  page.runtimeErrors = [];
  page.on("pageerror", (error) => page.runtimeErrors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(page.runtimeErrors).toEqual([]);
});

test("entries rebuild ids shared with the parent, the path, the context, and the kind", async ({ page }) => {
  // Entries 1 and 2 end with their parent's whole id; entry 4 starts with its parent's.
  const entries = [
    [-1, 0, "DC=corp,DC=example", 0, "corp.example", 0],
    [0, 0, "OU=Sales,", 18, "Sales", 1],
    [1, 0, "OU=Users,", 27, "Users and groups", 1],
    [-1, 0, "share/a", 0, "Share"],
    [3, 7, "/plans", 0, "Plans"]
  ];
  const docs = {
    manifest: manifest({ entryCount: 5, entryFiles: [0, 2], kinds: ["domain", "unit"], shards: { us: 1, gr: 1, pl: 1 } }),
    "s/k-us": { protocol: "canopyx/1", type: "searchShard", key: "us", words: ["users"], postings: [[2]] },
    "s/k-gr": { protocol: "canopyx/1", type: "searchShard", key: "gr", words: ["groups"], postings: [[2]] },
    "s/k-pl": { protocol: "canopyx/1", type: "searchShard", key: "pl", words: ["plans"], postings: [[4]] },
    "e/0": { protocol: "canopyx/1", type: "searchEntries", first: 0, stem: [], entries: entries.slice(0, 2) },
    // The second file reaches entries 0 and 1 only through its stem.
    "e/1": { protocol: "canopyx/1", type: "searchEntries", first: 2, stem: [[0].concat(entries[0]), [1].concat(entries[1])], entries: entries.slice(2) }
  };
  const requested = await serve(page, docs);

  expect((await search(page, "groups us")).hits).toEqual([{ path: ["DC=corp,DC=example", "OU=Sales,DC=corp,DC=example", "OU=Users,OU=Sales,DC=corp,DC=example"],
    label: "Users and groups", kind: "unit", context: "corp.example / Sales" }]);
  expect((await search(page, "plan")).hits).toEqual([{ path: ["share/a", "share/a/plans"], label: "Plans", context: "Share" }]);
  expect(requested.filter((ref) => ref.startsWith("e/"))).toEqual(["e/1"]);
});

test("posting lists decode gaps and runs, and words intersect", async ({ page }) => {
  const labels = Array.from({ length: 40 }, (_, i) => "Item " + i + (i % 2 ? " odd" : " even") + (i >= 30 ? " late" : ""));
  const docs = {
    manifest: manifest({ entryCount: 40, entryFiles: [0], kinds: [], shards: { it: 40, od: 20, la: 10 } }),
    // "item" is one run of all 40 entries, "odd" is every second one, "late" is a run of ten that starts at 30.
    "s/k-it": { protocol: "canopyx/1", type: "searchShard", key: "it", words: ["item"], postings: [[0, -39]] },
    "s/k-od": { protocol: "canopyx/1", type: "searchShard", key: "od", words: ["odd"], postings: [[1].concat(Array(19).fill(2))] },
    "s/k-la": { protocol: "canopyx/1", type: "searchShard", key: "la", words: ["late"], postings: [[30, -9]] },
    "e/0": { protocol: "canopyx/1", type: "searchEntries", first: 0, stem: [], entries: labels.map((label, i) => [-1, 0, "n" + i, 0, label]) }
  };
  await serve(page, docs);

  const all = await search(page, "item", 5);
  expect(all.total).toBe(40);
  expect(all.truncated).toBe(true);
  const late = await search(page, "item odd late");
  expect(late.hits.map((hit) => hit.path[0])).toEqual(["n31", "n33", "n35", "n37", "n39"]);
  expect(late.total).toBe(5);
  expect(late.truncated).toBe(false);
});

test("a one-unit query word selects the shards of every prefix it starts", async ({ page }) => {
  const index = searchIndex([{ path: ["one"], label: "Abacus one" }, { path: ["two"], label: "Abacus two" }, { path: ["both"], label: "Abacus t o" }]);
  const requested = await serve(page, { manifest: manifest(index.search), ...index.docs });

  const one = await search(page, "abacus o");
  expect(one.hits.map((hit) => hit.path[0])).toEqual(["one", "both"]);
  expect(one.total).toBe(2);
  expect(one.truncated).toBe(false);
  expect((await search(page, "abacus t")).hits.map((hit) => hit.path[0])).toEqual(["both", "two"]);
  // "o" reads the shard of the word "o" and the shard of the words that start with "on"; no label is scanned.
  expect(requested.filter((ref) => ref.startsWith("s/k-o")).sort()).toEqual(["s/k-o-", "s/k-on"]);
  expect(requested.filter((ref) => ref.startsWith("e/"))).toEqual(["e/0"]);
});

for (const [query, label, labelWords, tokenShard, token] of [
  ["Budget 2026", "(Budget 2026)", ["budget", "2026"], "_00001", "108bf3fa"],
  ["  (budget 2026). ", "(Budget 2026)", ["budget", "2026"], "_00001", "108bf3fa"],
  ["\u0142\u00f3d\u017a OFFICE", "\u0141\u00d3D\u0179 office", ["\u0142\u00f3d\u017a", "office"], "_00007", "7b6f5428"]
]) {
  test(`the label token of ${JSON.stringify(query)} is the one the bundle writer files`, async ({ page }) => {
    // The same vectors are pinned for the C# writer in CanopyX.Tests (Write_Search_FilesEachLabelUnderItsToken).
    // Sixty longer labels with the same words come first; only the token leads to entry 60 within the ten ranked.
    const entries = Array.from({ length: 60 }, (_, i) => [-1, 0, "n" + i, 0, label + " copy " + i]).concat([[-1, 0, "exact", 0, label]]);
    const docs = {
      manifest: manifest({ entryCount: 61, entryFiles: [0], kinds: [], shards: { [tokenShard]: 1 } }),
      ["s/k-" + tokenShard]: { protocol: "canopyx/1", type: "searchShard", key: tokenShard, words: ["\u0000" + token], postings: [[60]] },
      "e/0": { protocol: "canopyx/1", type: "searchEntries", first: 0, stem: [], entries }
    };
    for (const word of labelWords) {
      const key = shardKey(word.slice(0, 2));
      docs.manifest.search.shards[key] = 61;
      docs["s/k-" + key] = { protocol: "canopyx/1", type: "searchShard", key, words: [word], postings: [[0, -60]] };
    }
    await serve(page, docs);

    const result = await search(page, query, 2);
    expect(result.total).toBe(61);
    expect(result.hits[0]).toEqual({ path: ["exact"], label });
  });
}

test("a label equal to the query ranks first behind any number of other matches", async ({ page }) => {
  const hits = Array.from({ length: 600 }, (_, i) => ({ path: ["p" + i], label: "Firewall policy " + i }));
  hits.push({ path: ["exact"], label: "firewall" });
  const index = searchIndex(hits);
  // 600 matches in 120 entry files come before the exact one, far more than a query ranks.
  const entries = index.docs["e/0"].entries;
  const docs = { manifest: manifest({ ...index.search, entryFiles: Array.from({ length: 121 }, (_, i) => i * 5) }), ...index.docs };
  for (let file = 0; file <= 120; file++) {
    docs["e/" + file] = { protocol: "canopyx/1", type: "searchEntries", first: file * 5, stem: [], entries: entries.slice(file * 5, file * 5 + 5) };
  }
  const requested = await serve(page, docs);

  const result = await search(page, "Firewall", 10);
  expect(result.hits[0]).toEqual({ path: ["exact"], label: "firewall" });
  expect(result.hits).toHaveLength(10);
  expect(result.total).toBe(601);
  expect(result.truncated).toBe(true);
  // The exact match's file plus the first files in document order: enough to rank 50 candidates, not all 121 files.
  expect(requested.filter((ref) => ref.startsWith("e/")).length).toBeLessThanOrEqual(12);
});

for (const [name, change, message] of [
  ["an entry that comes before its parent", (docs) => { docs["e/0"].entries[0][0] = 0; }, "entry 0"],
  ["an entry that shares more than its parent id holds", (docs) => { docs["e/0"].entries[1][1] = 99; }, "entry 1"],
  ["a posting that points past the entry table", (docs) => { docs["s/k-ab"].postings[0] = [0, 7]; }, "shard"],
  ["a kind the manifest does not list", (docs) => { docs["e/0"].entries[1][5] = 3; }, "kind"],
  ["an entry file list that does not start at zero", (docs) => { docs.manifest.search.entryFiles = [1]; }, "index"]
]) {
  test(`${name} is rejected before it becomes a hit`, async ({ page }) => {
    const index = searchIndex([{ path: ["parent"], label: "Abacus parent" }, { path: ["parent", "child"], label: "Abacus child" }]);
    const docs = { manifest: manifest(index.search), ...index.docs };
    change(docs);
    await serve(page, docs);

    const error = await page.evaluate(async (id) => {
      try {
        await CanopyX.sources.sidecar({ id, source: { kind: "sidecar", base: "/data/" } }).search("abacus", 20);
        return null;
      } catch (caught) {
        return caught.message;
      }
    }, view.id);
    expect(error).toContain(message);
  });
}

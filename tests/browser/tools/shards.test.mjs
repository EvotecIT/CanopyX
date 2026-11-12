import assert from "node:assert/strict";
import test from "node:test";
import { laneProblems, planShards } from "./shards.mjs";

const ids = [
  ...["a", "b", "c", "d", "e"].map(title => `[webkit] › big.spec.mjs › ${title}`),
  ...["a", "b"].map(title => `[webkit] › small.spec.mjs › group › ${title}`),
  ...["one", "two", "three", "four"].map(page => `[webkit] › sweep.spec.mjs › axe on ${page}`),
  "[visual] › big.spec.mjs › a"
];

test("shards keep serial spec files whole, stripe parallel-file tests and balance test counts", () => {
  const shards = planShards(ids, 3, file => file === "sweep.spec.mjs");
  assert.deepEqual(shards.map(shard => shard.lines), [
    ["[webkit] › sweep.spec.mjs › axe on one", "[webkit] › sweep.spec.mjs › axe on four", "[visual] › big.spec.mjs"],
    ["[webkit] › sweep.spec.mjs › axe on two", "[webkit] › big.spec.mjs"],
    ["[webkit] › sweep.spec.mjs › axe on three", "[webkit] › small.spec.mjs"]
  ]);
  assert.deepEqual(shards.flatMap(shard => shard.ids).sort(), [...ids].sort());
  assert.deepEqual(shards.map(shard => shard.ids.length), [3, 6, 3]);
});

test("lane coverage rejects missing shards and tests that were dropped, duplicated, unlisted or not run once, or only skipped", () => {
  const records = planShards(ids, 2, () => false).map((shard, index) => ({ shard: index + 1, shards: 2, full: ids,
    assigned: shard.ids, selected: shard.ids, results: shard.ids.map(id => ({ id, status: "passed" })) }));
  assert.deepEqual(laneProblems(records, 2), []);
  assert.deepEqual(laneProblems(records.slice(0, 1), 2).slice(0, 1), ["shard 2/2 has no record"]);
  const [first, second] = records;
  const dropped = second.assigned[0];
  const broken = [first, { ...second, assigned: second.assigned.slice(1), selected: second.selected.slice(1),
    results: [...second.results.slice(1), { id: first.assigned[0], status: "passed" }, { id: "[webkit] › new.spec.mjs › x", status: "passed" }] }];
  assert.deepEqual(laneProblems(broken, 2), [
    `shard 2: ran without assignment: ${first.assigned[0]}`,
    "shard 2: ran without assignment: [webkit] › new.spec.mjs › x",
    `assigned to 0 shards: ${dropped}`
  ]);
  const unrun = [first, { ...second, results: second.results.slice(1) }];
  assert.deepEqual(laneProblems(unrun, 2), [`shard 2: ran 0 times: ${dropped}`]);
  const empty = [first, { ...second, assigned: [], selected: [], results: [] }];
  assert.ok(laneProblems(empty, 2).includes("shard 2: the shard has no tests"));
  const skipped = [first, { ...second, results: second.results.map(result => ({ ...result, status: "skipped" })) }];
  assert.deepEqual(laneProblems(skipped, 2), ["shard 2: every test skipped"]);
});

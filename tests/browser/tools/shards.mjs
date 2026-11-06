// Runs one deterministic shard of the browser tests and proves that it ran exactly the tests assigned to it:
//   CANOPYX_TEST_SHARD=2/4 node tools/shards.mjs [playwright test arguments]
// It lists the complete suite for the selected engines, keeps each spec file whole (tests inside a file keep their
// order on one worker) and balances files by test count. Files that declare test.describe.configure({ mode: "parallel" })
// have independent tests, which are striped across the shards one by one. The record in shard-results/shard.json lets
// the Quality coverage job check that the shards of a lane together ran every listed test exactly once.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const browserRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parallelFile = /^test\.describe\.configure\(\{\s*mode:\s*"parallel"/m;

export function parseShard(text) {
  const parts = /^([1-9]\d*)\/([1-9]\d*)$/.exec(text || "");
  const shard = parts && { current: Number(parts[1]), total: Number(parts[2]) };
  if (!shard || !Number.isSafeInteger(shard.total) || shard.current > shard.total) {
    throw new Error("CANOPYX_TEST_SHARD must be current/total with 1 <= current <= total.");
  }
  return shard;
}

/** Splits test ids ("[project] › file › titles") into shards; each shard holds test-list lines and the ids they select. */
export function planShards(ids, total, isParallelFile) {
  const shards = Array.from({ length: total }, () => ({ lines: [], ids: [] }));
  const files = new Map();
  let stripe = 0;
  for (const id of ids) {
    const [project, file] = id.split(" › ");
    if (isParallelFile(file)) {
      const shard = shards[stripe++ % total];
      shard.lines.push(id);
      shard.ids.push(id);
      continue;
    }
    const key = `${project} › ${file}`;
    if (!files.has(key)) files.set(key, []);
    files.get(key).push(id);
  }
  // Largest files first, each to the shard with the fewest tests; ties keep listing order and the lowest shard.
  const units = [...files].map(([line, unitIds], index) => ({ line, ids: unitIds, index }))
    .sort((a, b) => b.ids.length - a.ids.length || a.index - b.index);
  for (const unit of units) {
    const shard = shards.reduce((best, candidate) => candidate.ids.length < best.ids.length ? candidate : best);
    shard.lines.push(unit.line);
    shard.ids.push(...unit.ids);
  }
  return shards;
}

/** Problems with one shard's run: tests Playwright selected or ran other than once each for exactly the assigned ids. */
export function shardProblems(assigned, selected, results) {
  const problems = [];
  const expected = new Set(assigned);
  if (expected.size === 0) problems.push("the shard has no tests");
  if (expected.size !== assigned.length) problems.push("the shard assigns a test twice");
  const picked = new Set(selected);
  for (const id of assigned) if (!picked.has(id)) problems.push(`not selected: ${id}`);
  for (const id of picked) if (!expected.has(id)) problems.push(`selected without assignment: ${id}`);
  if (picked.size !== selected.length) problems.push("Playwright selected a test twice");
  const runs = new Map();
  for (const result of results) runs.set(result.id, (runs.get(result.id) || 0) + 1);
  for (const id of assigned) if (runs.get(id) !== 1) problems.push(`ran ${runs.get(id) || 0} times: ${id}`);
  for (const id of runs.keys()) if (!expected.has(id)) problems.push(`ran without assignment: ${id}`);
  // Skipped tests still end once; a shard whose every test skipped proves nothing about its engine.
  if (results.length && results.every(result => result.status === "skipped")) problems.push("every test skipped");
  return problems;
}

/** Problems across the records of one lane (platform and engines): every listed test assigned and run exactly once. */
export function laneProblems(records, total) {
  const problems = [];
  const byShard = new Map(records.map(record => [record.shard, record]));
  for (let shard = 1; shard <= total; shard++) if (!byShard.has(shard)) problems.push(`shard ${shard}/${total} has no record`);
  if (records.length !== byShard.size || records.some(record => record.shards !== total || record.shard > total)) {
    problems.push(`records do not match ${total} distinct shards`);
  }
  const full = records[0]?.full || [];
  if (full.length === 0) problems.push("the complete test list is empty");
  for (const record of records) {
    if (record.full.length !== full.length || record.full.some((id, index) => id !== full[index])) {
      problems.push(`shard ${record.shard} listed a different suite`);
    }
    for (const problem of shardProblems(record.assigned, record.selected, record.results)) problems.push(`shard ${record.shard}: ${problem}`);
  }
  const owners = new Map();
  for (const record of records) for (const id of record.assigned) owners.set(id, [...(owners.get(id) || []), record.shard]);
  for (const id of full) if ((owners.get(id) || []).length !== 1) problems.push(`assigned to ${(owners.get(id) || []).length} shards: ${id}`);
  const listed = new Set(full);
  for (const id of owners.keys()) if (!listed.has(id)) problems.push(`assigned but not listed: ${id}`);
  return problems;
}

function playwright(args, record, quiet = false) {
  const result = spawnSync(process.execPath, [path.join(browserRoot, "node_modules/@playwright/test/cli.js"), "test", ...args],
    { cwd: browserRoot, stdio: quiet ? "pipe" : "inherit", encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, CANOPYX_TEST_RECORD: record } });
  // Listing prints every test; show it only when listing fails.
  if (quiet && result.status !== 0) process.stderr.write(`${result.stdout || ""}${result.stderr || ""}${result.error || ""}\n`);
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const shard = parseShard(process.env.CANOPYX_TEST_SHARD);
  const extra = process.argv.slice(2);
  const output = path.join(browserRoot, "shard-results");
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const reporter = path.join(browserRoot, "tools/test-record-reporter.mjs");
  const listed = path.join(output, "listed.json");
  if (playwright(["--list", "--reporter", reporter, ...extra], listed, true) !== 0) process.exit(1);
  const full = JSON.parse(fs.readFileSync(listed, "utf8")).selected;
  const parallel = new Map();
  const isParallelFile = file => {
    if (!parallel.has(file)) parallel.set(file, parallelFile.test(fs.readFileSync(path.join(browserRoot, "specs", file), "utf8")));
    return parallel.get(file);
  };
  const mine = planShards(full, shard.total, isParallelFile)[shard.current - 1];
  const testList = path.join(output, "test-list.txt");
  fs.writeFileSync(testList, mine.lines.join("\n") + "\n");
  console.log(`Shard ${shard.current}/${shard.total}: ${mine.ids.length} of ${full.length} listed tests in ${mine.lines.length} test-list entries.`);
  const ran = path.join(output, "ran.json");
  const status = mine.ids.length ? playwright(["--test-list", testList, "--add-reporter", reporter, ...extra], ran) : 1;
  const run = fs.existsSync(ran) ? JSON.parse(fs.readFileSync(ran, "utf8")) : { selected: [], results: [] };
  const record = { platform: process.platform, browsers: process.env.CANOPYX_TEST_BROWSERS || "chromium", shard: shard.current,
    shards: shard.total, full, assigned: mine.ids, selected: run.selected, results: run.results };
  fs.writeFileSync(path.join(output, "shard.json"), JSON.stringify(record));
  const problems = shardProblems(record.assigned, record.selected, record.results);
  for (const problem of problems.slice(0, 50)) console.error(`Shard coverage: ${problem}`);
  process.exit(status || (problems.length ? 1 : 0));
}

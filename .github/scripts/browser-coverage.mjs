// Checks the shard records of every selected browser lane: each lane's shards together ran every listed test exactly
// once (tests/browser/tools/shards.mjs). Usage: MATRIX='<quality matrix JSON>' node browser-coverage.mjs <records folder>
import fs from "node:fs";
import path from "node:path";
import { laneProblems } from "../../tests/browser/tools/shards.mjs";

const platforms = { Linux: "linux", Windows: "win32", macOS: "darwin" };

function coverageProblems(matrix, records) {
  const problems = [];
  const lanes = new Map();
  for (const job of matrix.include) {
    const key = `${platforms[job.platform.name]}/${job.engine}`;
    lanes.set(key, { name: `${job.platform.name}/${job.engine}`, shards: job.shards, records: [] });
  }
  for (const record of records) {
    const lane = lanes.get(`${record.platform}/${record.browsers}`);
    if (lane) lane.records.push(record);
    else problems.push(`unexpected record for ${record.platform}/${record.browsers} shard ${record.shard}`);
  }
  for (const lane of lanes.values()) {
    for (const problem of laneProblems(lane.records, lane.shards)) problems.push(`${lane.name}: ${problem}`);
  }
  return problems;
}

function findRecords(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return findRecords(file);
    return entry.name === "shard.json" ? [JSON.parse(fs.readFileSync(file, "utf8"))] : [];
  });
}

const matrix = JSON.parse(process.env.MATRIX || "null");
if (!matrix?.include?.length) throw new Error("MATRIX must hold the selected Quality matrix.");
// A run whose shards wrote no records leaves no folder; every lane then reports its missing shards.
const records = fs.existsSync(process.argv[2]) ? findRecords(process.argv[2]) : [];
const problems = coverageProblems(matrix, records);
for (const record of records.sort((a, b) => `${a.platform}/${a.browsers}`.localeCompare(`${b.platform}/${b.browsers}`) || a.shard - b.shard)) {
  const statuses = {};
  for (const result of record.results) statuses[result.status] = (statuses[result.status] || 0) + 1;
  console.log(`${record.platform}/${record.browsers} ${record.shard}/${record.shards}: ${record.assigned.length} of ${record.full.length} tests ${JSON.stringify(statuses)}`);
}
for (const problem of problems.slice(0, 200)) console.error(problem);
if (problems.length) {
  console.error(`${problems.length} browser coverage problem(s).`);
  process.exit(1);
}
console.log(`Every listed browser test ran exactly once in ${records.length} shards.`);

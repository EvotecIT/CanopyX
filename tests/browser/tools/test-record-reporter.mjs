// Records which tests a Playwright run selected and the final status of each test it ran, for the shard runner
// (tools/shards.mjs). CANOPYX_TEST_RECORD names the JSON file it writes.
import fs from "node:fs";
import path from "node:path";

/** The test-list line for a test: [project] › file › titles, with the file relative to the test directory. */
export function testId(rootDir, test) {
  const [, project, , ...titles] = test.titlePath();
  const file = path.relative(rootDir, test.location.file).split(path.sep).join("/");
  return [`[${project}]`, file, ...titles].join(" › ");
}

export default class TestRecordReporter {
  onBegin(config, suite) {
    this.rootDir = config.rootDir;
    this.selected = suite.allTests().map(test => testId(this.rootDir, test));
    this.results = [];
  }

  onTestEnd(test, result) {
    // Without retries each test ends once; a repeated id shows a test that ran twice.
    this.results.push({ id: testId(this.rootDir, test), status: result.status });
  }

  onEnd() {
    const file = process.env.CANOPYX_TEST_RECORD;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ selected: this.selected, results: this.results }));
  }

  printsToStdio() { return false; }
}

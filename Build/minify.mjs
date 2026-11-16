// Shortens local names and drops whitespace in the assembled runtime scripts (Build/Sync-Assets.ps1). The input is a JSON
// array of { code, module } jobs; the output is the same array of minified code. Only esbuild's identifier and whitespace
// passes run: statements, strings and property names stay as written, so the public API, CSP and Trusted Types behaviour
// do not change. A leading /* */ block (what the file is) is kept.
import fs from "node:fs";
import { transformSync } from "esbuild";

const [input, output] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(input, "utf8"));
const result = jobs.map(job => {
  const header = /^\/\*[\s\S]*?\*\/\n/.exec(job.code)?.[0] ?? "";
  const { code } = transformSync(job.code.slice(header.length), {
    loader: "js", format: job.module ? "esm" : undefined, target: "esnext", charset: "utf8", legalComments: "none",
    minifyIdentifiers: true, minifyWhitespace: true, minifySyntax: false, logLevel: "error"
  });
  return header + code;
});
fs.writeFileSync(output, JSON.stringify(result));

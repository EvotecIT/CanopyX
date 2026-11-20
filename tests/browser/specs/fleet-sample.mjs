import { test } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { repo } from "./support.mjs";

// Starts the fleet sample (CanopyX.AspNetCore over EF Core and SQLite) for the remote end-to-end specs. The solution build
// produces it; set CANOPYX_REMOTE_SAMPLE to a FleetInventory.dll to test another build.
export const candidates = [process.env.CANOPYX_REMOTE_SAMPLE,
  ...["Release", "Debug"].map(configuration => path.join(repo, "samples/FleetInventory/bin", configuration, "net10.0/FleetInventory.dll"))].filter(Boolean);
export const sample = candidates.find(file => fs.existsSync(file));
// A cold start that seeds the rows may take most of this on a hosted Windows runner. The hook that waits for it gets the
// same budget plus a margin for its own setup and for stopping a sample that never answered.
const SAMPLE_START_MS = 90000, SAMPLE_HOOK_MARGIN_MS = 15000;

/**
 * Starts the sample from a beforeAll hook and waits until readyPath answers. Gives the hook a timeout derived from the
 * start budget. Returns { base, stop }; stop belongs in afterAll.
 */
export async function startFleetSample({ rows, prefix, readyPath }) {
  test.setTimeout(SAMPLE_START_MS + SAMPLE_HOOK_MARGIN_MS);
  test.skip(!sample, "The fleet sample is not built: " + candidates.join(", "));
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer().once("error", reject).listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const base = "http://127.0.0.1:" + port;
  const server = spawn("dotnet", [sample, "--urls", base, "--database", path.join(folder, "fleet.db"), "--rows", String(rows)],
    { cwd: path.dirname(sample), stdio: "ignore", env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Production", DOTNET_NOLOGO: "1" } });
  const stop = async () => {
    if (server.exitCode === null) {
      const exited = new Promise(resolve => server.once("exit", resolve));
      server.kill();
      await exited;
    }
    fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5 });
  };
  const deadline = Date.now() + SAMPLE_START_MS;
  for (;;) {
    // Bound each request by what is left of the budget, so a server that never answers still reaches the stop below.
    try { if ((await fetch(base + readyPath, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) })).ok) break; } catch { }
    if (Date.now() > deadline || server.exitCode !== null) { await stop(); throw new Error("The fleet sample did not start."); }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return { base, stop };
}

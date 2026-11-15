#!/usr/bin/env bun
import { resolve } from "node:path";
import { verifyDashboard } from "./verifyDashboard";

const cancellation = new AbortController();
const interrupt = () => cancellation.abort(new Error("Dashboard verification interrupted (SIGINT)"));
const terminate = () => cancellation.abort(new Error("Dashboard verification interrupted (SIGTERM)"));
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);

try {
  await verifyDashboard({
    rootDir: resolve(import.meta.dir, "../../.."),
    signal: cancellation.signal,
    log: (message) => process.stdout.write(`${message}\n`),
  });
} catch (error) {
  process.stderr.write(`Dashboard verification failed: ${String(error)}\n`);
  process.exitCode = 1;
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
}

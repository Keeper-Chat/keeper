import React from "react";
import { render } from "ink";
import { RootApp } from "./app/RootApp.js";
import { resolveServerUrl } from "./core/config.js";

async function main(): Promise<void> {
  const serverUrl = resolveServerUrl();
  render(<RootApp serverUrl={serverUrl} />);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

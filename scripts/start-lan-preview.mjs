#!/usr/bin/env node

import {
  loadLanPreviewConfig,
  readLanPreviewFiles,
  startLanPreview,
} from "./lan-preview-proxy.mjs";

let preview;
try {
  const config = loadLanPreviewConfig(process.env);
  const files = readLanPreviewFiles(config);
  preview = startLanPreview(config, files);
  await preview.ready;
} catch (error) {
  console.error(error instanceof Error ? error.message : "LAN preview could not start");
  process.exitCode = 1;
}

if (preview) {
  let stopping;
  const stop = async () => {
    stopping ??= preview.close().finally(() => process.exit(0));
    await stopping;
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

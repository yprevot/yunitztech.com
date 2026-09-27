import { nodeFileTrace } from "@vercel/nft";
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
// Trace the compiled server, keeping only the dependency files it can load.
// Static assets and compiled server files are copied separately by Docker.
const { fileList, warnings } = await nodeFileTrace(
  ["apps/web/dist/server/entry.mjs"],
  { base: process.cwd(), processCwd: process.cwd() },
);
for (const warning of warnings) console.warn(warning.message);
for (const file of fileList) {
  if (!file.startsWith("node_modules/")) continue;
  const target = join("/runtime", file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(file, target);
}
console.log(`Traced ${fileList.size} runtime files.`);

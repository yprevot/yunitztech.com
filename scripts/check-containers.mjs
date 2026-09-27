import { readFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: node check-containers.mjs ARTIFACT_DIR");

function states(file) {
  return new Map(
    readFileSync(join(directory, file), "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const [name, oom, restarts] = line.split(" ");
        return [name, { oom: oom === "true", restarts: Number(restarts) }];
      }),
  );
}
function events(file) {
  return Object.fromEntries(
    readFileSync(join(directory, file), "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split(" "))
      .map(([key, value]) => [key, Number(value)]),
  );
}

const before = states("containers-before.txt");
const after = states("containers-after.txt");
let failed = false;
console.log("service\tcgroup_peak_MiB\trestarts_delta\toom_events_delta\toom_kills_delta\tOOMKilled");
for (const service of ["gateway", "web", "api", "db"]) {
  const a = before.get(service);
  const b = after.get(service);
  if (!a || !b) throw new Error(`Missing container state for ${service}`);
  const evA = events(`${service}-memory-before.txt`);
  const evB = events(`${service}-memory-after.txt`);
  const peak = Number(readFileSync(join(directory, `${service}-memory-peak.txt`), "utf8"));
  const restartDelta = b.restarts - a.restarts;
  const oomDelta = (evB.oom || 0) - (evA.oom || 0);
  const killDelta = (evB.oom_kill || 0) - (evA.oom_kill || 0);
  console.log(
    [service, (peak / 1048576).toFixed(1), restartDelta, oomDelta, killDelta, b.oom].join("\t"),
  );
  if (b.oom || restartDelta !== 0 || oomDelta !== 0 || killDelta !== 0) failed = true;
}
if (failed) process.exitCode = 1;

import { readFileSync } from "node:fs";

const input = process.argv[2];
if (!input) throw new Error("Usage: node summarize-resources.mjs RESOURCE_SAMPLES.tsv");

function mib(value) {
  const match = value.match(/^([\d.]+)(B|KiB|MiB|GiB|TiB|kB|MB|GB)$/);
  if (!match) throw new Error(`Unknown memory unit: ${value}`);
  const factor = {
    B: 1 / 1048576,
    KiB: 1 / 1024,
    MiB: 1,
    GiB: 1024,
    TiB: 1048576,
    kB: 1000 / 1048576,
    MB: 1000000 / 1048576,
    GB: 1000000000 / 1048576,
  }[match[2]];
  return Number(match[1]) * factor;
}

const byService = new Map();
for (const line of readFileSync(input, "utf8").trim().split("\n")) {
  const [phase, timestamp, name, memory, cpu] = line.split("\t");
  if (!phase || !name) continue;
  const service = ["gateway", "web", "api", "db"].find((s) =>
    name.endsWith(`-${s}-1`),
  );
  if (!service) continue;
  const record = byService.get(service) || { idle: [], peak: 0, cpuPeak: 0 };
  const observed = mib(memory.split(" /")[0]);
  if (phase === "idle") record.idle.push(observed);
  record.peak = Math.max(record.peak, observed);
  record.cpuPeak = Math.max(record.cpuPeak, Number(cpu.replace("%", "")));
  record.last = timestamp;
  byService.set(service, record);
}

console.log("service\tidle_mean_MiB\tobserved_peak_MiB\tobserved_cpu_peak_percent\tidle_samples");
for (const service of ["gateway", "web", "api", "db"]) {
  const r = byService.get(service);
  if (!r || !r.idle.length) throw new Error(`No idle resource samples for ${service}`);
  const idleMean = r.idle.reduce((a, b) => a + b, 0) / r.idle.length;
  console.log(
    [service, idleMean.toFixed(1), r.peak.toFixed(1), r.cpuPeak.toFixed(1), r.idle.length].join("\t"),
  );
}

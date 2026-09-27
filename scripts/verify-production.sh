#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

project="yunitz-ci-${GITHUB_RUN_ID:-$$}"
artifact_dir="$PWD/qa-artifacts/$project"
image_prefix="local/yunitztech"
gateway_port="${CI_GATEWAY_PORT:-8080}"
https_port="${CI_HTTPS_PORT:-18443}"
work_dir="$(mktemp -d)"
environment_file="$work_dir/ci.env"
compose=(docker compose --project-name "$project" --env-file "$environment_file" -f compose.prod.yml -f compose.ci.yml)
proxy_pid=""
monitor_pid=""

cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then
    "${compose[@]}" ps -a || true
    "${compose[@]}" logs --no-color --tail=80 || true
  fi
  if [ -n "$proxy_pid" ]; then
    kill "$proxy_pid" 2>/dev/null || true
    wait "$proxy_pid" 2>/dev/null || true
  fi
  if [ -n "$monitor_pid" ]; then
    kill "$monitor_pid" 2>/dev/null || true
    wait "$monitor_pid" 2>/dev/null || true
  fi
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work_dir"
  exit "$result"
}
trap cleanup EXIT

password="$(openssl rand -hex 24)"
admin_password="$(openssl rand -hex 24)"
cat > "$environment_file" <<EOF
IMAGE_PREFIX=$image_prefix
IMAGE_TAG=ci
CI_GATEWAY_PORT=$gateway_port
SITE_URL=https://127.0.0.1:$https_port
POSTGRES_PASSWORD=$password
ADMIN_EMAIL=ci@example.test
ADMIN_PASSWORD=$admin_password
LEGAL_NAME=QA Example Entity
LEGAL_COUNTRY=Test Country
LEGAL_ADDRESS=1 Example Street
PRIVACY_EMAIL=privacy@example.test
TRUSTED_PROXY_CIDR=127.0.0.1/32
EOF
chmod 600 "$environment_file"

release_sha="${GITHUB_SHA:-$(git rev-parse HEAD)}"
for target in api web gateway; do
  docker build --target "$target" --build-arg "RELEASE_SHA=$release_sha" \
    --tag "$image_prefix-$target:ci" .
done

# Compose creates its named networks without starting containers. Inspect IPAM
# before gateway starts so nginx trusts only this run's Docker subnet.
"${compose[@]}" create
network_id="$(docker network ls -q \
  --filter "label=com.docker.compose.project=$project" \
  --filter 'label=com.docker.compose.network=frontend')"
test -n "$network_id"
subnet="$(docker network inspect --format '{{(index .IPAM.Config 0).Subnet}}' "$network_id")"
test -n "$subnet"
sed -i.bak "s|^TRUSTED_PROXY_CIDR=.*|TRUSTED_PROXY_CIDR=$subnet|" "$environment_file"
rm -f "$environment_file.bak"
"${compose[@]}" up -d --force-recreate --wait --wait-timeout 240

openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$work_dir/key.pem" -out "$work_dir/cert.pem" \
  -subj '/CN=127.0.0.1' -addext 'subjectAltName=IP:127.0.0.1' \
  >/dev/null 2>&1
node scripts/ci-https-proxy.mjs "$work_dir/key.pem" "$work_dir/cert.pem" \
  "$https_port" "$gateway_port" > "$work_dir/proxy.log" 2>&1 &
proxy_pid=$!

for attempt in $(seq 1 30); do
  if curl --fail --silent --insecure "https://127.0.0.1:$https_port/health" >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 30 ]; then cat "$work_dir/proxy.log"; exit 1; fi
  sleep 1
done

export ADMIN_EMAIL=ci@example.test ADMIN_PASSWORD="$admin_password"
export TEST_URL="https://127.0.0.1:$https_port" TEST_INSECURE_TLS=1
export TEST_HTTP_URL="http://127.0.0.1:$gateway_port"
export EXPECTED_SHA="$release_sha" TEST_PRODUCTION=1
export CI="${CI:-1}"
mkdir -p "$artifact_dir"
export TEST_UPLOAD_IMAGE="$artifact_dir/load-input.jpg"
node scripts/make-load-image.mjs "$TEST_UPLOAD_IMAGE"

resource_samples="$artifact_dir/resources.tsv"
phase_file="$work_dir/phase"
printf 'idle' > "$phase_file"
container_ids=()
for service in gateway web api db; do
  container_ids+=("$("${compose[@]}" ps -q "$service")")
done
for service in gateway web api db; do
  id="$("${compose[@]}" ps -q "$service")"
  docker inspect --format "${service} {{.State.OOMKilled}} {{.RestartCount}}" "$id" >> "$artifact_dir/containers-before.txt"
  docker exec "$id" cat /sys/fs/cgroup/memory.events > "$artifact_dir/${service}-memory-before.txt"
done
(
  while true; do
    phase="$(cat "$phase_file")"
    timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    docker stats --no-stream --format '{{printf "%s\t%s\t%s" .Name .MemUsage .CPUPerc}}' "${container_ids[@]}" |
      while IFS= read -r sample; do printf '%s\t%s\t%s\n' "$phase" "$timestamp" "$sample"; done
    sleep 1
  done
) > "$resource_samples" &
monitor_pid=$!
sleep "${MEASURE_IDLE_SECONDS:-60}"
printf 'load' > "$phase_file"
npm run test:e2e

kill "$monitor_pid" 2>/dev/null || true
wait "$monitor_pid" 2>/dev/null || true
monitor_pid=""
node scripts/summarize-resources.mjs "$resource_samples" | tee "$artifact_dir/resources-summary.tsv"

for service in gateway web api db; do
  container_id="$("${compose[@]}" ps -q "$service")"
  docker inspect --format "${service} memory={{.HostConfig.Memory}} nano_cpus={{.HostConfig.NanoCpus}} oom={{.State.OOMKilled}} restarts={{.RestartCount}}" "$container_id"
  docker inspect --format "${service} {{.State.OOMKilled}} {{.RestartCount}}" "$container_id" >> "$artifact_dir/containers-after.txt"
  docker exec "$container_id" cat /sys/fs/cgroup/memory.events > "$artifact_dir/${service}-memory-after.txt"
  docker exec "$container_id" cat /sys/fs/cgroup/memory.peak > "$artifact_dir/${service}-memory-peak.txt"
done
node scripts/check-containers.mjs "$artifact_dir" | tee "$artifact_dir/containers-summary.tsv"

#!/usr/bin/env bash
set -euo pipefail

# Canonical clean live-GW wrapper.
#
# Rules enforced by this script:
# - never reuse the final persisted host/tenant/individual state
# - always derive a fresh run id unless the caller overrides it explicitly
# - start the selected ICA and GW, then run the SDK live suite with the same run seed
# - run from a real user terminal/TTY, not from an isolated sandbox

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_NODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_WORKSPACE_DIR="$(cd "${SDK_NODE_DIR}/.." && pwd)"
WORKSPACE_DIR="${GDC_WORKSPACE_DIR:-${DEFAULT_WORKSPACE_DIR}}"
GW_DIR="${GW_DIR_OVERRIDE:-${WORKSPACE_DIR}/gwtemplate-node-ts}"
ICA_DIR="${ICA_DIR_OVERRIDE:-${WORKSPACE_DIR}/dataspace-ica-ts}"
GW_ENV_FILE="${GW_ENV_FILE:-${GW_DIR}/.env.local-demo}"
GW_START_SCRIPT="${GW_START_SCRIPT:-direct}"

RUN_ID="${LIVE_GW_RUN_ID:-$(date -u +%Y%m%dt%H%M%S)}"
HOST_ID_VALUE="${HOST_ID_VALUE:-livee2e-${RUN_ID}-host}"
TENANT_ID="${TENANT_ID:-livee2e-${RUN_ID}}"
TENANT_ROUTE_ID="${TENANT_ROUTE_ID:-${TENANT_ID}}"

GW_PORT="${GW_PORT:-3000}"
ICA_PORT="${ICA_PORT:-3310}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${GW_PORT}}"
ICA_BASE_URL="${ICA_BASE_URL:-http://127.0.0.1:${ICA_PORT}}"
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-globaldatacare-test}"
GW_LOG_FILE="${LIVE_GW_LOG_FILE:-${SDK_NODE_DIR}/test-results/live-gw-${RUN_ID}.log}"
ICA_LOG_FILE="${LIVE_ICA_LOG_FILE:-${SDK_NODE_DIR}/test-results/live-ica-${RUN_ID}.log}"

mkdir -p "${SDK_NODE_DIR}/test-results"

echo "[live-gw-clean] run_id=${RUN_ID}"
echo "[live-gw-clean] host_id=${HOST_ID_VALUE}"
echo "[live-gw-clean] tenant_id=${TENANT_ID}"
echo "[live-gw-clean] ica_log=${ICA_LOG_FILE}"
echo "[live-gw-clean] gw_log=${GW_LOG_FILE}"

close_port_if_busy() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti tcp:${port} || true)"
    if [[ -n "${pids}" ]]; then
      kill ${pids} >/dev/null 2>&1 || true
      sleep 1
      pids="$(lsof -ti tcp:${port} || true)"
      if [[ -n "${pids}" ]]; then
        kill -9 ${pids} >/dev/null 2>&1 || true
      fi
    fi
  fi
}

cleanup() {
  (cd "${GW_DIR}" && PORTS="${GW_PORT}" bash ./scripts/local-close.sh) >/dev/null 2>&1 || true
  close_port_if_busy "${ICA_PORT}"
}

trap cleanup EXIT

(cd "${GW_DIR}" && PORTS="${GW_PORT}" bash ./scripts/local-close.sh)
close_port_if_busy "${ICA_PORT}"

(
  cd "${ICA_DIR}"
  ICA_API_PORT="${ICA_PORT}" \
  SECURITY_MODE="${SECURITY_MODE:-demo}" \
  DEMO_ALLOW_INSECURE_BEARER="${DEMO_ALLOW_INSECURE_BEARER:-true}" \
  npm run api:local
) >"${ICA_LOG_FILE}" 2>&1 &

ICA_PID=$!
echo "[live-gw-clean] ica_pid=${ICA_PID}"

ICA_READY=0
for _ in $(seq 1 90); do
  if curl -fsS "${ICA_BASE_URL}/" >/dev/null 2>&1; then
    ICA_READY=1
    break
  fi
  if ! kill -0 "${ICA_PID}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ "${ICA_READY}" != "1" ]; then
  echo "[live-gw-clean] selected ICA did not become ready. Last log lines:" >&2
  tail -n 80 "${ICA_LOG_FILE}" >&2 || true
  exit 1
fi

(
  cd "${GW_DIR}"
  npm run build:swagger >/dev/null
  if [ "${GW_START_SCRIPT}" = "direct" ]; then
    GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT}" \
    HOST_ID_VALUE="${HOST_ID_VALUE}" \
    ICA_URL_INTERNAL="${ICA_BASE_URL}" \
    ICA_URL_EXTERNAL="${ICA_BASE_URL}" \
    npx dotenv -e "${GW_ENV_FILE}" -- \
    env \
      PORT="${GW_PORT}" \
      HOST_ID_VALUE="${HOST_ID_VALUE}" \
      ICA_URL_INTERNAL="${ICA_BASE_URL}" \
      ICA_URL_EXTERNAL="${ICA_BASE_URL}" \
      TS_NODE_TRANSPILE_ONLY=1 \
      TS_NODE_SKIP_IGNORE=1 \
      TS_NODE_COMPILER_OPTIONS='{"module":"NodeNext","moduleResolution":"NodeNext","allowImportingTsExtensions":true}' \
      node --loader ts-node/esm --experimental-specifier-resolution=node src/main.ts
  else
    GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT}" \
    HOST_ID_VALUE="${HOST_ID_VALUE}" \
    PORT="${GW_PORT}" \
    ICA_URL_INTERNAL="${ICA_BASE_URL}" \
    ICA_URL_EXTERNAL="${ICA_BASE_URL}" \
    npx dotenv -e "${GW_ENV_FILE}" -- npm run "${GW_START_SCRIPT}"
  fi
) >"${GW_LOG_FILE}" 2>&1 &

GW_PID=$!
echo "[live-gw-clean] gw_pid=${GW_PID}"

READY=0
for _ in $(seq 1 120); do
  if curl -fsS "${BASE_URL}/host/ping" >/dev/null 2>&1; then
    READY=1
    break
  fi
  if ! kill -0 "${GW_PID}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ "${READY}" != "1" ]; then
  echo "[live-gw-clean] selected GW did not become ready. Last log lines:" >&2
  tail -n 80 "${GW_LOG_FILE}" >&2 || true
  exit 1
fi

echo "[live-gw-clean] selected GW is ready at ${BASE_URL}"
echo "[live-gw-clean] selected ICA is ready at ${ICA_BASE_URL}"

cd "${SDK_NODE_DIR}"
RUN_LIVE_GW_E2E="${RUN_LIVE_GW_E2E:-1}" \
RUN_LIVE_GW_E2E_ACTOR_CHAIN="${RUN_LIVE_GW_E2E_ACTOR_CHAIN:-1}" \
RUN_LIVE_GW_E2E_INDIVIDUAL_LIFECYCLE="${RUN_LIVE_GW_E2E_INDIVIDUAL_LIFECYCLE:-1}" \
RUN_LIVE_GW_E2E_IPS_INGESTION="${RUN_LIVE_GW_E2E_IPS_INGESTION:-1}" \
RUN_LIVE_GW_E2E_PROFILE_RUNTIME="${RUN_LIVE_GW_E2E_PROFILE_RUNTIME:-1}" \
RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION="${RUN_LIVE_GW_E2E_HOST_VERIFICATION_TRANSACTION:-1}" \
LIVE_GW_E2E_TRANSPORT="${LIVE_GW_E2E_TRANSPORT:-all}" \
HOST_ID_VALUE="${HOST_ID_VALUE}" \
TENANT_ID="${TENANT_ID}" \
TENANT_ROUTE_ID="${TENANT_ROUTE_ID}" \
BASE_URL="${BASE_URL}" \
ICA_BASE_URL="${ICA_BASE_URL}" \
npm run test:e2e:live-gw

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_NODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="$(cd "${SDK_NODE_DIR}/.." && pwd)"
GW_DIR="${WORKSPACE_DIR}/gwtemplate-node-ts"
ICA_DIR="${WORKSPACE_DIR}/dataspace-ica-ts"

RUN_ID="${LIVE_CONTROLLER_RUN_ID:-$(date -u +%Y%m%dt%H%M%S)}"
HOST_ID_VALUE="${HOST_ID_VALUE:-live-controller-${RUN_ID}-host}"
TENANT_ID="${TENANT_ID:-live-controller-${RUN_ID}}"
TENANT_ROUTE_ID="${TENANT_ROUTE_ID:-${TENANT_ID}}"

GW_BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
ICA_BASE_URL="${ICA_BASE_URL:-http://127.0.0.1:3310}"
GW_LOG_FILE="${LIVE_GW_LOG_FILE:-${SDK_NODE_DIR}/test-results/live-controller-gw-core-${RUN_ID}.log}"
ICA_LOG_FILE="${LIVE_ICA_LOG_FILE:-${SDK_NODE_DIR}/test-results/live-controller-ica-${RUN_ID}.log}"
PDF_PATH="${LIVE_GW_HOST_VERIFICATION_PDF_PATH:-${WORKSPACE_DIR}/examples/TEST-A4-Antifraud.pdf}"

mkdir -p "${SDK_NODE_DIR}/test-results"

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
  (cd "${GW_DIR}" && bash ./scripts/local-close.sh) >/dev/null 2>&1 || true
  close_port_if_busy 3310
}

trap cleanup EXIT

echo "[live-controller] run_id=${RUN_ID}"
echo "[live-controller] host_id=${HOST_ID_VALUE}"
echo "[live-controller] tenant_id=${TENANT_ID}"
echo "[live-controller] pdf_path=${PDF_PATH}"
echo "[live-controller] ica_log=${ICA_LOG_FILE}"
echo "[live-controller] gw_log=${GW_LOG_FILE}"

(cd "${GW_DIR}" && bash ./scripts/local-close.sh)
close_port_if_busy 3310

(
  cd "${ICA_DIR}"
  SECURITY_MODE="${SECURITY_MODE:-demo}" \
  DEMO_ALLOW_INSECURE_BEARER="${DEMO_ALLOW_INSECURE_BEARER:-true}" \
  npm run api:local
) >"${ICA_LOG_FILE}" 2>&1 &

ICA_PID=$!

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
  echo "[live-controller] ICA did not become ready. Last log lines:" >&2
  tail -n 80 "${ICA_LOG_FILE}" >&2 || true
  exit 1
fi

(
  cd "${GW_DIR}"
  npm run build:swagger >/dev/null
  HOST_ID_VALUE="${HOST_ID_VALUE}" \
  ICA_URL_INTERNAL="${ICA_BASE_URL}" \
  ICA_URL_EXTERNAL="${ICA_BASE_URL}" \
  npx dotenv -e .env.local-demo -- \
  env \
    HOST_ID_VALUE="${HOST_ID_VALUE}" \
    ICA_URL_INTERNAL="${ICA_BASE_URL}" \
    ICA_URL_EXTERNAL="${ICA_BASE_URL}" \
    TS_NODE_TRANSPILE_ONLY=1 \
    TS_NODE_SKIP_IGNORE=1 \
    TS_NODE_COMPILER_OPTIONS='{"module":"NodeNext","moduleResolution":"NodeNext","allowImportingTsExtensions":true}' \
    node --loader ts-node/esm --experimental-specifier-resolution=node src/main.ts
) >"${GW_LOG_FILE}" 2>&1 &

GW_PID=$!

GW_READY=0
for _ in $(seq 1 120); do
  if curl -fsS "${GW_BASE_URL}/host/ping" >/dev/null 2>&1; then
    GW_READY=1
    break
  fi
  if ! kill -0 "${GW_PID}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ "${GW_READY}" != "1" ]; then
  echo "[live-controller] GW CORE did not become ready. Last log lines:" >&2
  tail -n 80 "${GW_LOG_FILE}" >&2 || true
  exit 1
fi

echo "[live-controller] ICA is ready at ${ICA_BASE_URL}"
echo "[live-controller] GW CORE is ready at ${GW_BASE_URL}"

cd "${SDK_NODE_DIR}"
RUN_LIVE_101_ORGANIZATION_CONTROLLER_LIFECYCLE_E2E=1 \
HOST_ID_VALUE="${HOST_ID_VALUE}" \
TENANT_ID="${TENANT_ID}" \
TENANT_ROUTE_ID="${TENANT_ROUTE_ID}" \
BASE_URL="${GW_BASE_URL}" \
ICA_BASE_URL="${ICA_BASE_URL}" \
LIVE_GW_HOST_VERIFICATION_PDF_PATH="${PDF_PATH}" \
npm run test:e2e:live-controller-lifecycle:direct

#!/usr/bin/env bash
set -euo pipefail

# Canonical clean live-GW wrapper.
#
# Rules enforced by this script:
# - never reuse the final persisted host/tenant/individual state
# - always derive a fresh run id unless the caller overrides it explicitly
# - start GW CORE first, then run the SDK live suite with the same run seed
# - run from a real user terminal/TTY, not from an isolated sandbox

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_NODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="$(cd "${SDK_NODE_DIR}/.." && pwd)"
GW_DIR="${WORKSPACE_DIR}/gwtemplate-node-ts"

RUN_ID="${LIVE_GW_RUN_ID:-$(date -u +%Y%m%dt%H%M%S)}"
HOST_ID_VALUE="${HOST_ID_VALUE:-livee2e-${RUN_ID}-host}"
TENANT_ID="${TENANT_ID:-livee2e-${RUN_ID}}"
TENANT_ROUTE_ID="${TENANT_ROUTE_ID:-${TENANT_ID}}"

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-globaldatacare-test}"
GW_LOG_FILE="${LIVE_GW_LOG_FILE:-${SDK_NODE_DIR}/test-results/live-gw-core-${RUN_ID}.log}"

mkdir -p "${SDK_NODE_DIR}/test-results"

echo "[live-gw-clean] run_id=${RUN_ID}"
echo "[live-gw-clean] host_id=${HOST_ID_VALUE}"
echo "[live-gw-clean] tenant_id=${TENANT_ID}"
echo "[live-gw-clean] gw_log=${GW_LOG_FILE}"

cleanup() {
  (cd "${GW_DIR}" && bash ./scripts/local-close.sh) >/dev/null 2>&1 || true
}

trap cleanup EXIT

(cd "${GW_DIR}" && bash ./scripts/local-close.sh)

(
  cd "${GW_DIR}"
  GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT}" \
  HOST_ID_VALUE="${HOST_ID_VALUE}" \
  npm run api:local-firestore-demo
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
  echo "[live-gw-clean] GW CORE did not become ready. Last log lines:" >&2
  tail -n 80 "${GW_LOG_FILE}" >&2 || true
  exit 1
fi

echo "[live-gw-clean] GW CORE is ready at ${BASE_URL}"

cd "${SDK_NODE_DIR}"
RUN_LIVE_GW_E2E="${RUN_LIVE_GW_E2E:-1}" \
RUN_LIVE_GW_E2E_INDIVIDUAL_LIFECYCLE="${RUN_LIVE_GW_E2E_INDIVIDUAL_LIFECYCLE:-1}" \
RUN_LIVE_GW_E2E_IPS_INGESTION="${RUN_LIVE_GW_E2E_IPS_INGESTION:-1}" \
LIVE_GW_E2E_TRANSPORT="${LIVE_GW_E2E_TRANSPORT:-all}" \
HOST_ID_VALUE="${HOST_ID_VALUE}" \
TENANT_ID="${TENANT_ID}" \
TENANT_ROUTE_ID="${TENANT_ROUTE_ID}" \
BASE_URL="${BASE_URL}" \
npm run test:e2e:live-gw

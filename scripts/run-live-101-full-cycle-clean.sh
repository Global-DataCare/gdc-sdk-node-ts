#!/usr/bin/env bash
set -euo pipefail

# Canonical clean live wrapper for the backend/BFF `101` full-cycle:
# - defaults to the GW VET + connect-ica product-neutrality proving ground
# - preserves paired explicit overrides for later GW CORE/product promotion
# - runs the live `101` suite
# - controller lifecycle uses the same VP token for `_activate` and as the
#   controller-proof bearer fallback for disable/purge when `AUTH_BEARER` is
#   not explicitly set

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_NODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_WORKSPACE_DIR="$(cd "${SDK_NODE_DIR}/.." && pwd)"
WORKSPACE_DIR="${GDC_WORKSPACE_DIR:-${DEFAULT_WORKSPACE_DIR}}"
if { [[ -n "${GW_DIR_OVERRIDE:-}" ]] && [[ -z "${ICA_DIR_OVERRIDE:-}" ]]; } \
  || { [[ -z "${GW_DIR_OVERRIDE:-}" ]] && [[ -n "${ICA_DIR_OVERRIDE:-}" ]]; }; then
  echo 'ERROR: GW_DIR_OVERRIDE and ICA_DIR_OVERRIDE must be provided together.' >&2
  exit 1
fi
GW_DIR="${GW_DIR_OVERRIDE:-${WORKSPACE_DIR}/custom/vet-gw-node-ts}"
ICA_DIR="${ICA_DIR_OVERRIDE:-${WORKSPACE_DIR}/connect-ica-ts}"
ICA_ENV_FILE="${ICA_ENV_FILE:-}"
GW_ENV_FILE="${GW_ENV_FILE:-${GW_DIR}/.env.local-demo}"
LIVE_101_SIGNED_PDF_FIXTURE_ENV="${LIVE_101_SIGNED_PDF_FIXTURE_ENV:-${SDK_NODE_DIR}/tests/fixtures/live-101-signed-pdf.env}"
if [[ ! -f "${LIVE_101_SIGNED_PDF_FIXTURE_ENV}" ]]; then
  echo "ERROR: signed-PDF fixture metadata not found: ${LIVE_101_SIGNED_PDF_FIXTURE_ENV}" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "${LIVE_101_SIGNED_PDF_FIXTURE_ENV}"
set +a
: "${LIVE_CONTROLLER_ORGANIZATION_TAX_ID:?signed-PDF fixture metadata must set LIVE_CONTROLLER_ORGANIZATION_TAX_ID}"
: "${VERIFIERS_VAT_LIST:?signed-PDF fixture metadata must set VERIFIERS_VAT_LIST}"

RUN_ID="${LIVE_101_RUN_ID:-$(date -u +%Y%m%dt%H%M%S)}"
HOST_ID_VALUE="${HOST_ID_VALUE:-live101-${RUN_ID}-host}"
TENANT_ID="${TENANT_ID:-live101-${RUN_ID}}"
TENANT_ROUTE_ID="${TENANT_ROUTE_ID:-${TENANT_ID}}"

GW_PORT="${GW_PORT:-3000}"
ICA_PORT="${ICA_PORT:-3310}"
ICA_SUPPORTED_JURISDICTIONS_VALUE="${ICA_SUPPORTED_JURISDICTIONS:-${JURISDICTION:-ES}}"
GW_ICA_JURISDICTION_VALUE="${GW_ICA_JURISDICTION_OVERRIDE:-${JURISDICTION:-ES}}"
GW_ENV_OVERRIDES=(
  "PORT=${GW_PORT}"
  "ICA_JURISDICTION=${GW_ICA_JURISDICTION_VALUE}"
)
GW_BASE_URL="${BASE_URL:-http://127.0.0.1:${GW_PORT}}"
ICA_BASE_URL="${ICA_BASE_URL:-http://127.0.0.1:${ICA_PORT}}"
GW_LOG_FILE="${LIVE_GW_LOG_FILE:-${SDK_NODE_DIR}/test-results/live-101-gw-core-${RUN_ID}.log}"
ICA_LOG_FILE="${LIVE_ICA_LOG_FILE:-${SDK_NODE_DIR}/test-results/live-101-ica-${RUN_ID}.log}"

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
  (cd "${GW_DIR}" && PORTS="${GW_PORT}" bash ./scripts/local-close.sh) >/dev/null 2>&1 || true
  close_port_if_busy "${ICA_PORT}"
}

trap cleanup EXIT

echo "[live-101-clean] run_id=${RUN_ID}"
echo "[live-101-clean] host_id=${HOST_ID_VALUE}"
echo "[live-101-clean] tenant_id=${TENANT_ID}"
echo "[live-101-clean] ica_log=${ICA_LOG_FILE}"
echo "[live-101-clean] gw_log=${GW_LOG_FILE}"

(cd "${GW_DIR}" && PORTS="${GW_PORT}" bash ./scripts/local-close.sh)
close_port_if_busy "${ICA_PORT}"

(
  cd "${ICA_DIR}"
  if [[ -n "${ICA_ENV_FILE}" ]]; then
    ICA_API_PORT="${ICA_PORT}" \
    ICA_SUPPORTED_JURISDICTIONS="${ICA_SUPPORTED_JURISDICTIONS_VALUE}" \
    VERIFIERS_VAT_LIST="${VERIFIERS_VAT_LIST}" \
    SECURITY_MODE="${SECURITY_MODE:-demo}" \
    DEMO_ALLOW_INSECURE_BEARER="${DEMO_ALLOW_INSECURE_BEARER:-true}" \
    node --env-file="${ICA_ENV_FILE}" ./src/api/server.ts
  else
    ICA_API_PORT="${ICA_PORT}" \
    ICA_SUPPORTED_JURISDICTIONS="${ICA_SUPPORTED_JURISDICTIONS_VALUE}" \
    VERIFIERS_VAT_LIST="${VERIFIERS_VAT_LIST}" \
    SECURITY_MODE="${SECURITY_MODE:-demo}" \
    DEMO_ALLOW_INSECURE_BEARER="${DEMO_ALLOW_INSECURE_BEARER:-true}" \
    npm run api:local
  fi
) >"${ICA_LOG_FILE}" 2>&1 &

ICA_PID=$!
echo "[live-101-clean] ica_pid=${ICA_PID}"

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
  echo "[live-101-clean] ICA did not become ready. Last log lines:" >&2
  tail -n 80 "${ICA_LOG_FILE}" >&2 || true
  exit 1
fi

(
  cd "${GW_DIR}"
  HOST_ID_VALUE="${HOST_ID_VALUE}" \
  ICA_URL_INTERNAL="${ICA_BASE_URL}" \
  ICA_URL_EXTERNAL="${ICA_BASE_URL}" \
  npx dotenv -e "${GW_ENV_FILE}" -- \
  env \
    "${GW_ENV_OVERRIDES[@]}" \
    PORT="${GW_PORT}" \
    HOST_ID_VALUE="${HOST_ID_VALUE}" \
    ICA_URL_INTERNAL="${ICA_BASE_URL}" \
    ICA_URL_EXTERNAL="${ICA_BASE_URL}" \
    TS_NODE_TRANSPILE_ONLY=1 \
    TS_NODE_SKIP_IGNORE=1 \
    TS_NODE_COMPILER_OPTIONS='{"module":"NodeNext","moduleResolution":"NodeNext","allowImportingTsExtensions":true}' \
    node --loader ts-node/esm --experimental-specifier-resolution=node src/main.ts
) >"${GW_LOG_FILE}" 2>&1 &

GW_PID=$!
echo "[live-101-clean] gw_pid=${GW_PID}"

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
  echo "[live-101-clean] selected GW did not become ready. Last log lines:" >&2
  tail -n 80 "${GW_LOG_FILE}" >&2 || true
  exit 1
fi

echo "[live-101-clean] ICA is ready at ${ICA_BASE_URL}"
echo "[live-101-clean] selected GW is ready at ${GW_BASE_URL}"

cd "${SDK_NODE_DIR}"
RUN_LIVE_101_FULL_CYCLE_E2E=1 \
HOST_ID_VALUE="${HOST_ID_VALUE}" \
TENANT_ID="${TENANT_ID}" \
TENANT_ROUTE_ID="${TENANT_ROUTE_ID}" \
LIVE_CONTROLLER_ORGANIZATION_TAX_ID="${LIVE_CONTROLLER_ORGANIZATION_TAX_ID}" \
BASE_URL="${GW_BASE_URL}" \
ICA_BASE_URL="${ICA_BASE_URL}" \
npm run test:e2e:live-full-cycle:direct

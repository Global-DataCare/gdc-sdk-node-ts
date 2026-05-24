import fs from 'node:fs';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function buildUnsignedJwt(payload) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'none', typ: 'JWT' };
  const claims = {
    iat: now,
    exp: now + 600,
    nonce: `nonce-${now}`,
    ...payload,
  };
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}.`;
}

export function buildUnsignedVpJwt(payload) {
  return buildUnsignedJwt(payload);
}

export function loadVpPayloadFixture(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

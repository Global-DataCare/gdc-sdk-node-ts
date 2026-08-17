import fs from 'node:fs';
export {
  buildUnsignedJwt,
  buildUnsignedVpJwt,
} from 'gdc-common-utils-ts/utils/jwt';
export {
  buildUnsignedProfessionalSmartVpJwt,
} from 'gdc-common-utils-ts/utils/professional-smart';

export function loadVpPayloadFixture(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

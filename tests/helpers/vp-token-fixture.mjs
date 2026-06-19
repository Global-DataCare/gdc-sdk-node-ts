import fs from 'node:fs';
export {
  buildUnsignedJwt,
  buildUnsignedVpJwt,
} from '../../../gdc-common-utils-ts/dist/utils/jwt.js';
export {
  buildUnsignedProfessionalSmartVpJwt,
} from '../../../gdc-common-utils-ts/dist/utils/professional-smart.js';

export function loadVpPayloadFixture(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

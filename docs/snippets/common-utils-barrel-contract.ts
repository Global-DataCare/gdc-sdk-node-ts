// Flow contract: the public common-utils TypeScript barrel exposes the individual DID builder, secure identifier enum and healthcare section vocabulary used by the Node SDK examples.
import {
  HealthcareActorRoleCodes,
  HealthcareSummarySections,
  HL7_CODING_SYSTEM_V3_ROLE_CODE,
  SecureIdTypesIndividual,
  buildIndividualMemberDidWebFromPrivateIdentifiers,
} from 'gdc-common-utils-ts';
import {
  EXAMPLE_API_ORGANIZATION_DID,
  EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
  EXAMPLE_PRIVATE_INDIVIDUAL_UUID,
} from 'gdc-common-utils-ts/examples';

export const typedControllerDid = buildIndividualMemberDidWebFromPrivateIdentifiers({
  providerDidWeb: EXAMPLE_API_ORGANIZATION_DID,
  secureIdTypeIndividual: SecureIdTypesIndividual.Uuid,
  privateIdValueIndividual: EXAMPLE_PRIVATE_INDIVIDUAL_UUID,
  secureIdTypeMember: SecureIdTypesIndividual.Email,
  privateIdValueMember: EXAMPLE_EMAIL_CONTROLLER_INDIVIDUAL,
  roleType: HL7_CODING_SYSTEM_V3_ROLE_CODE,
  roleValue: HealthcareActorRoleCodes.Controller,
});

export const typedHealthcareSection =
  HealthcareSummarySections.AllergiesAndIntolerances.attributeValue;

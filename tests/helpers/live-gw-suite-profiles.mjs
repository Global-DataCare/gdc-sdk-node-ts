export const LiveGwSuiteProfiles = Object.freeze({
  All: 'all',
  Clinical: 'clinical',
  Professional: 'professional',
  Individual: 'individual',
});

export function normalizeLiveGwSuiteProfile(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value || value === LiveGwSuiteProfiles.All) {
    return LiveGwSuiteProfiles.All;
  }
  if (value === LiveGwSuiteProfiles.Clinical) {
    return LiveGwSuiteProfiles.Clinical;
  }
  if (value === LiveGwSuiteProfiles.Professional) {
    return LiveGwSuiteProfiles.Professional;
  }
  if (value === LiveGwSuiteProfiles.Individual) {
    return LiveGwSuiteProfiles.Individual;
  }
  return LiveGwSuiteProfiles.All;
}

export function shouldRunLiveGwSuiteProfile(activeProfile, requiredProfile) {
  return activeProfile === LiveGwSuiteProfiles.All || activeProfile === requiredProfile;
}

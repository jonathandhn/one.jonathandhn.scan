const civiVars = window.CIVISCAN_CONFIG || window.CRM?.vars?.civiscan || {};

export const runtime = {
  authMode: civiVars.authMode || window.CIVI_CONFIG?.authMode || 'headless',
  apiUrlTemplate: civiVars.apiUrlTemplate || window.CIVI_CONFIG?.apiUrlTemplate || '',
  appUrl: civiVars.appUrl || window.CIVI_CONFIG?.appUrl || '',
  mainSiteUrl: civiVars.mainSiteUrl || window.CIVI_CONFIG?.mainSiteUrl || '',
  logoutUrl: civiVars.logoutUrl || window.CIVI_CONFIG?.logoutUrl || '',
  capabilitiesEndpoint: civiVars.capabilitiesEndpoint || window.CIVI_CONFIG?.capabilitiesEndpoint || '',
  assetBaseUrl: civiVars.assetBaseUrl || window.CIVI_CONFIG?.assetBaseUrl || '',
  routerMode: typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'hash' : (civiVars.routerMode || window.CIVI_CONFIG?.routerMode || 'browser'),
  basename: typeof window !== 'undefined' && window.location.protocol === 'file:' ? '' : (civiVars.basename || window.CIVI_CONFIG?.basename || '/scan'),
  currentUser: civiVars.currentUser || window.CIVI_CONFIG?.currentUser || null,
  branding: {
    title: 'CiviScan',
    primaryColor: '#00577b',
    ...(civiVars.branding || window.CIVI_CONFIG?.branding || {}),
  },
  features: {
    displaySwitch: false,
    ...(civiVars.features || window.CIVI_CONFIG?.features || {}),
  },
  pwa: {
    enabled: false,
    manifestUrl: '',
    serviceWorkerUrl: '',
    scopeUrl: '',
    ...(civiVars.pwa || window.CIVI_CONFIG?.pwa || {}),
  },
  pagination: {
    eventsPageSize: 50,
    participantsPageSize: 50,
    ...(civiVars.pagination || window.CIVI_CONFIG?.pagination || {}),
  },
  participantUi: {
    searchFields: ['display_name', 'email'],
    displayFields: ['status'],
    hiddenStatusNames: ['Cancelled', 'CancelledByEvent'],
    referenceField: 'participant_id',
    statusIds: {
      registered: 1,
      attended: 2,
    },
    ...(civiVars.participantUi || window.CIVI_CONFIG?.participantUi || {}),
  },
  capabilities: {
    viewEvents: true,
    viewParticipants: true,
    checkIn: true,
    uncheck: true,
    scan: true,
    searchContacts: true,
    addParticipant: true,
    registerParticipant: true,
    createContact: true,
    modifyBeforeStart: true,
    closeEvent: false,
    reopenEvent: false,
    viewOtherEvents: true,
    configureHeadlessAuth: true,
    ...(civiVars.capabilities || window.CIVI_CONFIG?.capabilities || {}),
  },
};

export const isSessionMode = runtime.authMode === 'session';

export const hasCapability = (name) => runtime.capabilities[name] === true;

export const loadRuntimeContext = async () => {
  if (!isSessionMode || !runtime.capabilitiesEndpoint) {
    return runtime;
  }

  const response = await fetch(runtime.capabilitiesEndpoint, {
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!response.ok) {
    throw new Error(`Unable to load CiviScan context (${response.status})`);
  }

  const context = await response.json();
  runtime.currentUser = context.currentUser || runtime.currentUser;
  Object.assign(runtime.capabilities, context.capabilities || {});
  return runtime;
};

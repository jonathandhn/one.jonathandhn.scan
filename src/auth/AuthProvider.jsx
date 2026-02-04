import React from 'react';
import { AuthProvider as OidcProvider } from 'react-oidc-context';
import { User, WebStorageStateStore } from 'oidc-client-ts';

export const AuthProvider = ({ children }) => {
    // 1. Feature Flag Check
    const featureEnabled = (window.CIVI_CONFIG?.featureOauth || import.meta.env.VITE_FEATURE_OAUTH) === 'true';

    // 2. Runtime Configuration (Priority: Window Object > Env Var)
    const authority = window.CIVI_CONFIG?.oauthAuthority || import.meta.env.VITE_OAUTH_AUTHORITY;
    const clientId = window.CIVI_CONFIG?.oauthClientId || import.meta.env.VITE_OAUTH_CLIENT_ID;

    // If disabled or missing config, render children directly (API Key mode)
    if (!featureEnabled || !authority || !clientId) {
        return <>{children}</>;
    }

    const oidcConfig = {
        authority,
        client_id: clientId,
        redirect_uri: `${window.location.origin}/scan/callback`,
        scope: 'openid profile email civicrm:api4',
        userStore: new WebStorageStateStore({ store: window.localStorage }),
    };

    return (
        <OidcProvider {...oidcConfig}>
            {children}
        </OidcProvider>
    );
};

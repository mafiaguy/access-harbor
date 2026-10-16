import { convexClient, crossDomainClient } from '@convex-dev/better-auth/client/plugins';
import { createAuthClient } from 'better-auth/client';

export const convexUrl = import.meta.env.VITE_CONVEX_URL;
export const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
export const siteUrl = import.meta.env.VITE_SITE_URL;
export const authIsConfigured = Boolean(convexUrl && convexSiteUrl && siteUrl);

export const authClient = createAuthClient({
  ...(convexSiteUrl ? { baseURL: convexSiteUrl } : {}),
  plugins: [convexClient(), crossDomainClient()],
});

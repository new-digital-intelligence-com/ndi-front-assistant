/**
 * The app's own public address, without a trailing slash: APP_URL when it is set, otherwise the
 * domain Railway gives the service (RAILWAY_PUBLIC_DOMAIN, set by Railway itself). Null when
 * neither is known, for example on a laptop.
 */
export function appUrl(): string | null {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  return railway ? `https://${railway}` : null;
}

export type SameSite = 'lax' | 'strict' | 'none';

export type Config = {
  jwtSecret: string;
  corsOrigin: string;
  allowPublicRegistration: boolean;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  cookieName: string;
  cookieSecure: boolean;
  cookieSameSite: SameSite;
  cookieDomain?: string;
};

export type ConfigOverrides = {
  jwtSecret?: string;
  corsOrigin?: string;
  allowPublicRegistration?: boolean;
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: ConfigOverrides = {}): Config {
  const jwtSecret = overrides.jwtSecret ?? env.API_JWT_SECRET ?? '';
  if (jwtSecret.length < 32) throw new Error('API_JWT_SECRET must contain at least 32 characters');
  const cookieSecure = env.API_COOKIE_SECURE ? env.API_COOKIE_SECURE === 'true' : env.NODE_ENV === 'production';
  const sameSiteRaw = (env.API_COOKIE_SAME_SITE ?? (cookieSecure ? 'none' : 'lax')).toLowerCase();
  const cookieSameSite: SameSite = sameSiteRaw === 'strict' ? 'strict' : sameSiteRaw === 'none' ? 'none' : 'lax';
  const allowPublicRegistration =
    overrides.allowPublicRegistration ??
    (env.NEBULA_ALLOW_REGISTRATION === 'true' || env.API_ALLOW_PUBLIC_REGISTRATION === 'true');
  return {
    jwtSecret,
    corsOrigin: overrides.corsOrigin ?? env.API_CORS_ORIGIN ?? 'http://localhost:3000',
    allowPublicRegistration,
    accessTtlSeconds: positiveInt(env.API_ACCESS_TTL_SECONDS, 900),
    refreshTtlDays: positiveInt(env.API_REFRESH_TTL_DAYS, 30),
    cookieName: env.API_COOKIE_NAME ?? 'nebula_refresh',
    cookieSecure,
    cookieSameSite,
    cookieDomain: env.API_COOKIE_DOMAIN || undefined,
  };
}

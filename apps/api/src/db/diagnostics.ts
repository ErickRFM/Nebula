type DatabaseFailure = { category: 'credentials' | 'network' | 'timeout' | 'tls' | 'schema' | 'unknown'; code: string };

/** Safe for production logs: never include a driver message, URI, host or credentials. */
export function classifyDatabaseFailure(cause: unknown): DatabaseFailure {
  const raw = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: unknown }).code : undefined;
  const code = typeof raw === 'string' && /^[A-Z0-9]{3,12}$/.test(raw) ? raw : 'unknown';
  if (code === '28P01' || code === '28000') return { category: 'credentials', code };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED' || code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
    return { category: 'network', code };
  }
  if (code === 'ETIMEDOUT' || code === 'ETIMEOUT' || code === '57014') return { category: 'timeout', code };
  if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
    return { category: 'tls', code };
  }
  if (code === '42P01' || code === '42703') return { category: 'schema', code };
  return { category: 'unknown', code };
}

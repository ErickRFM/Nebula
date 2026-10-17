type DatabaseFailure = { category: 'credentials' | 'network' | 'timeout' | 'tls' | 'schema' | 'pooler_configuration' | 'pooler_capacity' | 'unknown'; code: string };

/** Safe for production logs: never include a driver message, URI, host or credentials. */
export function classifyDatabaseFailure(cause: unknown): DatabaseFailure {
  const raw = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: unknown }).code : undefined;
  const code = typeof raw === 'string' && /^[A-Z0-9]{3,12}$/.test(raw) ? raw : 'unknown';
  if (code === '28P01' || code === '28000') return { category: 'credentials', code };
  if (code === 'XX000' && cause && typeof cause === 'object' && 'message' in cause) {
    // Supabase poolers sometimes surface their own errors as generic XX000.
    // Match only known categories; never return or log the raw message.
    const message = String((cause as { message: unknown }).message).toLowerCase();
    if (/tenant|user not found|unknown user/.test(message)) return { category: 'pooler_configuration', code };
    if (/password|authentication|sasl/.test(message)) return { category: 'credentials', code };
    if (/circuit breaker|too many|capacity|pool exhausted|connection limit/.test(message)) {
      return { category: 'pooler_capacity', code };
    }
  }
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

/** Report connection shape without exposing host, username, database or password. */
export function describeDatabaseConnectionShape(value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    const protocolValid = url.protocol === 'postgresql:' || url.protocol === 'postgres:';
    const pooler = url.hostname.endsWith('.pooler.supabase.com');
    const direct = url.hostname.endsWith('.supabase.co') && url.hostname.startsWith('db.');
    return {
      valid: protocolValid && Boolean(url.hostname),
      kind: pooler ? 'pooler' : direct ? 'supabase_direct' : 'other',
      poolerUsername: url.username.includes('.'),
      port: url.port ? Number(url.port) : null,
    };
  } catch {
    return { valid: false, kind: 'invalid', poolerUsername: false, port: null };
  }
}

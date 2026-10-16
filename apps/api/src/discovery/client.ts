export type JsonFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Fixed upstream endpoints only. Never accept a user-supplied URL here. */
export async function loadProviderJson(url: URL, fetchImpl: JsonFetch = fetch): Promise<unknown> {
  if (url.protocol !== 'https:' || ![
    'api.jamendo.com', 'api.openverse.org', 'api.audius.co',
  ].includes(url.hostname)) throw new Error('provider_host_not_allowed');
  const response = await fetchImpl(url.toString(), {
    headers: {Accept:'application/json', 'User-Agent':'NebulaPrivateMusic/0.1 (private music discovery)'},
    redirect:'error', signal:AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('provider_http_' + response.status);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 2_000_000) throw new Error('provider_response_too_large');
  // Provider results are never trusted as instructions, file paths, or storage permissions.
  return response.json();
}

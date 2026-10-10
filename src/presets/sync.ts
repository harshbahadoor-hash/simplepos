import { validateDocument, type PresetDocument } from './model';
type Fetcher = typeof fetch;
export class PresetPublishError extends Error { current?: PresetDocument; }
export async function recoverPublication(requestId: string, fetcher: Fetcher = fetch): Promise<PresetDocument | null> {
  const response = await fetcher(`/preset-config/publications/${encodeURIComponent(requestId)}`, { cache:'no-store', signal:AbortSignal.timeout(3000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not confirm publication. Your draft is kept.');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('document' in result)) throw new Error('Invalid publication confirmation.');
  return validateDocument(result.document);
}
export async function fetchPresets(revision: number, fetcher: Fetcher = fetch): Promise<PresetDocument | null> {
  const response = await fetcher('/preset-config/current', { headers: { 'If-None-Match':`"${revision}"` }, cache:'no-store', signal:AbortSignal.timeout(3000) });
  if (response.status === 304) return null;
  if (!response.ok) throw new Error('Preset updates are offline.');
  return validateDocument(await response.json());
}
export async function publishPresets(document: PresetDocument, expectedRevision: number, requestId: string, fetcher: Fetcher = fetch): Promise<PresetDocument> {
  validateDocument(document);
  let response: Response;
  try { response = await fetcher('/preset-config/publish', { method:'POST', headers:{'Content-Type':'application/json','If-Match':`"${expectedRevision}"`,'Idempotency-Key':requestId},body:JSON.stringify({document}),signal:AbortSignal.timeout(10000) }); }
  catch {
    // A lost reply does not prove publication failed. Only read the result;
    // never silently publish an offline draft on reconnection.
    try {
      const result = await recoverPublication(requestId, fetcher);
      if (result) return result;
    } catch { /* Keep the same request id available for explicit retry. */ }
    throw new PresetPublishError('Could not confirm publication. Your draft is kept; retry when connected.');
  }
  if (response.ok) return validateDocument(await response.json());
  let info: { error?: string; current?: unknown } = {};
  try { info = await response.json(); } catch { /* A proxy error is not a config document. */ }
  const error = new PresetPublishError(info.error || 'Could not publish presets. Your draft is kept.');
  if (response.status === 412 && info.current) error.current = validateDocument(info.current);
  throw error;
}

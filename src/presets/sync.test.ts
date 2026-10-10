import { expect, test, vi } from 'vitest';
import { baselineDocument } from './model';
import { fetchPresets, publishPresets } from './sync';
test('conditional read handles 304 and rejects invalid shared settings', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(null,{status:304}));
  expect(await fetchPresets(4,fetcher)).toBeNull();
  expect(fetcher.mock.calls[0]![1].headers['If-None-Match']).toBe('"4"');
  fetcher.mockResolvedValue(new Response('<html>wrong page</html>'));
  await expect(fetchPresets(4,fetcher)).rejects.toThrow();
});
test('publication sends only reference settings and preserves a conflict document', async () => {
  const doc=baselineDocument(); const remote={...doc,revision:2};
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Changed elsewhere',current:remote}),{status:412}));
  await expect(publishPresets(doc,0,'request-1',fetcher)).rejects.toMatchObject({current:remote});
  const [,options]=fetcher.mock.calls[0]!;
  expect(JSON.parse(options.body)).toEqual({document:doc});
  expect(options.headers['If-Match']).toBe('"0"');
  expect(options.headers['Idempotency-Key']).toBe('request-1');
});

test('a lost publish response is resolved by reading its publication result without a second write', async () => {
  const published = { ...baselineDocument(), revision: 1 };
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('Lost connection'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ revision: 1, document: published })));
  expect(await publishPresets(baselineDocument(), 0, 'lost-response-key', fetcher)).toEqual(published);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]![0]).toBe('/preset-config/publications/lost-response-key');
  expect(fetcher.mock.calls[1]![1].method).toBeUndefined();
});

test('unconfirmed publication leaves an explicit retry error', async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error('Offline'));
  await expect(publishPresets(baselineDocument(), 0, 'offline-key', fetcher)).rejects.toThrow('Your draft is kept');
  expect(fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
});

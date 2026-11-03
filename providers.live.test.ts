import { expect, it } from 'vitest';
import { fetchBatch } from './providers';
const signal = () => AbortSignal.timeout(20_000);
it.skipIf(!process.env.SUBSCRIPTIONS_LIVE || !process.env.LINEAR_API_KEY)('reads a real Linear issue through the API with a read-only key', async () => {
  const key = process.env.LINEAR_API_KEY!;
  const res = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { 'content-type': 'application/json', authorization: key }, body: JSON.stringify({ query: '{ issues(first: 1) { nodes { identifier } } }' }) });
  const identifier = (await res.json()).data.issues.nodes[0].identifier as string;
  const { items } = await fetchBatch('linear', [identifier], { config: { linearApiKey: key }, signal: signal() });
  expect((items.get(identifier) as any).state).toBeTruthy();
}, 60_000);

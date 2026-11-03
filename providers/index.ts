import { z } from 'zod';
import { linear } from './linear';
import { ProviderError, type FetchResult, type Provider, type ProviderContext } from './types';
export { ProviderError } from './types';
export type { Provider, ProviderConfig, ProviderContext, FetchResult, BatchResult } from './types';

/**
 * Adding a service: implement `Provider` in its own file and list it here.
 * GitHub pull requests are not here: the Pull Requests plugin owns them, and
 * imports the ones this plugin recorded before that split.
 */
export const providers: readonly Provider[] = [linear];
export const platformSchema = z.enum(providers.map(p => p.id) as [string, ...string[]]);
export type Platform = z.infer<typeof platformSchema>;
/** Every registered platform id. Rows for anything else are legacy and left alone. */
export const platforms: readonly string[] = providers.map(p => p.id);
export function provider(id: string): Provider {
  const found = providers.find(p => p.id === id);
  if (!found) throw new Error(`Unknown platform ${id}. Use one of: ${platforms.join(', ')}.`);
  return found;
}
/** Every provider's settings descriptors, merged for `bb.settings.define()`. */
export const providerSettings = { ...linear.settings };

/** Fetch a batch through the platform's provider. Whole-batch failures become one error per id. */
export async function fetchBatch(platform: string, ids: string[], ctx: ProviderContext): Promise<FetchResult> {
  try { return await provider(platform).fetch(ids, ctx); }
  catch (cause) {
    if (ctx.signal.aborted) throw cause;
    const error = cause instanceof ProviderError ? cause : new ProviderError(`${platform} lookup failed; will retry.`);
    return { items: new Map(ids.map(id => [id, error])), pause: error.pauseProvider ? error : undefined };
  }
}

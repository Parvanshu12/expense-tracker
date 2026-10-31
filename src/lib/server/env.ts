import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/** Worker bindings (D1, rate limiter, vars, secrets) for the current request. */
export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as CloudflareEnv;
}

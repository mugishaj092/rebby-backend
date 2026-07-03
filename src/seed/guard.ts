import { env } from '@/config/env';

// Single choke point, called first by src/seed/index.ts: seedAdmin/seedCustomer upsert a
// well-known, hardcoded password onto a privileged (owner-role) and a customer account.
// Running this against a production database — accidentally or otherwise — would silently
// plant/reset a known credential on a real account. Split into its own module (rather than
// living inline in index.ts) so it can be unit-tested without triggering index.ts's top-level
// `main()` call, which performs real seed writes as an import side effect.
export function assertNotProduction(): void {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run the dev seed script with NODE_ENV=production — it upserts well-known, hardcoded admin/customer passwords.',
    );
  }
}

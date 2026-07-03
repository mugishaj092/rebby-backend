import { hashPassword } from '@/core/security/password';
import { prisma } from '@/db/prisma';

// Dev-only seed credentials — never used in production. Re-running the seed resets the
// password hash to this known value, so local credentials never drift out of sync with docs.
const CUSTOMER_NAME = 'Demo Customer';
const CUSTOMER_EMAIL = 'customer@reby.rw';
const CUSTOMER_PASSWORD = 'CustomerPass123!';

export async function seedCustomer(): Promise<void> {
  const passwordHash = await hashPassword(CUSTOMER_PASSWORD);

  await prisma.user.upsert({
    where: { email: CUSTOMER_EMAIL },
    create: {
      name: CUSTOMER_NAME,
      email: CUSTOMER_EMAIL,
      passwordHash,
      phone: '0780000000',
    },
    update: {
      passwordHash,
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log(`  customer: ${CUSTOMER_EMAIL} / ${CUSTOMER_PASSWORD}`);
}

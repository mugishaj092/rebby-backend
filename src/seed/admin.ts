import { hashPassword } from '@/core/security/password';
import { prisma } from '@/db/prisma';
import { StaffRole } from '@/generated/prisma/enums';

// Dev-only seed credentials — never used in production. Re-running the seed resets the
// password hash to this known value, so local credentials never drift out of sync with docs.
const ADMIN_NAME = 'Reby Owner';
const ADMIN_EMAIL = 'owner@reby.rw';
const ADMIN_PASSWORD = 'OwnerPass123!';

export async function seedAdmin(): Promise<void> {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  await prisma.staffProfile.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: StaffRole.owner,
    },
    update: {
      passwordHash,
      role: StaffRole.owner,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  console.log(`  staff (owner): ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

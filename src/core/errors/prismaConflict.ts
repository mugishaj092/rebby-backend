import type { Prisma } from '@/generated/prisma/client';

// Prisma v7 with a driver adapter (this project uses @prisma/adapter-pg) does not populate the
// classic `err.meta.target` on a P2002 — the violated constraint's columns instead live at
// `err.meta.driverAdapterError.cause.constraint.fields` (verified against a real Postgres unique
// violation). Both shapes are checked so this keeps working if a future Prisma version restores
// `meta.target` for driver adapters. Shared across features since every P2002-handling
// conflict guard needs this same field-extraction, regardless of which model's constraint fired.
export function conflictFieldsFromError(err: Prisma.PrismaClientKnownRequestError): string[] {
  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target;
  }

  const driverFields = (
    err.meta?.driverAdapterError as { cause?: { constraint?: { fields?: unknown } } } | undefined
  )?.cause?.constraint?.fields;
  return Array.isArray(driverFields) ? driverFields : [];
}

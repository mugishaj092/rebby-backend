/*
  Warnings:

  - You are about to drop the column `clerk_id` on the `staff_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `clerk_id` on the `users` table. All the data in the column will be lost.
  - Added the required column `password_hash` to the `staff_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password_hash` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "staff_profiles_clerk_id_key";

-- DropIndex
DROP INDEX "users_clerk_id_key";

-- AlterTable
ALTER TABLE "staff_profiles" DROP COLUMN "clerk_id",
ADD COLUMN     "password_hash" VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "clerk_id",
ADD COLUMN     "password_hash" VARCHAR(255) NOT NULL;

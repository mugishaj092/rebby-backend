-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('staff', 'manager', 'owner');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'confirmed', 'preparing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('momo', 'airtel', 'cod', 'card');

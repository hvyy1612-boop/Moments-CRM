-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "country" VARCHAR(100),
ADD COLUMN     "first_name" VARCHAR(80),
ADD COLUMN     "last_name" VARCHAR(80),
ADD COLUMN     "street" VARCHAR(200);

-- AlterTable
ALTER TABLE "enquiries" ADD COLUMN     "country" VARCHAR(100),
ADD COLUMN     "first_name" VARCHAR(80),
ADD COLUMN     "is_company" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_name" VARCHAR(80),
ADD COLUMN     "postcode" VARCHAR(20),
ADD COLUMN     "state" VARCHAR(100),
ADD COLUMN     "street" VARCHAR(200),
ADD COLUMN     "suburb" VARCHAR(100);

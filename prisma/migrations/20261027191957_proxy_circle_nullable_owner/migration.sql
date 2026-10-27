-- AlterTable
ALTER TABLE "circles" ADD COLUMN     "proxy_created_by_user_id" UUID,
ADD COLUMN     "recipient_label" TEXT,
ADD COLUMN     "recipient_phone_e164_hash" TEXT,
ALTER COLUMN "owner_user_id" DROP NOT NULL;

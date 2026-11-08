ALTER TABLE "allocations" DROP CONSTRAINT "category_or_unmatched";--> statement-breakpoint
-- A category the grant never had can't be reported, so that money moves to General funds.
UPDATE "allocations" SET "grant_id" = NULL WHERE "category_id" IS NULL;--> statement-breakpoint
INSERT INTO "allocations" ("transaction_id", "position", "grant_id", "category_id", "amount")
SELECT "id", 0, NULL, NULL, "amount" FROM "transactions" t
WHERE t."not_grant_funded" IS TRUE AND NOT EXISTS (SELECT 1 FROM "allocations" a WHERE a."transaction_id" = t."id");--> statement-breakpoint
ALTER TABLE "allocations" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "reviewed";--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "not_grant_funded";--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "general_funds_has_no_line" CHECK (("allocations"."grant_id" is null) = ("allocations"."category_id" is null));

ALTER TABLE "allocations" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "setup_confirmed_at" date;--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "funder_fiscal_year_start_month" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "not_grant_funded" boolean;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "category_or_unmatched" CHECK (("allocations"."category_id" is null) <> ("allocations"."category" is null));--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "funder_fiscal_year_start_month_range" CHECK ("grants"."funder_fiscal_year_start_month" between 1 and 12);--> statement-breakpoint
-- Data: allocations stored category names before this migration. Point each one whose name matches a category
-- of its grant (case and surrounding spaces ignored) at that category's id; the rest stay as unmatched names.
UPDATE "allocations" AS a SET "category_id" = bc."id", "category" = NULL FROM "budget_categories" AS bc WHERE bc."grant_id" = a."grant_id" AND lower(trim(bc."name")) = lower(trim(a."category"));

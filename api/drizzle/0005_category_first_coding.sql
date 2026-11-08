CREATE TYPE "public"."assignment_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('needs_input', 'suggested', 'check_split', 'done');--> statement-breakpoint
CREATE TABLE "org_categories" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"gl_accounts" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "org_categories_organization_id_id_pk" PRIMARY KEY("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" text NOT NULL,
	"organization_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "programs_organization_id_id_pk" PRIMARY KEY("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "allocations" ALTER COLUMN "grant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN "accepted_category_ids" text[];--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "program_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "program_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "assignment_source" "assignment_source" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "status" "transaction_status" DEFAULT 'needs_input' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "org_categories" ADD CONSTRAINT "org_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Reviewed work is confirmed; unreviewed allocations wait for confirmation. Nothing unassigned is touched.
UPDATE "transactions" SET "assignment_source" = 'manual', "status" = CASE WHEN "reviewed" OR "not_grant_funded" IS TRUE THEN 'done'::"transaction_status" ELSE 'suggested'::"transaction_status" END
WHERE "not_grant_funded" IS TRUE OR EXISTS (SELECT 1 FROM "allocations" a WHERE a."transaction_id" = "transactions"."id");--> statement-breakpoint
UPDATE "transactions" SET "account" = '6650 Activities' || substr("account", 16) WHERE "account" LIKE '6600 Activities%';

ALTER TABLE "grants" ADD COLUMN "rebudget_threshold_pct" integer;--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "reallocations" jsonb;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "service_date" date;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "rebudget_threshold_pct_range" CHECK ("grants"."rebudget_threshold_pct" between 0 and 100);
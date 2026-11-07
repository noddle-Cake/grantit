CREATE TYPE "public"."answer_status" AS ENUM('empty', 'draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."deadline_kind" AS ENUM('application', 'report', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('application', 'report');--> statement-breakpoint
CREATE TYPE "public"."document_outcome" AS ENUM('awarded', 'declined', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."fact_category" AS ENUM('mission', 'program', 'service', 'beneficiaries', 'outcome', 'organization', 'finance');--> statement-breakpoint
CREATE TYPE "public"."fact_status" AS ENUM('draft', 'pending', 'approved');--> statement-breakpoint
CREATE TYPE "public"."grant_stage" AS ENUM('prospect', 'drafting', 'submitted', 'awarded', 'reporting', 'closed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('director', 'finance', 'program');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('csv', 'quickbooks-sample', 'manual');--> statement-breakpoint
CREATE TABLE "allocations" (
	"transaction_id" text NOT NULL,
	"position" integer NOT NULL,
	"grant_id" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "allocations_transaction_id_position_pk" PRIMARY KEY("transaction_id","position")
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" text NOT NULL,
	"grant_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"budget" numeric(12, 2) NOT NULL,
	CONSTRAINT "budget_categories_grant_id_id_pk" PRIMARY KEY("grant_id","id"),
	CONSTRAINT "budget_categories_grantId_name_unique" UNIQUE("grant_id","name")
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" text NOT NULL,
	"grant_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"date" date NOT NULL,
	"kind" "deadline_kind" NOT NULL,
	"done" boolean,
	CONSTRAINT "deadlines_grant_id_id_pk" PRIMARY KEY("grant_id","id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "document_kind" NOT NULL,
	"funder" text NOT NULL,
	"year" integer NOT NULL,
	"outcome" "document_outcome",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category" "fact_category" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "fact_status" NOT NULL,
	"source" text,
	"updated_at" date NOT NULL,
	"updated_by" text NOT NULL,
	"approved_by" text,
	"approved_at" date,
	CONSTRAINT "approval_complete" CHECK (("facts"."approved_by" is null) = ("facts"."approved_at" is null))
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"funder" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"stage" "grant_stage" NOT NULL,
	"cover" integer DEFAULT 0 NOT NULL,
	"owner_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"rules" text[] DEFAULT '{}'::text[] NOT NULL,
	"allow_split" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "period_order" CHECK ("grants"."period_end" >= "grants"."period_start")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ein" text NOT NULL,
	"fiscal_year_start_month" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_year_start_month_range" CHECK ("organizations"."fiscal_year_start_month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text NOT NULL,
	"grant_id" text NOT NULL,
	"position" integer NOT NULL,
	"prompt" text NOT NULL,
	"word_limit" integer NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"citations" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "answer_status" DEFAULT 'empty' NOT NULL,
	"missing" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" date,
	CONSTRAINT "questions_grant_id_id_pk" PRIMARY KEY("grant_id","id"),
	CONSTRAINT "word_limit_positive" CHECK ("questions"."word_limit" > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"date" date NOT NULL,
	"vendor" text NOT NULL,
	"description" text NOT NULL,
	"account" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reviewed" boolean DEFAULT false NOT NULL,
	"source" "transaction_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" NOT NULL,
	"title" text NOT NULL,
	"initials" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_grant_id_index" ON "allocations" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "budget_categories_grant_id_position_index" ON "budget_categories" USING btree ("grant_id","position");--> statement-breakpoint
CREATE INDEX "deadlines_grant_id_position_index" ON "deadlines" USING btree ("grant_id","position");--> statement-breakpoint
CREATE INDEX "documents_organization_id_index" ON "documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "facts_organization_id_status_index" ON "facts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "grants_organization_id_index" ON "grants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "questions_grant_id_position_index" ON "questions" USING btree ("grant_id","position");--> statement-breakpoint
CREATE INDEX "transactions_organization_id_date_index" ON "transactions" USING btree ("organization_id","date");--> statement-breakpoint
CREATE INDEX "users_organization_id_index" ON "users" USING btree ("organization_id");
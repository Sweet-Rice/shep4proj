CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalog_year" text NOT NULL,
	"code" text NOT NULL,
	"dept" text NOT NULL,
	"title" text NOT NULL,
	"credits_min" double precision NOT NULL,
	"credits_max" double precision NOT NULL,
	"credits_note" text,
	"description" text NOT NULL,
	"prerequisite_text" text,
	"coid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "courses_catalog_year_code_key" ON "courses" USING btree ("catalog_year","code");--> statement-breakpoint
CREATE INDEX "courses_catalog_year_dept_idx" ON "courses" USING btree ("catalog_year","dept");
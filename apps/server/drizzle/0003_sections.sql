CREATE TABLE "meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"days" text[] NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"term" text NOT NULL,
	"course_code" text NOT NULL,
	"section_number" text NOT NULL,
	"section_type" text NOT NULL,
	"credits_min" double precision NOT NULL,
	"credits_max" double precision NOT NULL,
	"credits_note" text,
	"instructor" text,
	"location" text,
	"delivery_mode" text,
	"enrollment" integer NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetings_section_id_idx" ON "meetings" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_term_course_section_key" ON "sections" USING btree ("term","course_code","section_number","section_type");
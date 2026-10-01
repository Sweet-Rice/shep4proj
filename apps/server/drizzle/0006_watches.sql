CREATE TABLE "watches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term" text NOT NULL,
	"course_code" text NOT NULL,
	"section_number" text NOT NULL,
	"section_type" text NOT NULL,
	"last_enrollment" integer NOT NULL,
	"last_capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

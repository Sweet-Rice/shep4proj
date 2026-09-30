CREATE TABLE "section_archive" (
	"term" text NOT NULL,
	"department" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"sections" jsonb NOT NULL,
	CONSTRAINT "section_archive_term_department_pk" PRIMARY KEY("term","department")
);

CREATE TABLE "section_scrapes" (
	"department" text NOT NULL,
	"term" text NOT NULL,
	"scraped_at" timestamp with time zone NOT NULL,
	"section_count" integer NOT NULL,
	CONSTRAINT "section_scrapes_department_term_pk" PRIMARY KEY("department","term")
);

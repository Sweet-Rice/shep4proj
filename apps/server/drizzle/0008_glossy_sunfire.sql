CREATE TABLE "catalog_department_scrapes" (
	"catalog_year" text NOT NULL,
	"dept" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"failed_count" integer NOT NULL,
	CONSTRAINT "catalog_department_scrapes_catalog_year_dept_pk" PRIMARY KEY("catalog_year","dept")
);

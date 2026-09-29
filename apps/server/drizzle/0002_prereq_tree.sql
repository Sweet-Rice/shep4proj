ALTER TABLE "courses" ADD COLUMN "prereq_tree" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "prereq_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "prereq_review_reason" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "prereq_notes" jsonb DEFAULT '[]'::jsonb NOT NULL;
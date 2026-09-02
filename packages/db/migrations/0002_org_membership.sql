CREATE TABLE "org_membership" (
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_membership_user_id_org_id_pk" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
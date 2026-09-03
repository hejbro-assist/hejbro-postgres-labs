-- hejbro migration
-- hejbro: 0.2.0-pre.0
-- + schema lab [new]
-- + table lab.projects [new]
-- parent-snapshot: sha256:d369ef9ab960e03f29326874197ae3d23281b0b38fa322e6e8d0b9ac9030eedb
-- snapshot: sha256:145a2d444b8f6aa4990fed87627e3743e98853c5c5ffefe5a8fdd33c0c0750c0

create schema "lab";

create table "lab"."projects" (
	"id" uuid not null default gen_random_uuid(),
	"tenant_id" uuid not null,
	"name" text not null,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone not null default now(),
	constraint "projects_pkey" primary key ("id"),
	constraint "projects_name_not_blank" check (length(btrim("lab"."projects"."name")) > 0)
);

create index "projects_tenant_id_idx" on "lab"."projects" ("tenant_id") where "lab"."projects"."archived_at" is null;

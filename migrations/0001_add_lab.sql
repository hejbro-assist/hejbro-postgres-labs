-- hejbro migration
-- hejbro: 0.2.0-pre.0
-- + schema lab [new]
-- + table lab.projects [new]
-- parent-snapshot: sha256:d369ef9ab960e03f29326874197ae3d23281b0b38fa322e6e8d0b9ac9030eedb
-- snapshot: sha256:841a5135be649dad2bb291fa021bc6edd4270948b2a086489ff03d81c253f708

create schema "lab";

create table "lab"."projects" (
	"tenant_id" uuid not null,
	"id" uuid not null default gen_random_uuid(),
	"name" text not null,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone not null default now(),
	constraint "projects_pkey" primary key ("tenant_id", "id"),
	constraint "projects_name_not_blank" check (length(btrim(name)) > 0)
);

create index "projects_tenant_id_idx" on "lab"."projects" ("tenant_id") where archived_at is null;

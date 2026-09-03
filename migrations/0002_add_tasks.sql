-- hejbro migration
-- hejbro: 0.2.0-pre.0
-- + table lab.tasks [new]
-- parent-snapshot: sha256:145a2d444b8f6aa4990fed87627e3743e98853c5c5ffefe5a8fdd33c0c0750c0
-- snapshot: sha256:df3295eb18134059de77b4baa65f6eab35fdecf21b5ce0dbf895f8f630be1704

create table "lab"."tasks" (
	"id" uuid not null default gen_random_uuid(),
	"tenant_id" uuid not null,
	"project_id" uuid not null,
	"title" text not null,
	"status" text not null default 'todo',
	"position" integer not null default 0,
	"created_at" timestamp with time zone not null default now(),
	constraint "tasks_pkey" primary key ("id"),
	constraint "tasks_title_not_blank" check (length(btrim("lab"."tasks"."title")) > 0),
	constraint "tasks_status_allowed" check ("lab"."tasks"."status" in ('todo', 'doing', 'done'))
);

create index "tasks_tenant_id_status_idx" on "lab"."tasks" ("tenant_id", "status");

alter table "lab"."tasks" add constraint "tasks_project_id_fk" foreign key ("project_id") references "lab"."projects" ("id") on delete cascade;

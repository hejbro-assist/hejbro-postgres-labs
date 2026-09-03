-- hejbro migration
-- hejbro: 0.2.0-pre.0
-- + table lab.tasks [new]
-- parent-snapshot: sha256:841a5135be649dad2bb291fa021bc6edd4270948b2a086489ff03d81c253f708
-- snapshot: sha256:ca80f119bb94a9441b2682b97c29c992b7b8793d3b99de732d56e594790e3bbb

create table "lab"."tasks" (
	"tenant_id" uuid not null,
	"id" uuid not null default gen_random_uuid(),
	"project_id" uuid not null,
	"title" text not null,
	"status" text not null default 'todo',
	"position" integer not null default 0,
	"created_at" timestamp with time zone not null default now(),
	constraint "tasks_pkey" primary key ("tenant_id", "id"),
	constraint "tasks_title_not_blank" check (length(btrim(title)) > 0),
	constraint "tasks_status_allowed" check (status in ('todo', 'doing', 'done'))
);

create index "tasks_tenant_id_status_idx" on "lab"."tasks" ("tenant_id", "status");

alter table "lab"."tasks" add constraint "tasks_tenant_id_project_id_fk" foreign key ("tenant_id", "project_id") references "lab"."projects" ("tenant_id", "id") on delete cascade;

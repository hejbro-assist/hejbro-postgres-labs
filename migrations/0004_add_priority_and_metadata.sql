-- hejbro migration
-- hejbro: 0.2.0-pre.1
-- + enum lab.task_priority [new]
-- ~ table lab.projects [column "metadata" added, index "projects_metadata_idx" added, index "projects_tenant_id_lower_name_key" added]
-- ~ table lab.tasks [column "priority" added]
-- parent-snapshot: sha256:5d3477abb03576f103d8e6a0da90bf8d4d248c37ad64a3f0d3062f936d46f84a
-- snapshot: sha256:9a03beef6dd0283599fe3c937bdc805787a8947bfd62bd6d9a97f214a5064f25

create type "lab"."task_priority" as enum ('low', 'normal', 'high');

alter table "lab"."projects" add column "metadata" jsonb not null default '{}'::jsonb;

create index "projects_metadata_idx" on "lab"."projects" using gin ("metadata" jsonb_path_ops);

create unique index "projects_tenant_id_lower_name_key" on "lab"."projects" ("tenant_id", (lower("projects"."name"))) where "projects"."archived_at" is null;

alter table "lab"."tasks" add column "priority" "lab"."task_priority" not null default 'normal';

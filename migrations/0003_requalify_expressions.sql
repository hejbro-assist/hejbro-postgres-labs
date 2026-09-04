-- hejbro migration
-- hejbro: 0.2.0-pre.1
-- ~ table lab.projects [index "projects_tenant_id_idx" changed, check "projects_name_not_blank" changed]
-- ~ table lab.tasks [check "tasks_status_allowed" changed, check "tasks_title_not_blank" changed]
-- parent-snapshot: sha256:ca80f119bb94a9441b2682b97c29c992b7b8793d3b99de732d56e594790e3bbb
-- snapshot: sha256:5d3477abb03576f103d8e6a0da90bf8d4d248c37ad64a3f0d3062f936d46f84a

alter table "lab"."projects" drop constraint "projects_name_not_blank";

drop index "lab"."projects_tenant_id_idx";

create index "projects_tenant_id_idx" on "lab"."projects" ("tenant_id") where "projects"."archived_at" is null;

alter table "lab"."projects" add constraint "projects_name_not_blank" check (length(btrim("projects"."name")) > 0);

alter table "lab"."tasks" drop constraint "tasks_status_allowed";

alter table "lab"."tasks" drop constraint "tasks_title_not_blank";

alter table "lab"."tasks" add constraint "tasks_status_allowed" check ("tasks"."status" in ('todo', 'doing', 'done'));

alter table "lab"."tasks" add constraint "tasks_title_not_blank" check (length(btrim("tasks"."title")) > 0);

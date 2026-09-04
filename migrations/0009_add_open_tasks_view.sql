-- hejbro migration
-- hejbro: 0.2.0-pre.1
-- + view lab.open_tasks [new]
-- parent-snapshot: sha256:880d5ec17b4cd88cbc52665860789ee8689df9f2ec715073803307db594f8b9d
-- snapshot: sha256:0b7f02f33a7cf019825162c3cc5a32314117e67ec3cb54895bc9b7d3d0ce6d52

create or replace view "lab"."open_tasks" as select "lab"."tasks"."tenant_id" as "tenant_id", "lab"."tasks"."id" as "id", "lab"."tasks"."project_id" as "project_id", "lab"."projects"."title" as "project_title", "lab"."tasks"."title" as "title", "lab"."tasks"."status" as "status", "lab"."tasks"."priority" as "priority", "lab"."tasks"."sort_order" as "sort_order" from "lab"."tasks" inner join "lab"."projects" on ("lab"."tasks"."tenant_id" = "lab"."projects"."tenant_id") and ("lab"."tasks"."project_id" = "lab"."projects"."id") where "lab"."projects"."archived_at" is null;

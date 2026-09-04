-- hejbro migration
-- hejbro: 0.2.0-pre.1
-- ~ table lab.tasks [index "tasks_urgent_idx" added]
-- parent-snapshot: sha256:bc871e7a51dc6784658aa58c06ee2527128573542cb52f855e3ce73be9c12e1c
-- snapshot: sha256:880d5ec17b4cd88cbc52665860789ee8689df9f2ec715073803307db594f8b9d

create index "tasks_urgent_idx" on "lab"."tasks" ("tenant_id", "sort_order") where "tasks"."priority" = 'urgent';

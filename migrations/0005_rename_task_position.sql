-- hejbro migration
-- hejbro: 0.2.0-pre.1
-- ~ table lab.tasks [column "position" renamed to "sort_order"]
-- parent-snapshot: sha256:9a03beef6dd0283599fe3c937bdc805787a8947bfd62bd6d9a97f214a5064f25
-- snapshot: sha256:d8f48a8090c8acd1a96a0bb3caa1e5b91e117ae143424becb4fecd8ee061d8a1

alter table "lab"."tasks" rename column "position" to "sort_order";

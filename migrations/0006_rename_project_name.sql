-- hejbro migration
-- hejbro: 0.2.0-pre.1
-- ~ table lab.projects [column "name" renamed to "title"]
-- parent-snapshot: sha256:d8f48a8090c8acd1a96a0bb3caa1e5b91e117ae143424becb4fecd8ee061d8a1
-- snapshot: sha256:5fb2442d877db6b6bf4676be572598d0c5ef1751c8d50ea1a9133b2808f8559c

alter table "lab"."projects" rename column "name" to "title";

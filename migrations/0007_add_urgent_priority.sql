-- hejbro migration
-- hejbro: 0.2.0-pre.1
-- ~ enum lab.task_priority [value "urgent" added]
-- parent-snapshot: sha256:5fb2442d877db6b6bf4676be572598d0c5ef1751c8d50ea1a9133b2808f8559c
-- snapshot: sha256:bc871e7a51dc6784658aa58c06ee2527128573542cb52f855e3ce73be9c12e1c

alter type "lab"."task_priority" add value 'urgent';

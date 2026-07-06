







              }
create table "fiona".ps_bookent1 
  (
    psb_cocode char(2),
    psb_memno char(8),
    psb_agmtno char(8),
    psb_useyear date,
    psb_totalpts smallint,
    psb_curusepts smallint,
    psb_advusepts smallint,
    psb_acrusepts smallint,
    psb_balpts smallint,
    psb_usermodify char(12),
    psb_datemodify date,
    psb_lockstatus char(1),
    unique (psb_cocode,psb_memno,psb_agmtno,psb_useyear)  constraint "fiona".u936_72
  );






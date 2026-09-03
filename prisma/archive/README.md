# Archived data

One-off exports of data deliberately removed from the schema, kept so nothing is lost
outright. These are **not** Informix UNLOAD files and no migration script reads them.

## `agreement_rci_archive_20260902.csv`

The five RCI columns dropped from `Agreement` by migration
`20260902090000_drop_agreement_rci_columns` — `rciRefNo`, `rciNominee`, `rciEnrolDate`,
`rciExpiryDate`, `rciFeePaid` — for every agreement that carried a value in any of them
(**19,853 rows**), plus `coCode`/`membershipNo`/`agreementNo`/`acctClassify`/`transferFlag`
to identify each one.

`RciEnrolment` is now the single source of truth for RCI data (see `### RciEnrolment` in
CLAUDE.md). It covers all but **1,879** of these rows: agreements holding an `rciRefNo` with
no enrolment row at all, every one of them `coCode 03` and `acctClassify TM`. Informix's
`rci_enrol` does not retain terminated agreements, so those references exist nowhere else.
That is what this file preserves.

To find them:

```bash
awk -F, 'NR==1 || $4=="TM"' agreement_rci_archive_20260902.csv
```

# LHB MMS — UAT Sign-Off Form: **RCI**

**System:** LHB MMS (Internal staff web application — replacing legacy SIS / Informix system)
**Module:** RCI — Resort Condominiums International (3 functions, menu at `/rci`; permission: `RESORTS_SETUP`)
**Environment:** Test / UAT — `http://199.1.1.32`
**Data scope:** 17,915 RCI enrolments · 105 RCI weeks (2026–2027) · 774 bulk-banked weeks across 12 units at 3 resorts

---

## Instructions

**Section 1** — general behaviour of the module.
**Section 2** — for each function, tick every action you were able to perform successfully. **n/a** means the function does not offer that action.
**Section 3** — confirm the data migrated from SIS is complete and accurate. This has its **own sign-off block**, separate from the functional one.

Note anything that did not work in the **Remarks** column, and sign at the bottom to confirm acceptance.

---

## 1. Access & General Behaviour

| # | Function | Pass | Fail | Remarks |
|---|---|:--:|:--:|---|
| 1.1 | **RCI** appears in the sidebar for permitted departments only | ☐ | ☐ | |
| 1.2 | Landing page lists the 3 functions | ☐ | ☐ | |
| 1.3 | Add / Edit / Delete buttons are hidden for users without the matching permission | ☐ | ☐ | |
| 1.4 | Every add / edit / delete gives a clear success or failure message | ☐ | ☐ | |
| 1.5 | Delete always asks for confirmation first | ☐ | ☐ | |
| 1.6 | Actions are **refused with a clear reason** when they would clash with Resorts Setup records | ☐ | ☐ | |

## 2. Function Checklist

| # | Function | Search | Display | Add | Edit | Delete | Remarks |
|---|---|:--:|:--:|:--:|:--:|:--:|---|
| 1 | RCI Enrolment | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2 | RCI Weekly Interval | n/a | ☐ | ☐ | n/a | ☐ | |
| 3 | RCI Bulk Bank | n/a | ☐ | ☐ | ☐ | ☐ | |

**How each function reads:**
- **Fn 1** — one record per enrolment. An agreement may hold more than one. The product, membership no. and agreement no. cannot be changed after adding; correcting them means deleting and re-adding.
- **Fn 2** — weeks are added and deleted a **whole year at a time**, generated from the year alone. There is no edit: correcting a year means deleting and re-adding it. The year is chosen from a dropdown, so there is no search.
- **Fn 3** — a whole-year grid for one resort, unit and year, all chosen from dropdowns. Add = bank a week (set a season), Edit = change a week's season, Delete = clear a week, or the whole year.

## 2b. Additional Actions

| # | Additional action | Confirmed | Remarks |
|---|---|:--:|---|
| 1 | Membership no. and agreement no. link back to Member and Agreement detail | ☐ | |
| 1 | The RCI card on **Agreement Detail** shows the current enrolment (read-only) | ☐ | |
| 2 | Generate a whole year's weeks from the year alone | ☐ | |
| 2 | A year with weeks banked in fn 3 cannot be deleted | ☐ | |
| 3 | **Delete year** clears a unit's whole year for re-entry | ☐ | |
| 3 | Banking and clearing weeks adjusts the resort availability figures correctly | ☐ | |
| 3 | Weeks that cannot be banked are refused with a reason naming the function to fix it in | ☐ | |

---

## 3. Data Migration Verification — SIS (Informix) → LMMS

Confirms that the RCI data carried over from SIS is **complete and accurate**. Complete this against the **final data refresh before go-live**.

Data refresh being verified (date of the SIS export): ____________________

### 3a. Data completeness and accuracy by function

For each function, check the records **you rely on** and confirm they came across from SIS. Tick **Complete** if nothing you expected to find is missing, and **Accurate** if the values shown match SIS.

| # | Function | Complete | Accurate | Remarks |
|---|---|:--:|:--:|---|
| 3.1 | RCI Enrolment — enrolment details, names, address, fees, status | ☐ | ☐ | |
| 3.2 | RCI Weekly Interval — the week calendar for 2026 and 2027 | ☐ | ☐ | |
| 3.3 | RCI Bulk Bank — banked weeks and their season colours | ☐ | ☐ | |

When checking, please look particularly for:
- Each enrolment sitting on the **correct membership and agreement**, with the right member name — and an agreement that holds more than one enrolment showing all of them.
- **Season colours** — SIS time-colour **1 = Blue, 2 = White, 3 = Red**.
- **Resort availability** — this should already have the banked weeks deducted, and must not be double-counted.
- **Dates shifted by a day** anywhere on screen.

> IT will separately reconcile the record counts of every migrated table against SIS as part of the data refresh, so testers do not need to count records.

### 3b. Deliberate scope decisions — please acknowledge

These are **intentional** differences between SIS and LMMS, agreed during the build. Please tick to confirm each is understood and accepted, so they are not later raised as migration defects.

| # | Decision | Accepted |
|---|---|:--:|
| 3.4 | **The RCI week calendar was carried over from 2026 onwards only** — 1,846 pre-2026 weeks were not migrated. Those older years are also where every data fault in SIS sits (24 weeks with no dates, 213 with a mismatched Saturday pair, a gap at 2021). Nothing from 2026 onwards deviates. | ☐ |
| 3.5 | **Bulk bank was carried over for check-in dates from 2026 onwards only** — 774 of 35,931 records. Weeks already used or expired were left behind. | ☐ |
| 3.6 | **The RCI week calendar currently ends at 2027.** Later years must be generated in fn 2 before they can be banked in fn 3. | ☐ |
| 3.7 | **Legacy audit columns are not carried over** — create/modify user and date, and lock-status columns, are dropped, along with the batch number, the print / reprint block and the old RCI number. Both parts of the second name are kept; only the pre-joined version of it is dropped. | ☐ |
| 3.8 | **The bulk bank status field is carried over but not shown on screen**, and cannot be changed in LMMS. Its meaning in SIS is undocumented; it will be surfaced if the future booking module needs it. | ☐ |
| 3.9 | **1,879 terminated LHC agreements have no RCI enrolment record.** SIS does not retain enrolments for terminated agreements, so those agreements read "No RCI enrolment on record". A copy of the RCI values previously held on those agreements has been archived outside the system. | ☐ |
| 3.10 | **Source data errors were carried over as-is, not silently corrected** — 8 enrolments carry a renewal date and 6 an expiry date before 1970 (legacy keying errors), and the resort code on an enrolment is free text in SIS (`1704`, `L.COVE`, `LCS` all appear alongside proper codes). These are visible so they can be corrected properly. | ☐ |
| 3.11 | **6 enrolments did not match any agreement or member** (a branch-code typo, a product-code typo, a placeholder membership, a wrong membership, a junk test row and one on a retired product). These were **corrected in SIS on 03-Sep-2026** and should now resolve to zero — please confirm no such records remain while checking item 3.1. | ☐ |
| 3.12 | **Banked weeks on units that are no longer RCI-qualified were kept, not dropped** (205 records on CP-PBR `3205/3206` and `3227/3228`, and L-10024 `A8`). They remain visible and can be cleared, but no new weeks can be banked on those units. | ☐ |
| 3.13 | **Corrections to migrated data must be made in SIS and re-exported, not keyed in LMMS**, for as long as the data refresh is still being run — a refresh re-imports from SIS and would overwrite an on-screen correction. Note also that an enrolment cannot be re-pointed at another agreement in LMMS: correcting the agreement key means deleting and re-adding the record. | ☐ |

---

## Notes for testers

- **RCI Enrolment is now the only place RCI data can be changed.** The RCI card on Agreement Detail is read-only for every user, including IT — please confirm this is acceptable to Member Services.
- **Renewal and expiry dates are information only.** Members renew directly with RCI; the system raises no alerts and takes no action on them.
- **RCI Weekly Interval (fn 2) must be set up before a year can be banked in fn 3.**
- RCI Bulk Bank shares resort availability with Resorts Setup functions 5 and 6. After testing, please confirm the **Resorts Availability** chart still shows sensible balance nights.
- **Data errors in migrated records belong in section 3, not as functional failures.**

---

## Overall Assessment

| | |
|---|---|
| **Functions tested** | ______ of 3 |
| **Outstanding issues to resolve before go-live** | |

_______________________________________________________________________________

_______________________________________________________________________________

_______________________________________________________________________________

---

## Data Migration Acceptance (Section 3)

I confirm that the RCI data migrated from SIS into LMMS has been checked and is **complete and accurate**, and that the scope decisions listed in section 3b are understood and accepted.

| Role | Name | Signature | Date |
|---|---|---|---|
| **User / Department Head** (Resort Operations) | | | |
| **User / Department Head** (Member Services) | | | |
| **IT / Project Owner** | | | |

**Data Migration Result:**  ☐ Accepted   ☐ Accepted with conditions   ☐ Rejected — re-migration required

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| **User / Department Head** (Resort Operations) | | | |
| **User / Department Head** (Member Services) | | | |
| **IT / Project Owner** | | | |
| **Management Approval** | | | |

**UAT Result:**  ☐ Accepted   ☐ Accepted with conditions   ☐ Rejected

---
*LHB MMS — RCI UAT sign-off. Reference: system module documentation (CLAUDE.md).*

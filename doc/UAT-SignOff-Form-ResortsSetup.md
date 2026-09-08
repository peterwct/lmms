# LHB MMS — UAT Sign-Off Form: **Resorts Setup**

**System:** LHB MMS (Internal staff web application — replacing legacy SIS / Informix system)
**Module:** Resorts Setup (`RESORTS_SETUP` permission) — 10 functions, menu at `/resorts`
**Environment:** Test / UAT — `http://199.1.1.32`
**Data scope:** 29 products · 324 resorts · 487 apartment types · 358 units · 5,162 availability records · 133,988 availability grid days · 10,904 maintenance records · 424 CP season days · 1,209 points rows · 22 LVC codes

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
| 1.1 | **Resorts Setup** appears in the sidebar for permitted departments only | ☐ | ☐ | |
| 1.2 | Landing page lists all 10 setup functions in the correct order | ☐ | ☐ | |
| 1.3 | Add / Edit / Delete buttons are hidden for users without the matching permission | ☐ | ☐ | |
| 1.4 | Every add / edit / delete gives a clear success or failure message | ☐ | ☐ | |
| 1.5 | Delete always asks for confirmation first | ☐ | ☐ | |
| 1.6 | Delete is **refused with a clear reason** when the record is still in use elsewhere | ☐ | ☐ | |
| 1.7 | Resort and product dropdowns list **active** entries only | ☐ | ☐ | |

## 2. Function Checklist

| # | Function | Search | Display | Add | Edit | Delete | Remarks |
|---|---|:--:|:--:|:--:|:--:|:--:|---|
| 1 | Company Master — New Company/Product Code | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2 | Resorts Master Maintenance and Setup | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 3 | Apartment Sleep Types Maintenance and Setup | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 4 | Apartment Unit No. Maintenance and Setup | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 5 | Resorts Unit Availability/Inventory Setup | ☐ | ☐ | ☐ | n/a | ☐ | |
| 6 | Resorts Unit Under Maintenance | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 7 | Public & School Holidays Maintenance and Setup | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 8 | CP Seasons Maintenance and Setup | n/a | ☐ | ☐ | ☐ | ☐ | |
| 9 | CP Points Deduction — Maintenance and Setup | n/a | ☐ | ☐ | ☐ | ☐ | |
| 10 | Leisure Vacation Club (LVC) Code Maintenance and Setup | ☐ | ☐ | ☐ | ☐ | ☐ | |

**Where an action reads n/a:**
- **Fn 5** has no Edit by design — a record is corrected by deleting it and adding it again.
- **Fn 8** is worked one month at a time and **fn 9** one resort and rate at a time, chosen from dropdowns, so there is no search box.

## 2b. Additional Actions

| # | Additional action | Confirmed | Remarks |
|---|---|:--:|---|
| 1, 2, 10 | Activate / deactivate a record (status toggle) | ☐ | |
| 2 | Resort information — the 4 tabs on Resort Detail | ☐ | |
| 5 | **Add MAR availability** — batch set-up for partner / exchange resorts | ☐ | |
| 5, 6 | **Resorts Availability** chart shows correct balance nights | ☐ | |
| 6 | Up to 3 date ranges keyed in one Add | ☐ | |
| 7, 8 | **Clone to next year** | ☐ | |
| 9 | **New Rate** opens pre-filled from the rate currently in force | ☐ | |

---

## 3. Data Migration Verification — SIS (Informix) → LMMS

Confirms that the resort data carried over from SIS is **complete and accurate**. Complete this against the **final data refresh before go-live**.

Data refresh being verified (date of the SIS export): ____________________

### 3a. Data completeness and accuracy by function

For each function, check the records **you rely on** and confirm they came across from SIS. Tick **Complete** if nothing you expected to find is missing, and **Accurate** if the values shown match SIS.

| # | Function | Complete | Accurate | Remarks |
|---|---|:--:|:--:|---|
| 3.1 | Company Master — products and companies | ☐ | ☐ | |
| 3.2 | Resorts Master — resort details and the 4 information tabs | ☐ | ☐ | |
| 3.3 | Apartment Sleep Types | ☐ | ☐ | |
| 3.4 | Apartment Unit No. — the unit register | ☐ | ☐ | |
| 3.5 | Resorts Unit Availability — records and the availability figures | ☐ | ☐ | |
| 3.6 | Resorts Unit Under Maintenance | ☐ | ☐ | |
| 3.7 | Public & School Holidays | ☐ | ☐ | |
| 3.8 | CP Seasons — the day-by-day grading | ☐ | ☐ | |
| 3.9 | CP Points Deduction — Home and Non-Home charts | ☐ | ☐ | |
| 3.10 | Leisure Vacation Club (LVC) Codes | ☐ | ☐ | |

When checking, please look particularly for:
- **Dates shifted by a day** anywhere on screen.
- **Availability balance nights** — these should already have maintenance and RCI bulk bank deducted, and must not be double-counted.
- **CP points charts** — the day columns run **Sunday to Saturday**; confirm the weekly total matches SIS.

> IT will separately reconcile the record counts of every migrated table against SIS as part of the data refresh, so testers do not need to count records.

### 3b. Deliberate scope decisions — please acknowledge

These are **intentional** differences between SIS and LMMS, agreed during the build. Please tick to confirm each is understood and accepted, so they are not later raised as migration defects.

| # | Decision | Accepted |
|---|---|:--:|
| 3.11 | **Legacy audit columns are not carried over** — create/modify user and date, and lock-status columns, are dropped from every table. So are the accounting codes on Company Master, the per-apartment-type check-in/out times, and the LVC incoming / outgoing / fax-batch counters. | ☐ |
| 3.12 | **Units, availability records and the availability grid cover ACTIVE resorts only.** Retired resorts keep their master record (fn 2) but carry no units or availability. | ☐ |
| 3.13 | **Only live units were carried over at four resorts**, per the lists supplied by the business: L-10024 `A1`–`A34` (34, was 61), L-10025 `B1`–`B22` (22, was 42), L-10026 floors 4 and 5 (14, was 49), CP-PBR the `32xx` family (48, was 283). Decades of retired unit numbers were left behind. L-10016 (30) and L-101 (10) were taken in full. | ☐ |
| 3.14 | **Maintenance was taken in full**, including records on retired resorts. Those rows therefore show no apartment type. All are historic. | ☐ |
| 3.15 | **Only the rate currently in force was kept for each resort in fn 9.** SIS held the same chart re-keyed year after year (4,766 rows over 1,062 resort-years, but only 303 genuinely different charts — five resorts had re-keyed an identical chart 24 years running). Prior years' charts were not migrated; history builds up from go-live. | ☐ |
| 3.16 | **Product status does not exist in SIS.** LMMS sets 6 products Active (02, 03, 15, 24, 25, 26) and the other 23 Inactive, per the business's current list of products and trading exchange partners. | ☐ |
| 3.17 | **The RCI Reserved flag in SIS is out of date and was not used.** LMMS applies the business-supplied list instead: L-10024 `A6`/`A7`, L-10026 `504`/`506`, CP-PBR `3201/3202` and `3203/3204` — **6 RCI-qualified units**, where SIS marked 136. | ☐ |
| 3.18 | **Status values are re-coded**: resort status `I` (Inactive) in SIS is shown as `U` in LMMS; LVC code status `C` (Cancelled) in SIS is shown as `U` (Inactive). | ☐ |
| 3.19 | **Public and school holidays have no SIS source.** The 2026 dates were supplied by the business and keyed directly. Several public holidays are deliberately stored on the **eve** of the gazetted date (Labour Day 30/04, National Day 30/08, Christmas 24/12) — this is intended, not an error. | ☐ |
| 3.20 | **Resort information lines are now free text.** The legacy 35-character line width and fixed slot counts are no longer enforced; a 400-character total per category applies instead. Blank separator slots were dropped. | ☐ |
| 3.21 | **Source data errors were carried over as-is, not silently corrected** — e.g. LVC names with typos (`ROYAL RESORTS GROU[P`, `ABSOLUTE WORL TRAVEL LTD`) and three apartment types at `V-SS` flagged as lock-on/lock-off on a resort that is not. These are visible so they can be corrected properly. | ☐ |
| 3.22 | **Corrections to migrated data must be made in SIS and re-exported, not keyed in LMMS**, for as long as the data refresh is still being run — a refresh re-imports from SIS and would overwrite an on-screen correction. | ☐ |

---

## Notes for testers

- Functions **5**, **6** and **RCI Bulk Bank** all write to the same availability figures. After testing them, please confirm the **Resorts Availability** chart still shows sensible balance nights.
- Functions **7** (LHC holidays) and **8** (CP seasons) are **separate calendars for separate products** — they are not expected to agree with one another.
- **Data errors in migrated records belong in section 3, not as functional failures.**

---

## Overall Assessment

| | |
|---|---|
| **Functions tested** | ______ of 10 |
| **Outstanding issues to resolve before go-live** | |

_______________________________________________________________________________

_______________________________________________________________________________

_______________________________________________________________________________

---

## Data Migration Acceptance (Section 3)

I confirm that the resort data migrated from SIS into LMMS has been checked and is **complete and accurate**, and that the scope decisions listed in section 3b are understood and accepted.

| Role | Name | Signature | Date |
|---|---|---|---|
| **User / Department Head** (Resort Operations) | | | |
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
*LHB MMS — Resorts Setup UAT sign-off. Reference: system module documentation (CLAUDE.md).*

# LHB Member Management System (LHB MMS) — UAT Sign-Off Form

**System:** LHB MMS (Internal staff web application — replacing legacy Informix system)
**Environment:** Test / UAT — `http://199.1.1.32`
**Data scope:** ~32,387 members · ~33,841 timeshare agreements · AMC billing · Zurich PBS

---

## Instructions
Please review each module and functional item below. Tick **Pass** if the function works as expected, or **Fail** and note any issue in the Remarks column. Sign at the bottom to confirm acceptance.

---

## 1. Authentication & Access Control

| # | Function | Pass | Fail | Remarks |
|---|---|:--:|:--:|---|
| 1.1 | Login with username / password (JWT session, 8-hour expiry) | ☐ | ☐ | |
| 1.2 | Forced password change on first login | ☐ | ☐ | |
| 1.3 | Single-session enforcement (login from a 2nd device warns / ends prior session) | ☐ | ☐ | |
| 1.4 | Logout ends session correctly | ☐ | ☐ | |
| 1.5 | Sidebar shows only modules the user's department is permitted to view | ☐ | ☐ | |
| 1.6 | Department-based permission control (View / Add / Edit / Delete) enforced | ☐ | ☐ | |

## 2. Admin

| # | Function | Pass | Fail | Remarks |
|---|---|:--:|:--:|---|
| 2.1 | **Users** — list, view, create, edit user accounts | ☐ | ☐ | |
| 2.2 | Clone user (copies permissions + report access) | ☐ | ☐ | |
| 2.3 | **Departments** — manage departments & permissions matrix | ☐ | ☐ | |
| 2.4 | **Audit Log** — view mutating actions (IT only) | ☐ | ☐ | |
| 2.5 | **Report Access** — grant / revoke per-user report access (IT only) | ☐ | ☐ | |

## 3. Members

| # | Function | Pass | Fail | Remarks |
|---|---|:--:|:--:|---|
| 3.1 | **Member Enquiry** — search & sort (with URL state / Back button restore) | ☐ | ☐ | |
| 3.2 | **Member Detail** — view individual & corporate members | ☐ | ☐ | |
| 3.3 | View agreements accordion (transferred `TT` agreements shown disabled) | ☐ | ☐ | |
| 3.4 | **Edit Member** (Member Services + IT only) — all sections incl. personal, contact, address, employment, spouse, joint applicant, corporate | ☐ | ☐ | |
| 3.5 | Auto-uppercase text inputs; address state dropdown auto-fills city/state | ☐ | ☐ | |
| 3.6 | Direct-URL edit access blocked for non-editors | ☐ | ☐ | |

## 4. Agreements

| # | Function | Pass | Fail | Remarks |
|---|---|:--:|:--:|---|
| 4.1 | **Agreements list** — search, sort, filter (defaults: LHC-03 / Active) | ☐ | ☐ | |
| 4.2 | **Agreement Detail** — details, net purchase price, loan info | ☐ | ☐ | |
| 4.3 | **Change Agreement Status** — NA / SU / PT / TM with required reason code | ☐ | ☐ | |
| 4.4 | Status change authorization: Finance (all), Credit (no TM), others blocked | ☐ | ☐ | |
| 4.5 | Suspension reason (SU) / Cancellation reason (PT/TM) displayed correctly | ☐ | ☐ | |
| 4.6 | **Nominees** — add / edit up to 3 nominees (Member Services + IT only) | ☐ | ☐ | |
| 4.7 | **RCI Information** — add / edit RCI ID, nominee, joint & expiry dates | ☐ | ☐ | |
| 4.8 | AMC & PBS cards resolve correctly for transferred agreements | ☐ | ☐ | |

## 5. AMC Billing

| # | Function | Pass | Fail | Remarks |
|---|---|:--:|:--:|---|
| 5.1 | **Schedules** — search, sort, filter (product, status, next due date) | ☐ | ☐ | |
| 5.2 | **Invoices** — list & invoice detail | ☐ | ☐ | |
| 5.3 | **Generate AMC invoices** | ☐ | ☐ | |
| 5.4 | **Day-End** — generate SQL Account day-end file | ☐ | ☐ | |
| 5.5 | **Rates (LHC)** — add / edit / activate-deactivate / delete; auto total + amount-in-words | ☐ | ☐ | |
| 5.6 | **Rates (CP points tiers)** — add / edit / activate-deactivate / delete | ☐ | ☐ | |

## 6. Reports (per-user access controlled)

| # | Function | Pass | Fail | Remarks |
|---|---|:--:|:--:|---|
| 6.1 | Reports card grid shows only accessible reports | ☐ | ☐ | |
| 6.2 | **Member Report** — preview + PDF / Excel | ☐ | ☐ | |
| 6.3 | **SSM Agreement Report** — preview + PDF / Excel | ☐ | ☐ | |
| 6.4 | **Expiry Analysis** — preview + PDF / Excel | ☐ | ☐ | |
| 6.5 | **Expiring Members** — preview + PDF / Excel | ☐ | ☐ | |
| 6.6 | **Remaining Value** — preview + Excel | ☐ | ☐ | |
| 6.7 | **Expiry Summary by Years** — preview + PDF / Excel | ☐ | ☐ | |

## 7. Zurich PBS (Payback Scheme)

| # | Function | Pass | Fail | Remarks |
|---|---|:--:|:--:|---|
| 7.1 | **PBS landing page** — function cards | ☐ | ☐ | |
| 7.2 | **PBS Enquiry & Maintenance** — search, view, edit scheme (cert no, scheme type, remark) | ☐ | ☐ | |
| 7.3 | **PBS Claims** — add / edit / delete claim; claimIndc & auto-amount rules by claim type | ☐ | ☐ | |
| 7.4 | **PBS Pay By Month / Year Report** — Excel (monthly + yearly worksheets) | ☐ | ☐ | |
| 7.5 | **PBS Claim Report** — Excel (non-ND + ND worksheets) | ☐ | ☐ | |
| 7.6 | **Not In PBS Report** — text file output | ☐ | ☐ | |
| 7.7 | **PBS Variance Report** — Excel (rightful vs Zurich scheme type) | ☐ | ☐ | |

> **Note:** The following PBS functions are **not yet delivered** and are out of scope for this UAT: Proforma, Certificate Tracking, Auto Transfer, PBS Report.

---

## Overall Assessment

| | |
|---|---|
| **Total items tested** | ______ |
| **Passed** | ______ |
| **Failed** | ______ |
| **Outstanding issues to resolve before go-live** | |

_______________________________________________________________________________

_______________________________________________________________________________

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| **User / Department Head** | | | |
| **IT / Project Owner** | | | |
| **Management Approval** | | | |

**UAT Result:**  ☐ Accepted   ☐ Accepted with conditions   ☐ Rejected

---
*Generated for UAT of LHB MMS. Reference: system module documentation (CLAUDE.md).*

# Proposal: Hosting Plan for the LHB Member Management System (LMMS)

**Prepared by:** [Your Name], IT Department
**Date:** 14 July 2026
**For:** Management Review & Approval

---

## 1. Executive Summary

LMMS is the new internal staff application replacing our legacy Informix system, managing
~32,000 members, ~34,000 timeshare agreements, and AMC billing. Development is on track for
completion around **July 2027**.

To deploy the system for user acceptance testing (UAT) now and for live production later, we
require a proper hosting environment. Our current test setup — an ordinary desktop PC (Windows 10,
8 GB RAM, 256 GB disk) — is inadequate and cannot serve as a production or long-term test platform.

After evaluating three options (cloud VPS, serverless platform, and on-premise server), we
recommend a **phased approach**:

- **Phase 1 (now – go-live):** Host development/UAT on a low-cost cloud VPS (~RM28–116/month).
- **Phase 2 (at go-live, ~2027):** Decide between a dedicated on-premise server or continuing on
  the VPS, based on the system's actual, proven resource requirements.

This avoids committing capital to hardware before requirements are finalised, while giving us a
proper hosted environment immediately at minimal cost.

**Approval requested:** authorisation to proceed with Phase 1 (a monthly VPS subscription, starting
at approximately **RM28/month**).

---

## 2. Background & Current Situation

| Item | Status |
|---|---|
| Application | LMMS — Node.js + PostgreSQL, internal web application |
| Users | All internal staff (accessed over the company network) |
| Current test environment | A desktop PC (Windows 10, 8 GB RAM, 256 GB) — underpowered, not a proper server |
| IT support | In-house IT staff available |
| Existing server infrastructure | None |
| Target completion | ~July 2027 |

As the system's modules expand, we will need a properly specified, reliable environment for both
**testing** and **production**.

---

## 3. Options Evaluated

### Option A — Cloud VPS (Recommended for Phase 1)
A rented virtual private server (Windows), running the application exactly as built. Provider
reviewed: Shinjiru Technology (Malaysian). No code changes required; matches our current setup.

### Option B — On-Premise Server (Candidate for Phase 2)
Purchase a dedicated physical server hosting **two virtual machines** — one for Production, one for
Testing. Keeps all member data fully in-house and delivers network-speed access for internal users.

### Option C — Serverless Platform (Vercel) — Not Suitable
Evaluated and rejected. Vercel is designed for public websites, not long-running internal business
applications. It would require re-engineering the application and a separate paid database, at a
higher cost (~RM330–560/month). Not pursued.

---

## 4. Cost Comparison

### Cloud VPS (Shinjiru, 36-month term, prices exclude 8% SST)

| Plan | Specification | Monthly |
|---|---|---|
| VALUE | 2 vCPU / 2 GB / 50 GB | RM27.90 |
| PRO | 4 vCPU / 4 GB / 100 GB | RM56.90 |
| PREMIUM | 6 vCPU / 6 GB / 150 GB | RM115.90 |

Plans can be **upgraded seamlessly** at any time (no migration, cost prorated), so we can start
small and scale up as the workload grows.

### On-Premise Server (one-time purchase)

| Item | Estimated Cost |
|---|---|
| Tower server (8-core, 32 GB ECC RAM, RAID-1 NVMe SSD) | ~RM12,000 |
| Windows Server 2022 Standard license (covers both VMs) | ~RM4,500 |
| UPS (battery backup) | ~RM2,000 |
| Backup storage (NAS) | ~RM3,000 |
| **Total upfront** | **~RM21,500** |
| Electricity (running 24/7) | ~RM900 / year |

### Total Cost of Ownership

| Option | 3-Year Total | 5-Year Total |
|---|---|---|
| On-premise server (Prod + Test) | ~RM24,200 | ~RM26,000 |
| VPS PREMIUM + VALUE (Prod + Test) | ~RM5,600 | ~RM9,300 |
| VPS PREMIUM only (Prod) | ~RM4,500 | ~RM7,500 |

**Observation:** The cloud VPS is significantly cheaper in absolute terms over any realistic
horizon. An on-premise server only "breaks even" against the VPS after roughly 7–9 years — by which
time the hardware would need replacing. On-premise's value lies in **data control, in-house
ownership, and network-speed access**, not cost savings.

---

## 5. Recommended Plan — Phased Approach

### Phase 1 — Now through go-live (Development & UAT)
- Subscribe to a **cloud VPS**, starting with the **VALUE plan (~RM28/month)**.
- Upgrade to PRO or PREMIUM as testing intensifies near go-live (upgrade is seamless).
- **Benefits:** immediate, reliable hosted environment; no capital outlay; full flexibility while
  requirements are still evolving; far superior to the current desktop PC.

### Phase 2 — At go-live (~2027)
With real, measured usage data (member volume, concurrent users, data growth), decide between:
- **(a) Purchasing a dedicated on-premise server** (~RM21,500) to host Production and Test as two
  virtual machines. This also permanently replaces the inadequate test PC and keeps all data
  in-house; **or**
- **(b) Continuing on the cloud VPS** if it is performing well and lower cost is preferred.

### Why phased?
- Avoids spending ~RM21,500 on hardware **before** the system's true requirements are known.
- Provides a proper hosted environment **now**, cheaply.
- Preserves full flexibility — we commit capital only when we can size the hardware correctly.

---

## 6. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Member data (PII) hosted with a third party (VPS phase) | Reputable Malaysian provider; migrate to on-premise in Phase 2 if data-sovereignty is required |
| Single server hosting both Prod & Test (on-premise option) = single point of failure | Mandatory **nightly database backup copied off-site**; UPS protection |
| Long-term contract lock-in (VPS 36-month term) | Start with the low-cost VALUE plan; upgrades are seamless and prorated |
| Hardware failure / maintenance (on-premise) | Handled by in-house IT staff; hardware under manufacturer warranty; RAID-1 disk redundancy |

---

## 7. Recommendation & Approval Requested

We recommend approval to **proceed with Phase 1**: subscribe to a cloud VPS for development and UAT,
beginning at approximately **RM28/month** (VALUE plan), with the ability to upgrade as the system
approaches go-live.

The **Phase 2 decision** (on-premise server vs. continued VPS) will be brought back for approval
closer to go-live (~2027), supported by actual usage data and a firm hardware quotation.

**Estimated Phase 1 commitment:** ~RM28–116/month (scales with need).
**Estimated Phase 2 capital (if on-premise approved):** ~RM21,500 one-time.

---

*Prepared for management review. Figures are estimates based on current vendor quotations
(Shinjiru Technology) and prevailing hardware prices; final costs to be confirmed at time of
purchase. All VPS prices exclude 8% SST.*

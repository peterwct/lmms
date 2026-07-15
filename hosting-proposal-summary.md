# LMMS Hosting Plan — Executive Summary

**Prepared by:** [Your Name], IT Department | **Date:** 14 July 2026 | **For:** Management Approval

---

### The Need
LMMS (our new member management system replacing the legacy Informix system) is on track for
completion around **July 2027**. It needs a proper hosting environment — our current test setup is
just an ordinary desktop PC (Windows 10, 8 GB RAM) and is not fit for testing or production.

### Recommendation: A Phased Approach

| | **Phase 1 — Now to go-live** | **Phase 2 — At go-live (~2027)** |
|---|---|---|
| **Action** | Rent a cloud VPS for development & UAT | Decide: buy an on-premise server **or** stay on VPS |
| **Cost** | ~RM28–116 / month | ~RM21,500 one-time (if on-premise) |
| **Why** | Proper environment now, no capital risk while requirements evolve | Decide with real usage data in hand |

We commit only a small monthly fee now, and defer the larger capital decision until the system's
true requirements are known.

### Cost Comparison (Total Cost of Ownership)

| Option | 3-Year Total | 5-Year Total |
|---|---|---|
| **Cloud VPS** (Production + Test) | **~RM5,600** | **~RM9,300** |
| On-premise server (Production + Test) | ~RM24,200 | ~RM26,000 |

*The cloud VPS is far cheaper in the short-to-medium term. An on-premise server only breaks even
after 7–9 years — by which time the hardware needs replacing. On-premise's value is data control
and in-house ownership, not cost savings.*

*(A serverless option, Vercel, was also evaluated and rejected — unsuitable for this type of
application and more costly at ~RM330–560/month.)*

### Key Points
- **No large upfront cost** — Phase 1 is a low, flexible monthly subscription (upgradable anytime).
- **All users are internal** and IT support is in-house.
- **Data safety:** nightly off-site database backups regardless of option chosen.

### Approval Requested
Authorisation to **proceed with Phase 1** — subscribe to a cloud VPS for development/UAT, starting
at approximately **RM28/month**. The Phase 2 on-premise decision will be brought back for approval
closer to go-live, with firm figures.

---
*Figures are estimates based on current vendor quotations and hardware prices; VPS prices exclude 8% SST.*

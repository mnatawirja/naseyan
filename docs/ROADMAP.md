# Roadmap

Each phase ends with a pilot-ready build and green CI. Estimates assume one developer working with Claude Code.

## Phase 0 — Foundation (done in scaffold, finish setup) · ~2 days
- [x] Repo layout, CLAUDE.md, docs, CI (functions, rules, Flutter, APK build)
- [x] Money and loyalty engines with tests (TypeScript + Dart port of money)
- [x] Firestore rules + rules tests; Cloud Functions: staffSignIn, approve, registerDevice, setStaffPin, setUserRole, adjustMember, onOrderWritten, onCustomerCreated, summaries
- [ ] First-session checklist in CLAUDE.md (flutter create, pub upgrade, Firebase project, deploy, owner)

## Phase 1 — Staff till MVP · ~3 weeks
Device setup, PIN sign-in, idle lock · menu with options picker and sold-out · all order types incl.
delivery markup · send to stations + Bluetooth ticket printing · open bills and tables · split payments,
receipts (print + copy) · per-till order numbers · shifts with float/cash moves/close count · discounts,
promos, vouchers with approvals · member lookup (phone, code, QR scan), register, rewards, points ·
orders today, reprint, void, refund · clock in/out · offline: selling, printing and queued sync without network.
**Exit:** one outlet runs a full day on the tablet, including a Wi-Fi outage drill.

## Phase 2 — Back office · ~2–3 weeks
All sections in PRODUCT.md, reading `summaries/` for past days and `orders/` for today; CSV exports;
device management; staff PINs via `setStaffPin`; user roles via `setUserRole`.
**Exit:** manager closes a week of trading using only the back office (reconciliation, shifts, stock).

## Phase 3 — Members · ~2 weeks
Member app (Android, iOS, web) per PRODUCT.md; SMS OTP; ledger history; member QR scanning on the till.
**Exit:** 20 staff and friends use it for two weeks; points match orders exactly.

## Phase 4 — Table QR + ticket screens · ~1 week
QR web ordering with anonymous auth and server re-pricing; till QR queue; bar/kitchen screen mode as an
alternative to printers.

## Phase 5 — Launch hardening · ~2 weeks
Bahasa Indonesia; Play Store (staff app as private/managed app; member app public) and App Store;
Crashlytics; daily Firestore backups; WhatsApp OTP; data migration from the web pilot; load test with
10 outlets; privacy notice and data-deletion flow for members (UU PDP).

## Later
GoFood/GrabFood/ShopeeFood order integration (needs merchant API approval), recipe-level stock,
purchasing and transfers, QRIS/EDC payment integration, kitchen display hardware.

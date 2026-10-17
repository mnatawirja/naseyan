# Product spec

Behaviour follows the web pilot in `reference/web-pilot/` unless noted. Open `index.html` there with the
pilot's data model in mind; this document is the source of truth where they differ.

## Users and roles
| Role | Till | Payments, shifts | Bar/kitchen | Approve voids, refunds, big discounts | Back office |
|---|---|---|---|---|---|
| Barista / cook | Take orders | – | Yes | – | – |
| Cashier | Yes | Yes | – | – | – |
| Supervisor | Yes | Yes, cash in/out | Yes | Yes | – |
| Manager | Yes | Yes | Yes | Yes | Yes (assigned outlets) |
| Owner | Yes | Yes | Yes | Yes | Yes, all outlets, user roles |

Members and QR guests are customers, never staff.

## Staff app (Android tablet)
- **Device setup:** a manager signs in once and registers the tablet to an outlet with a till letter.
- **Sign in:** 6-digit staff PIN. Auto-lock after idle minutes (per outlet). Clock in/out from the lock screen.
- **Shift:** opening float, cash in/out with reason, closing count with expected vs counted and over/short.
- **Order types:** Takeaway, Dine-in (table), QR order (from guests), GoFood, GrabFood, ShopeeFood.
  Delivery prices carry the platform markup (rounded up to Rp 500). Payment for delivery = the platform.
- **Menu:** categories, items, option groups (min/max choices, extra price), per-outlet prices, sold-out
  switch per outlet, stock count badge for tracked items.
- **Docket:** quantity, notes, options; removing an item already sent needs supervisor approval.
- **Send:** marks lines sent and prints tickets per station (bar printer, kitchen printer); ticket screens
  are an alternative per outlet.
- **Discounts:** listed promos (eligibility shown), voucher codes, manual % or Rp with reason; above the
  outlet threshold needs approval.
- **Members:** find by phone or member code (scan QR), register (name, birthday, WhatsApp opt-in),
  see points, stamps, missions, rewards; apply a reward; redeem points (min points, value per point).
- **Payment (record only):** cash with quick amounts and change, QRIS, debit, credit, e-wallets, transfer,
  split payments, reference field. Receipt printed; copy as text for WhatsApp.
- **Orders today:** open / paid / void & refunds; reprint; full refund with approval and method; reverses points.
- **Tables:** grid with open bills and elapsed time; open takeaway/delivery bills.
- **QR queue:** accept (sends to stations) or reject with reason.

## Back office (web)
Overview (net sales, orders, average bill, discounts, refunds & voids, member share; by day/hour, channel,
payment, category, outlet; best sellers; CSV export) · Orders (by outlet and day, detail with timeline and
approvals; CSV) · Reconciliation (per method: till recorded net of refunds vs received, with reference;
mark reconciled; last-30-days status) · Shifts & cash · Menu (items, categories, option groups) ·
Inventory (count, receive, waste/adjust; on hand = count + received ± adjustments − sold since count) ·
Customers (search, sort, profile, adjust points, give reward, CSV of opted-in) · Loyalty (points rules,
stamp cards, missions, promos & vouchers) · Staff (roles, outlets, set PIN) · Attendance (month, hours;
CSV) · Outlets & devices (tax, service, tables, approvals, idle lock; registered tablets; table QR codes) ·
Settings (brand, receipt footer, payment methods, delivery markups).

## Member app
Phone OTP sign-in (SMS via Firebase Auth first; WhatsApp OTP later, see DECISIONS D4) · Card: points and
their rupiah value, member code + QR, stamp cards, missions with progress, rewards ready · Rewards: vouchers
with expiry, points progress, running promos · History: ledger entries · Profile: name, birthday, opt-in,
sign out · Join: self sign-up after OTP (blank card only).

## Table QR ordering
`/t/<outletId>/<table>` on the member web app. Anonymous sign-in. Menu with options, cart, name, optional
member phone, note. Order arrives on the till as "Waiting". Guest sees status: waiting → being prepared →
ready → paid. Server re-prices every line.

## Loyalty rules (server)
- Earn: floor(net ÷ earnPer) points per paid order with a member. Net = after discounts, before service and tax.
- Redeem: pointValue rupiah per point, from minRedeem points, never more than the bill.
- Stamp cards: stamps per eligible item (or one per order); full card issues a reward (free item with cap,
  Rp off, or % off on categories), optional expiry.
- Missions: visits, spend, item quantity or distinct items, per week / month / once; reward points or voucher.
- Refund: points earned are taken back and points used returned. Stamps and missions are not reversed.

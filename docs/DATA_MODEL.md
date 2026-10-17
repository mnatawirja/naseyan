# Firestore data model

All money in whole rupiah. Times in epoch milliseconds. `businessDate` = outlet-local `YYYYMMDD`.

| Path | Written by | Notes |
|---|---|---|
| `config/main` | owner, manager | brand, footer, loyalty `{on, earnPer, pointValue, minRedeem}`, channels `{gofood:{name, markupPct}}`, paymentMethods[] |
| `outlets/{id}` | manager | name, code, address, tax, taxName, taxIncluded, service, tables[], approvals `{on, discountPct}`, defaultFloat, idleLockMin, timezone, active |
| `categories/{id}` | manager | name, station `bar`/`kitchen`, color, sort |
| `items/{id}` | manager; staff may change `availability` only | name, categoryId, station, price, outletPrices `{outletId: price}`, modifierGroupIds[], description, trackStock, lowStockAt, showOnQr, active, availability `{outletId: false}`, sort |
| `modifierGroups/{id}` | manager | name, min, max, options `[{name, price}]` |
| `staff/{id}` | manager | name, role, outlets[] (empty = all), active, pinSet |
| `staffSecrets/{id}` | functions only | scrypt `{salt, hash}` of the PIN |
| `devices/{id}` | functions; manager may toggle | outletId, label, active, failCount, lockedUntil, lastSignIn |
| `deviceSecrets/{id}` | functions only | scrypt of the device secret |
| `approvals/{id}` | functions only | action, orderId, detail, approverId, requestedBy, outletId, deviceId, at |
| `orders/{id}` | staff (own outlet); QR guests create `new` only; functions | see below |
| `shifts/{id}` | cashier+ | outletId, deviceId, openedBy, openedAt, float, cashMoves `[{type, amount, reason, by, approvalId, at}]`, closedAt, closedBy, counted, expected, note, stats |
| `attendance/{id}` | the staff member | staffId, outletId, date, in, out |
| `inventory/{outletId}/counts/{itemId}` | manager | qty, at, by |
| `inventory/{outletId}/moves/{id}` | supervisor+ | itemId, qty (+/−), type `receive`/`adjust`, reason, at, by |
| `recon/{outletId}_{date}` | manager | methods `{method: {received, ref}}`, note, status `open`/`done`, by, at |
| `summaries/{outletId}_{date}` | functions only | see functions/src/summary.ts; `stale: true` triggers rebuild |
| `customers/{phoneDigits}` | staff & member: name, birthday, optIn only; functions: the rest | name, phone, birthday, optIn, joinedAt, joinedAt outlet, code, points, lifetime `{spend, visits}`, stamps `{cardId: n}`, missions `{missionId_period: {progress, itemIds, doneAt, updatedAt}}`, rewards[], lastVisitAt |
| `customers/{id}/ledger/{id}` | functions only | at, orderId, orderNumber, outletId, total, points, note |
| `promos/{id}`, `stampCards/{id}`, `missions/{id}` | manager | fields as in functions/src/money.ts and loyalty.ts |
| `backofficeUsers/{uid}` | functions only | email, role, outlets |

## Order document
```
outletId, deviceId, businessDate, number ("A-012" / "Q-7KX"), channel, table, name,
status: new | open | paid | void | refunded,
lines: [Line] (functions/src/money.ts), doneLines: {lineKey: ms} (ticket screens only),
discounts: {promo, manual{kind,value,label,byStaff,approvalId}, reward, pointsRedeemed},
subtotal, discount, discountParts[], net, service, tax, total,
payments: [{method, amount, ref}], tendered, change,
customerId, customerName, createdBy, cashierId, shiftId, createdAt, sentAt, paidAt,
void{reason, by, approvalId, at}, refund{reason, method, by, approvalId, at, shiftId},
removedLines: [{name, qty, unitPrice, by, approvalId, at}],
createdByUid (QR guests), priceChecked (functions), loyalty{applied, pointsEarned, stamps[], missionsCompleted[], rewardsUnlocked[], reversed} (functions)
```

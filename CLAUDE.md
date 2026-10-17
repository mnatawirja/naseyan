# Naseyan POS — build brief for Claude Code

Naseyan is a café brand in Indonesia, planning 2–10 outlets. This repo is the production version of a
web pilot (see `reference/web-pilot/`, which shows the intended behaviour of every screen).

## What we are building
1. **Staff app** (Flutter, Android tablets): till, open bills, payments (recorded, not processed),
   members, discounts with supervisor approval, shifts and cash, attendance, Bluetooth receipt and
   bar/kitchen ticket printing, offline-first.
2. **Back office** (Flutter web): reports, orders, reconciliation, shifts, menu, inventory, customers,
   loyalty and promos, staff, attendance, outlets and devices, settings.
3. **Member app** (Flutter: Android, iOS, web): phone OTP sign-in, card, points, stamps, missions,
   rewards, history, profile, self sign-up. Customers can only ever reach their own data.
4. **Table QR ordering** (Flutter web, anonymous sign-in): menu → order → staff accept on the till.

## Stack and layout
- `app/` Flutter, three entry points: `lib/main_staff.dart`, `lib/main_backoffice.dart`, `lib/main_member.dart`.
- `functions/` Firebase Cloud Functions, TypeScript, 2nd gen, region `asia-southeast2` (Jakarta).
- `firestore.rules`, `firestore.indexes.json` at the root. Firestore location `asia-southeast2`.
- `rules-tests/` security-rules tests on the Firestore emulator.
- `docs/` product spec, data model, roadmap, decisions. Read them before starting a phase.

## Commands
- Functions: `cd functions && npm ci && npm run lint && npm test`
- Rules: `cd rules-tests && npm ci && npm test` (needs Java 21)
- App: `cd app && flutter pub get && flutter analyze && flutter test`
- Run till: `cd app && flutter run -t lib/main_staff.dart`
- Run back office: `cd app && flutter run -d chrome -t lib/main_backoffice.dart`
- Emulators: `firebase emulators:start`
- Deploy: `firebase deploy --only firestore,functions` (hosting once the web builds exist)

## First session checklist (not done yet)
1. `cd app && flutter create --platforms=android,ios,web --org id.naseyan --project-name naseyan .`
   (keeps existing lib/ and test/). Set Android minSdk 23 and add Bluetooth permissions
   (BLUETOOTH_CONNECT, BLUETOOTH_SCAN, and legacy BLUETOOTH/BLUETOOTH_ADMIN with maxSdkVersion 30).
2. `flutter pub upgrade --major-versions` — package versions in pubspec.yaml were written without pub.dev
   access. Fix any API changes, then `flutter analyze` must be clean.
3. Owner creates the Firebase project (Blaze plan, Firestore in `asia-southeast2`), enables Auth providers:
   Email/Password, Phone, Anonymous. Then `flutterfire configure` in `app/` (replaces the stub
   `lib/firebase_options.dart`) and update `.firebaserc`.
4. `cd functions && npm ci && npm run build`, then `firebase deploy --only firestore,functions`.
5. Create the owner's email account in Firebase Auth, then `node scripts/bootstrap-owner.mjs <project> <email> "<outlet>"`.

## Rules you must follow
- **Money is whole rupiah integers.** Never use doubles for stored amounts.
- **`functions/src/money.ts` and `app/lib/core/money.dart` must give identical results.** Change both
  together and update both test files with the same cases.
- **Loyalty is server-only.** Points, stamps, missions, rewards and the ledger are written by Cloud
  Functions (`onOrderWritten`, `adjustMember`). Clients must never write them; rules enforce this.
- **PINs never touch Firestore documents clients can read.** Staff PINs live in `staffSecrets/` (no client
  access), verified by `staffSignIn` / `approve`. Staff PINs are 6 digits.
- **Every rules change gets a rules test** in `rules-tests/rules.test.ts`. CI must stay green.
- **QR orders are re-priced on the server** before staff see them; never trust client prices from guests.
- Business date is the outlet's local date (`businessDate`, YYYYMMDD). Outlets may be in WIB or WITA.
- Order numbers: per-till daily sequence `A-001`, kept on the device, unique by `deviceId + businessDate`.
- The till must keep selling offline. Firestore persistence is on for the staff app; anything that needs a
  function (PIN sign-in, approvals) needs a clear offline fallback (see docs/DECISIONS.md, D6).
- UI copy: plain, short English now; add Bahasa Indonesia via `flutter_localizations` + ARB in Phase 5.
  Rupiah format `Rp 28.000`. No prices with decimals.
- Approvals (void after sending, refunds, discounts above the outlet threshold) go through the `approve`
  function and the order stores `approvalId`.

## Definition of done for any task
Tests added or updated and passing (functions, rules, Flutter), `flutter analyze` clean, behaviour matches
the web pilot unless docs/DECISIONS.md says otherwise, and docs updated when the data model changes.

## Roadmap
See `docs/ROADMAP.md`. Work phase by phase; open a PR per feature.

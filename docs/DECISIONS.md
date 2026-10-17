# Decisions

**D1 — Flutter for all three apps.** One codebase for the Android till, the member app (Android, iOS,
web) and the back office (web). Mature Bluetooth ESC/POS and Firebase packages; easy to hire in Indonesia.

**D2 — Firebase in `asia-southeast2` (Jakarta).** Customer data stays in Indonesia. Firestore offline
persistence keeps tills selling during Wi-Fi drops. Trade-off: reporting needs summaries (built by
functions) instead of SQL; export to BigQuery later if reporting grows.

**D3 — Tablets with Bluetooth ESC/POS printers (58/80 mm).** Bar and kitchen each get a printer.
Ticket screens remain an option per outlet. Network printers can be added later behind the same interface.

**D4 — Member sign-in by SMS OTP first, WhatsApp OTP later.** Firebase phone auth works out of the box;
SMS to Indonesian numbers costs money per message, so watch volume. WhatsApp OTP (via a provider such
as a WhatsApp Business API vendor) is cheaper and more familiar; it needs a custom-token function and a
provider contract (Phase 5).

**D5 — Payments are recorded, not processed.** Cashiers take payment on the EDC, QRIS stand or app and
record the method on the till. Daily reconciliation in the back office catches gaps. QRIS/EDC
integration is a later decision.

**D6 — Staff PINs are verified on the server.** PINs are hashed with scrypt in `staffSecrets/`, never
readable by clients. Each tablet holds a device secret issued at registration; sign-in needs both. Five
wrong PINs lock the device for five minutes. Offline fallback (Phase 1 decision to make): cache the last
signed-in staff token on the device so selling continues; new sign-ins and approvals wait for the network.

**D7 — Loyalty runs only in Cloud Functions.** Clients cannot award points or rewards; rules block
those fields. A transaction with an `applied` flag makes it idempotent when functions retry.

**D8 — Web pilot stays live until Phase 3 exit.** Data migration (menu, staff, members, points) runs once
before switching an outlet over.

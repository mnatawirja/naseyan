# Naseyan POS

Point of sale, back office and member app for Naseyan cafés.

| Part | Runs on | Code |
|---|---|---|
| Staff till, bar/kitchen tickets | Android tablet + Bluetooth printer | `app/lib/main_staff.dart` |
| Back office | Web | `app/lib/main_backoffice.dart` |
| Naseyan Rewards (members) | Android, iOS, web | `app/lib/main_member.dart` |
| Server logic | Firebase Cloud Functions (Jakarta) | `functions/` |
| Data & security | Firestore (Jakarta) | `firestore.rules` |

Start with `CLAUDE.md` (setup and rules), then `docs/ROADMAP.md`.
The `reference/web-pilot/` folder holds the working web pilot that defines the intended behaviour.

// One-time setup after the Firebase project exists.
// Makes an existing email account the owner, and writes default settings and the first outlet.
// Usage (from repo root, after `gcloud auth application-default login`):
//   node scripts/bootstrap-owner.mjs <project-id> <owner-email> "<first outlet name>"
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const [projectId, email, outletName] = process.argv.slice(2);
if (!projectId || !email || !outletName) { console.error('Usage: node scripts/bootstrap-owner.mjs <project-id> <owner-email> "<outlet name>"'); process.exit(1); }
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { role: 'owner', outlets: 'all' });
await db.doc('config/main').set({
  brand: 'Naseyan', footer: 'Terima kasih! Sampai jumpa lagi di Naseyan.',
  loyalty: { on: true, earnPer: 10000, pointValue: 100, minRedeem: 50 },
  channels: { gofood: { name: 'GoFood', markupPct: 20 }, grab: { name: 'GrabFood', markupPct: 20 }, shopee: { name: 'ShopeeFood', markupPct: 15 } },
  paymentMethods: ['cash', 'qris', 'debit', 'credit', 'gopay', 'ovo', 'shopeepay', 'dana', 'transfer'],
}, { merge: true });
const outlet = await db.collection('outlets').add({ name: outletName, code: 'O1', address: '', tax: 10, taxName: 'PB1', taxIncluded: false, service: 0, tables: ['T1', 'T2', 'T3', 'T4'], approvals: { on: true, discountPct: 10 }, defaultFloat: 500000, idleLockMin: 10, timezone: 'Asia/Jakarta', active: true });
console.log(`Owner set for ${email}. First outlet ${outlet.id}. Sign out and in again to pick up the owner role.`);

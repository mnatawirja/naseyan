/** Security rules tests. Run with `npm test` (needs Java; runs the Firestore emulator). */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const cashier = () => env.authenticatedContext('staff_s1', { role: 'cashier', staffId: 's1', outlets: ['oa'] }).firestore();
const manager = () => env.authenticatedContext('u_mgr', { role: 'manager', outlets: 'all' }).firestore();
const member = (phone = '+6281234567890') => env.authenticatedContext('u_mem', { phone_number: phone }).firestore();
const guest = () => env.authenticatedContext('anon1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const blankCustomer = { name: 'Rina', phone: '6281234567890', points: 0, lifetime: { spend: 0, visits: 0 }, stamps: {}, missions: {}, rewards: [] };

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-naseyan', firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'items/i1'), { name: 'Kopi', price: 28000, availability: {} });
    await setDoc(doc(db, 'orders/o1'), { outletId: 'oa', channel: 'counter', status: 'paid', customerId: '6281234567890', total: 30800 });
    await setDoc(doc(db, 'orders/o2'), { outletId: 'ob', channel: 'counter', status: 'paid', total: 1 });
    await setDoc(doc(db, 'customers/6281234567890'), { ...blankCustomer, points: 120 });
    await setDoc(doc(db, 'customers/6289999999999'), { ...blankCustomer, phone: '6289999999999', points: 5 });
    await setDoc(doc(db, 'staffSecrets/s1'), { salt: 'x', hash: 'y' });
  });
});

describe('members', () => {
  it('see only their own card', async () => {
    await assertSucceeds(getDoc(doc(member(), 'customers/6281234567890')));
    await assertFails(getDoc(doc(member(), 'customers/6289999999999')));
  });
  it('cannot give themselves points', async () => {
    await assertFails(updateDoc(doc(member(), 'customers/6281234567890'), { points: 9999 }));
    await assertSucceeds(updateDoc(doc(member(), 'customers/6281234567890'), { name: 'Rina S' }));
  });
  it('can join with a blank card only', async () => {
    const m = member('+6285555555555');
    await assertFails(setDoc(doc(m, 'customers/6285555555555'), { ...blankCustomer, points: 500 }));
    await assertSucceeds(setDoc(doc(m, 'customers/6285555555555'), { ...blankCustomer, phone: '6285555555555' }));
  });
  it('see their own orders but not others, and no staff data', async () => {
    await assertSucceeds(getDoc(doc(member(), 'orders/o1')));
    await assertFails(getDoc(doc(member(), 'orders/o2')));
    await assertFails(getDoc(doc(member(), 'staff/s1')));
  });
});

describe('staff', () => {
  it('only reach their own outlet', async () => {
    await assertSucceeds(getDoc(doc(cashier(), 'orders/o1')));
    await assertFails(getDoc(doc(cashier(), 'orders/o2')));
  });
  it('cannot touch loyalty or PIN secrets', async () => {
    await assertFails(updateDoc(doc(cashier(), 'orders/o1'), { loyalty: { applied: true } }));
    await assertFails(updateDoc(doc(cashier(), 'customers/6281234567890'), { points: 1 }));
    await assertFails(getDoc(doc(manager(), 'staffSecrets/s1')));
  });
  it('can mark items sold out but not change prices', async () => {
    await assertSucceeds(updateDoc(doc(cashier(), 'items/i1'), { availability: { oa: false } }));
    await assertFails(updateDoc(doc(cashier(), 'items/i1'), { price: 1 }));
  });
});

describe('table QR guests', () => {
  it('can place a new QR order for themselves only', async () => {
    await assertSucceeds(setDoc(doc(guest(), 'orders/q1'), { outletId: 'oa', channel: 'qr', status: 'new', createdByUid: 'anon1', lines: [] }));
    await assertFails(setDoc(doc(guest(), 'orders/q2'), { outletId: 'oa', channel: 'qr', status: 'paid', createdByUid: 'anon1', lines: [] }));
    await assertFails(getDoc(doc(guest(), 'orders/o1')));
  });
});

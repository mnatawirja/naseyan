import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/bootstrap.dart';
import '../core/theme.dart';

/// Naseyan Rewards: customers sign in with phone OTP and see only their own card.
/// Firestore rules enforce that (customers/{phone} readable only by that phone).
class MemberApp extends StatelessWidget {
  const MemberApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Naseyan Rewards',
        theme: NTheme.light(),
        darkTheme: NTheme.dark(),
        debugShowCheckedModeBanner: false,
        home: StreamBuilder<User?>(
          stream: FirebaseAuth.instance.authStateChanges(),
          builder: (context, s) => s.data?.phoneNumber == null ? const PhoneSignIn() : CardScreen(phone: s.data!.phoneNumber!.replaceAll('+', '')),
        ),
      );
}

class PhoneSignIn extends StatefulWidget {
  const PhoneSignIn({super.key});
  @override
  State<PhoneSignIn> createState() => _PhoneSignInState();
}

class _PhoneSignInState extends State<PhoneSignIn> {
  final phone = TextEditingController(), code = TextEditingController();
  String? verificationId, error;
  ConfirmationResult? webConfirm;
  bool busy = false;

  String e164(String raw) {
    var d = raw.replaceAll(RegExp(r'\D'), '');
    if (d.startsWith('0')) d = '62${d.substring(1)}';
    if (d.startsWith('8')) d = '62$d';
    return '+$d';
  }

  Future<void> send() async {
    setState(() { busy = true; error = null; });
    final number = e164(phone.text);
    if (kIsWeb) {
      try { webConfirm = await FirebaseAuth.instance.signInWithPhoneNumber(number); setState(() => busy = false); }
      on FirebaseAuthException catch (e) { setState(() { error = e.message; busy = false; }); }
      return;
    }
    await FirebaseAuth.instance.verifyPhoneNumber(
      phoneNumber: number,
      verificationCompleted: (cred) => FirebaseAuth.instance.signInWithCredential(cred),
      verificationFailed: (e) => setState(() { error = e.message; busy = false; }),
      codeSent: (id, _) => setState(() { verificationId = id; busy = false; }),
      codeAutoRetrievalTimeout: (_) {},
    );
  }

  Future<void> confirm() async {
    setState(() { busy = true; error = null; });
    try {
      if (webConfirm != null) { await webConfirm!.confirm(code.text.trim()); }
      else { await FirebaseAuth.instance.signInWithCredential(PhoneAuthProvider.credential(verificationId: verificationId!, smsCode: code.text.trim())); }
    } on FirebaseAuthException catch (e) { setState(() => error = e.message); }
    finally { if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    final waiting = verificationId != null || webConfirm != null;
    return Scaffold(body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(24), children: [
      Text('Naseyan Rewards', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      const Text('Sign in with your phone number. We send you a one-time code.'),
      const SizedBox(height: 24),
      if (!waiting) ...[
        TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone number', hintText: '0812 3456 7890')),
        const SizedBox(height: 16),
        FilledButton(onPressed: busy ? null : send, child: const Text('Send code')),
      ] else ...[
        TextField(controller: code, keyboardType: TextInputType.number, maxLength: 6, decoration: const InputDecoration(labelText: '6-digit code')),
        FilledButton(onPressed: busy ? null : confirm, child: const Text('Sign in')),
      ],
      if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
    ]))));
  }
}

class CardScreen extends StatelessWidget {
  const CardScreen({super.key, required this.phone});
  final String phone;
  @override
  Widget build(BuildContext context) => StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
        stream: db.doc('customers/$phone').snapshots(),
        builder: (context, s) {
          if (!s.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          if (!s.data!.exists) return JoinScreen(phone: phone);
          final c = s.data!.data()!;
          final rewards = (c['rewards'] as List? ?? []);
          return Scaffold(
            appBar: AppBar(title: const Text('Naseyan Rewards'), actions: [IconButton(onPressed: FirebaseAuth.instance.signOut, icon: const Icon(Icons.logout), tooltip: 'Sign out')]),
            body: ListView(padding: const EdgeInsets.all(16), children: [
              Card(color: NTheme.pandan, child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c['name'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                Text('${c['points'] ?? 0}', style: const TextStyle(color: Colors.white, fontSize: 44, fontWeight: FontWeight.w800)),
                const Text('points', style: TextStyle(color: Colors.white70)),
              ]))),
              if (c['code'] != null) Card(child: ListTile(
                leading: QrImageView(data: 'NSY:${c['code']}', size: 72),
                title: Text(c['code'], style: const TextStyle(fontSize: 22, letterSpacing: 3, fontWeight: FontWeight.w700)),
                subtitle: const Text('Show this at the counter'),
              )),
              Card(child: Column(children: [
                const ListTile(title: Text('Rewards ready', style: TextStyle(fontWeight: FontWeight.w700))),
                if (rewards.isEmpty) const ListTile(title: Text('No rewards yet. Keep collecting stamps.')),
                for (final r in rewards) ListTile(leading: const Icon(Icons.card_giftcard), title: Text(r['label'] ?? 'Reward')),
              ])),
              // Phase 3: stamp cards, missions, history (customers/{phone}/ledger), profile, change number.
            ]),
          );
        },
      );
}

class JoinScreen extends StatefulWidget {
  const JoinScreen({super.key, required this.phone});
  final String phone;
  @override
  State<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends State<JoinScreen> {
  final name = TextEditingController();
  bool optIn = true;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(24), children: [
        Text('Join Naseyan Rewards', style: Theme.of(context).textTheme.headlineSmall),
        TextField(controller: name, decoration: const InputDecoration(labelText: 'Your name')),
        CheckboxListTile(value: optIn, onChanged: (v) => setState(() => optIn = v ?? false), title: const Text('Send me Naseyan promos on WhatsApp')),
        FilledButton(
          onPressed: () => db.doc('customers/${widget.phone}').set({
            'name': name.text.trim(), 'phone': widget.phone, 'optIn': optIn, 'birthday': null, 'joinedAt': DateTime.now().millisecondsSinceEpoch,
            'points': 0, 'lifetime': {'spend': 0, 'visits': 0}, 'stamps': {}, 'missions': {}, 'rewards': [],
          }),
          child: const Text('Create my card'),
        ),
      ]))));
}

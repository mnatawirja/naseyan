import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../core/bootstrap.dart';
import '../core/theme.dart';

/// Back office (web). Managers sign in with email; access comes from role claims set by the owner.
class BackofficeApp extends StatelessWidget {
  const BackofficeApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Naseyan Back office',
        theme: NTheme.light(),
        darkTheme: NTheme.dark(),
        debugShowCheckedModeBanner: false,
        home: StreamBuilder<User?>(
          stream: FirebaseAuth.instance.idTokenChanges(),
          builder: (context, s) => s.data == null ? const _SignIn() : const _Shell(),
        ),
      );
}

class _SignIn extends StatefulWidget {
  const _SignIn();
  @override
  State<_SignIn> createState() => _SignInState();
}

class _SignInState extends State<_SignIn> {
  final email = TextEditingController(), pw = TextEditingController();
  String? error;
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 380), child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('Naseyan Back office', style: Theme.of(context).textTheme.headlineSmall),
        TextField(controller: email, decoration: const InputDecoration(labelText: 'Email')),
        TextField(controller: pw, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
        const SizedBox(height: 16),
        FilledButton(onPressed: () async {
          try { await FirebaseAuth.instance.signInWithEmailAndPassword(email: email.text.trim(), password: pw.text); }
          on FirebaseAuthException catch (e) { setState(() => error = e.message); }
        }, child: const Text('Sign in')),
        if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
      ]))));
}

/// Sections mirror the web pilot. Each one is built out in Phase 2 (docs/ROADMAP.md).
const sections = [
  ('Overview', Icons.insights), ('Orders', Icons.receipt_long), ('Reconciliation', Icons.balance), ('Shifts & cash', Icons.payments),
  ('Menu', Icons.local_cafe), ('Inventory', Icons.inventory_2), ('Customers', Icons.people), ('Loyalty & promos', Icons.star),
  ('Staff', Icons.badge), ('Attendance', Icons.schedule), ('Outlets & devices', Icons.storefront), ('Settings', Icons.tune),
];

class _Shell extends StatefulWidget {
  const _Shell();
  @override
  State<_Shell> createState() => _ShellState();
}

class _ShellState extends State<_Shell> {
  int i = 0;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Row(children: [
          NavigationRail(
            extended: MediaQuery.sizeOf(context).width > 1100,
            selectedIndex: i,
            onDestinationSelected: (v) => setState(() => i = v),
            leading: const Padding(padding: EdgeInsets.all(12), child: Text('Naseyan', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
            trailing: IconButton(onPressed: FirebaseAuth.instance.signOut, icon: const Icon(Icons.logout), tooltip: 'Sign out'),
            destinations: [for (final (l, ic) in sections) NavigationRailDestination(icon: Icon(ic), label: Text(l))],
          ),
          const VerticalDivider(width: 1),
          Expanded(child: i == 0 ? const _Overview() : Center(child: Text('${sections[i].$1}: Phase 2'))),
        ]),
      );
}

/// Yesterday and earlier come from summaries/ (built nightly); today is read live from orders/.
class _Overview extends StatelessWidget {
  const _Overview();
  @override
  Widget build(BuildContext context) => StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: db.collection('orders').where('businessDate', isEqualTo: businessDate(DateTime.now())).where('status', isEqualTo: 'paid').snapshots(),
        builder: (context, s) {
          final docs = s.data?.docs ?? [];
          final net = docs.fold<int>(0, (t, d) => t + ((d['net'] ?? 0) as num).toInt());
          return Padding(padding: const EdgeInsets.all(24), child: Wrap(spacing: 16, runSpacing: 16, children: [
            _Kpi('Net sales today', rp(net)), _Kpi('Orders', '${docs.length}'), _Kpi('Average bill', rp(docs.isEmpty ? 0 : net ~/ docs.length)),
          ]));
        },
      );
}

class _Kpi extends StatelessWidget {
  const _Kpi(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => SizedBox(width: 220, child: Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label.toUpperCase(), style: Theme.of(context).textTheme.labelSmall),
        Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
      ]))));
}

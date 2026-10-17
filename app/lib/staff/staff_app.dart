import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/bootstrap.dart';
import '../core/theme.dart';
import 'sell_screen.dart';

/// Staff till for Android tablets. Flow: device setup (once, by a manager) → staff PIN → till.
class StaffApp extends StatelessWidget {
  const StaffApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Naseyan POS',
        theme: NTheme.light(),
        darkTheme: NTheme.dark(),
        debugShowCheckedModeBanner: false,
        home: const _Gate(),
      );
}

class DeviceConfig {
  DeviceConfig(this.deviceId, this.secret, this.outletId, this.label);
  final String deviceId, secret, outletId, label;
  static Future<DeviceConfig?> load() async {
    final p = await SharedPreferences.getInstance();
    final id = p.getString('deviceId');
    if (id == null) return null;
    return DeviceConfig(id, p.getString('deviceSecret')!, p.getString('outletId')!, p.getString('deviceLabel') ?? 'Till');
  }
  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('deviceId', deviceId);
    await p.setString('deviceSecret', secret);
    await p.setString('outletId', outletId);
    await p.setString('deviceLabel', label);
  }
}

class _Gate extends StatefulWidget {
  const _Gate();
  @override
  State<_Gate> createState() => _GateState();
}

class _GateState extends State<_Gate> {
  DeviceConfig? device;
  bool loading = true;
  @override
  void initState() {
    super.initState();
    DeviceConfig.load().then((d) => setState(() { device = d; loading = false; }));
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (device == null) return DeviceSetupScreen(onDone: (d) => setState(() => device = d));
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.idTokenChanges(),
      builder: (context, snap) {
        final u = snap.data;
        if (u == null || !u.uid.startsWith('staff_')) return PinScreen(device: device!);
        return SellScreen(device: device!, onLock: () => FirebaseAuth.instance.signOut());
      },
    );
  }
}

/// A manager signs in with their back-office email once to register this tablet to an outlet.
class DeviceSetupScreen extends StatefulWidget {
  const DeviceSetupScreen({super.key, required this.onDone});
  final ValueChanged<DeviceConfig> onDone;
  @override
  State<DeviceSetupScreen> createState() => _DeviceSetupScreenState();
}

class _DeviceSetupScreenState extends State<DeviceSetupScreen> {
  final email = TextEditingController(), password = TextEditingController(), label = TextEditingController(text: 'Till A');
  String? outletId, error;
  bool busy = false, signedIn = false;

  Future<void> signIn() async {
    setState(() { busy = true; error = null; });
    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(email: email.text.trim(), password: password.text);
      setState(() => signedIn = true);
    } on FirebaseAuthException catch (e) {
      setState(() => error = e.message);
    } finally {
      setState(() => busy = false);
    }
  }

  Future<void> register() async {
    if (outletId == null) return;
    setState(() { busy = true; error = null; });
    try {
      final r = await fns.httpsCallable('registerDevice').call({'outletId': outletId, 'label': label.text.trim()});
      final d = DeviceConfig(r.data['deviceId'], r.data['deviceSecret'], outletId!, label.text.trim());
      await d.save();
      await FirebaseAuth.instance.signOut();
      widget.onDone(d);
    } on FirebaseFunctionsException catch (e) {
      setState(() => error = e.message);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: ListView(padding: const EdgeInsets.all(24), shrinkWrap: true, children: [
              Text('Set up this till', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              const Text('A manager signs in once to link this tablet to an outlet. Staff then use their PIN.'),
              const SizedBox(height: 24),
              if (!signedIn) ...[
                TextField(controller: email, decoration: const InputDecoration(labelText: 'Manager email'), keyboardType: TextInputType.emailAddress),
                TextField(controller: password, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
                const SizedBox(height: 16),
                FilledButton(onPressed: busy ? null : signIn, child: const Text('Sign in')),
              ] else ...[
                StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                  stream: db.collection('outlets').where('active', isEqualTo: true).snapshots(),
                  builder: (context, s) => DropdownButtonFormField<String>(
                    value: outletId,
                    decoration: const InputDecoration(labelText: 'Outlet'),
                    items: [for (final d in s.data?.docs ?? []) DropdownMenuItem(value: d.id, child: Text(d['name']))],
                    onChanged: (v) => setState(() => outletId = v),
                  ),
                ),
                TextField(controller: label, decoration: const InputDecoration(labelText: 'Till name (e.g. Till A)')),
                const SizedBox(height: 16),
                FilledButton(onPressed: busy || outletId == null ? null : register, child: const Text('Register this till')),
              ],
              if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            ]),
          ),
        ),
      );
}

/// Staff sign in with a 6-digit PIN. The server checks it and returns a token with their role.
class PinScreen extends StatefulWidget {
  const PinScreen({super.key, required this.device});
  final DeviceConfig device;
  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> {
  String pin = '';
  String? error;
  bool busy = false;

  Future<void> submit() async {
    setState(() { busy = true; error = null; });
    try {
      final r = await fns.httpsCallable('staffSignIn').call({'deviceId': widget.device.deviceId, 'deviceSecret': widget.device.secret, 'pin': pin});
      await FirebaseAuth.instance.signInWithCustomToken(r.data['token']);
    } on FirebaseFunctionsException catch (e) {
      setState(() { error = e.message; pin = ''; });
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void press(String k) {
    setState(() {
      error = null;
      if (k == 'C') { pin = ''; } else if (k == 'OK') { if (pin.length == 6) submit(); } else if (pin.length < 6) { pin += k; }
    });
    if (pin.length == 6 && !busy) submit();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 340),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text('Naseyan', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
              Text(widget.device.label),
              const SizedBox(height: 24),
              Text('●' * pin.length + '○' * (6 - pin.length), style: const TextStyle(fontSize: 28, letterSpacing: 8)),
              SizedBox(height: 24, child: Text(error ?? '', style: TextStyle(color: Theme.of(context).colorScheme.error))),
              GridView.count(
                crossAxisCount: 3, shrinkWrap: true, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.4,
                children: [for (final k in ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'])
                  OutlinedButton(onPressed: busy ? null : () => press(k), child: Text(k, style: const TextStyle(fontSize: 22)))],
              ),
            ]),
          ),
        ),
      );
}

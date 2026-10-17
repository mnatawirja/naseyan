import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../core/bootstrap.dart';
import '../core/money.dart';
import '../core/theme.dart';
import 'staff_app.dart';

/// The till: menu on the left, the order docket on the right.
/// Phase 1 starting point: menu, docket, totals and a cash sale saved to Firestore.
/// Still to build (see docs/ROADMAP.md): options picker, all order types, split payments,
/// members, discounts with approvals, open bills, shifts, printing, refunds.
class SellScreen extends StatefulWidget {
  const SellScreen({super.key, required this.device, required this.onLock});
  final DeviceConfig device;
  final VoidCallback onLock;
  @override
  State<SellScreen> createState() => _SellScreenState();
}

class _SellScreenState extends State<SellScreen> {
  final lines = <Line>[];
  Channel channel = Channel.counter;
  String? categoryId;
  OutletTax outletTax = const OutletTax(tax: 10, service: 0);
  bool saving = false;

  @override
  void initState() {
    super.initState();
    db.doc('outlets/${widget.device.outletId}').get().then((s) {
      final d = s.data() ?? {};
      setState(() => outletTax = OutletTax(tax: d['tax'] ?? 10, service: d['service'] ?? 0, taxIncluded: d['taxIncluded'] ?? false));
    });
  }

  void add(String id, Map<String, dynamic> item) {
    final base = (item['outletPrices']?[widget.device.outletId] ?? item['price'] as num).toInt();
    setState(() {
      final same = lines.where((l) => l.itemId == id && l.sentAt == null && l.mods.isEmpty).firstOrNull;
      if (same != null) { same.qty++; return; }
      lines.add(Line(key: DateTime.now().microsecondsSinceEpoch.toRadixString(36), itemId: id, name: item['name'], categoryId: item['categoryId'],
          station: item['station'] ?? 'bar', qty: 1, basePrice: base, modPrice: 0, unitPrice: base));
    });
  }

  Future<void> payCash(Totals t) async {
    setState(() => saving = true);
    final now = DateTime.now();
    final staffId = (await FirebaseAuth.instance.currentUser!.getIdTokenResult()).claims?['staffId'];
    try {
      await db.collection('orders').add({
        'outletId': widget.device.outletId, 'deviceId': widget.device.deviceId, 'businessDate': businessDate(now),
        'number': '', // Phase 1: per-till daily sequence, e.g. A-012
        'channel': channel.name, 'status': 'paid', 'lines': [for (final l in lines) (l..sentAt ??= now.millisecondsSinceEpoch).toJson()],
        'subtotal': t.subtotal, 'discount': t.discount, 'net': t.net, 'service': t.service, 'tax': t.tax, 'total': t.total,
        'payments': [{'method': 'cash', 'amount': t.total}], 'createdBy': staffId, 'cashierId': staffId,
        'createdAt': now.millisecondsSinceEpoch, 'paidAt': now.millisecondsSinceEpoch, 'customerId': null,
      });
      setState(lines.clear);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Paid ${rp(t.total)}')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = totals(lines: lines, channel: channel, outlet: outletTax);
    return Scaffold(
      appBar: AppBar(title: Text('Naseyan · ${widget.device.label}'), actions: [IconButton(onPressed: widget.onLock, icon: const Icon(Icons.lock_outline), tooltip: 'Lock till')]),
      body: Row(children: [
        Expanded(child: _menu()),
        SizedBox(width: 380, child: Material(color: Theme.of(context).colorScheme.surface, child: _docket(t))),
      ]),
    );
  }

  Widget _menu() => Column(children: [
        StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: db.collection('categories').orderBy('sort').snapshots(),
          builder: (context, s) => SizedBox(
            height: 56,
            child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.all(8), children: [
              ChoiceChip(label: const Text('All'), selected: categoryId == null, onSelected: (_) => setState(() => categoryId = null)),
              for (final c in s.data?.docs ?? [])
                Padding(padding: const EdgeInsets.only(left: 8), child: ChoiceChip(label: Text(c['name']), selected: categoryId == c.id, onSelected: (_) => setState(() => categoryId = c.id))),
            ]),
          ),
        ),
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: db.collection('items').where('active', isEqualTo: true).snapshots(),
            builder: (context, s) {
              final docs = (s.data?.docs ?? []).where((d) => categoryId == null || d['categoryId'] == categoryId).toList();
              return GridView.extent(maxCrossAxisExtent: 170, padding: const EdgeInsets.all(8), mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 1.3, children: [
                for (final d in docs)
                  Card(child: InkWell(
                    onTap: d.data()['availability']?[widget.device.outletId] == false ? null : () => add(d.id, d.data()),
                    child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Text(d['name'], style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text(rpn((d['price'] as num).toInt())),
                    ])),
                  )),
              ]);
            },
          ),
        ),
      ]);

  Widget _docket(Totals t) => Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: SegmentedButton<Channel>(
            segments: const [ButtonSegment(value: Channel.counter, label: Text('Takeaway')), ButtonSegment(value: Channel.table, label: Text('Dine-in'))],
            selected: {channel},
            onSelectionChanged: (v) => setState(() => channel = v.first),
          ),
        ),
        Expanded(child: ListView(children: [
          for (final l in lines)
            ListTile(
              title: Text('${l.qty} × ${l.name}'),
              trailing: Text(rpn(l.amount)),
              onLongPress: () => setState(() => l.qty > 1 ? l.qty-- : lines.remove(l)),
            ),
        ])),
        const Divider(height: 1),
        Padding(padding: const EdgeInsets.all(12), child: Column(children: [
          _row('Subtotal', t.subtotal),
          if (t.service > 0) _row('Service', t.service),
          if (t.tax > 0) _row('PB1', t.tax),
          _row('Total', t.total, bold: true),
          const SizedBox(height: 12),
          SizedBox(width: double.infinity, height: 56, child: FilledButton(onPressed: lines.isEmpty || saving ? null : () => payCash(t), child: Text('Cash ${rp(t.total)}'))),
        ])),
      ]);

  Widget _row(String l, int v, {bool bold = false}) => Row(children: [
        Expanded(child: Text(l, style: TextStyle(fontWeight: bold ? FontWeight.w700 : null))),
        Text(rpn(v), style: TextStyle(fontWeight: bold ? FontWeight.w700 : null, fontFeatures: const [FontFeature.tabularFigures()])),
      ]);
}

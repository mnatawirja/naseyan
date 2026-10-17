import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import '../core/theme.dart';

/// Bluetooth ESC/POS printing for receipts and bar/kitchen tickets.
/// Paper: 58mm (32 chars) or 80mm (48 chars), set per printer in device settings.
/// Phase 1 task: confirm both packages' current APIs after `flutter pub upgrade --major-versions`.
class ReceiptPrinter {
  ReceiptPrinter({required this.macAddress, this.paper = PaperSize.mm58});
  final String macAddress;
  final PaperSize paper;

  static Future<List<BluetoothInfo>> pairedPrinters() => PrintBluetoothThermal.pairedBluetooths;

  Future<bool> _ensureConnected() async {
    if (await PrintBluetoothThermal.connectionStatus) return true;
    return PrintBluetoothThermal.connect(macPrinterAddress: macAddress);
  }

  Future<bool> send(List<int> bytes) async {
    if (!await _ensureConnected()) return false;
    return PrintBluetoothThermal.writeBytes(bytes);
  }

  Future<Generator> _gen() async => Generator(paper, await CapabilityProfile.load());

  /// Customer receipt. [lines] are (qty, name, amount, detail).
  Future<List<int>> receipt({
    required String brand,
    required String outlet,
    required String orderNo,
    required String when,
    required String type,
    required List<(int, String, int, String)> lines,
    required List<(String, int)> totals,
    required List<(String, int)> payments,
    int change = 0,
    String footer = '',
  }) async {
    final g = await _gen();
    final b = <int>[];
    b.addAll(g.text(brand.toUpperCase(), styles: const PosStyles(align: PosAlign.center, bold: true, height: PosTextSize.size2)));
    b.addAll(g.text(outlet, styles: const PosStyles(align: PosAlign.center)));
    b.addAll(g.hr());
    b.addAll(g.row([PosColumn(text: 'No $orderNo', width: 6), PosColumn(text: when, width: 6, styles: const PosStyles(align: PosAlign.right))]));
    b.addAll(g.text(type));
    b.addAll(g.hr());
    for (final (qty, name, amount, detail) in lines) {
      b.addAll(g.row([PosColumn(text: '$qty x $name', width: 8), PosColumn(text: rpn(amount), width: 4, styles: const PosStyles(align: PosAlign.right))]));
      if (detail.isNotEmpty) b.addAll(g.text('   $detail'));
    }
    b.addAll(g.hr());
    for (final (label, v) in [...totals, ...payments, if (change > 0) ('Change', change)]) {
      b.addAll(g.row([PosColumn(text: label, width: 8), PosColumn(text: rpn(v), width: 4, styles: const PosStyles(align: PosAlign.right))]));
    }
    if (footer.isNotEmpty) { b.addAll(g.hr()); b.addAll(g.text(footer, styles: const PosStyles(align: PosAlign.center))); }
    b.addAll(g.feed(2));
    b.addAll(g.cut());
    return b;
  }

  /// Bar or kitchen ticket: large order number and items, no prices.
  Future<List<int>> ticket({required String station, required String orderNo, required String where, required List<(int, String, String, String)> items}) async {
    final g = await _gen();
    final b = <int>[];
    b.addAll(g.text('${station.toUpperCase()}  $orderNo', styles: const PosStyles(bold: true, height: PosTextSize.size2, width: PosTextSize.size2)));
    b.addAll(g.text(where));
    b.addAll(g.hr());
    for (final (qty, name, mods, note) in items) {
      b.addAll(g.text('$qty x $name', styles: const PosStyles(bold: true, height: PosTextSize.size2)));
      if (mods.isNotEmpty) b.addAll(g.text('   $mods'));
      if (note.isNotEmpty) b.addAll(g.text('   "$note"', styles: const PosStyles(bold: true)));
    }
    b.addAll(g.feed(2));
    b.addAll(g.cut());
    return b;
  }
}

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Naseyan look carried over from the web pilot: pandan green, caramel accent, cool neutral ground.
class NTheme {
  static const pandan = Color(0xFF1C664C);
  static const caramel = Color(0xFFB8701F);
  static const ground = Color(0xFFEEF2EF);
  static const ink = Color(0xFF18201C);

  static ThemeData light() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: pandan, primary: pandan, secondary: caramel, surface: Colors.white),
        scaffoldBackgroundColor: ground,
        visualDensity: VisualDensity.comfortable,
      );
  static ThemeData dark() => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: pandan, brightness: Brightness.dark),
      );
}

final _rp = NumberFormat.decimalPattern('id_ID');
String rp(int v) => '${v < 0 ? '−' : ''}Rp ${_rp.format(v.abs())}';
String rpn(int v) => _rp.format(v);

/// Business date in the outlet's local time, as YYYYMMDD.
String businessDate(DateTime t) =>
    '${t.year}${t.month.toString().padLeft(2, '0')}${t.day.toString().padLeft(2, '0')}';

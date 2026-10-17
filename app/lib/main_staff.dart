import 'package:flutter/material.dart';
import 'core/bootstrap.dart';
import 'staff/staff_app.dart';

/// flutter run -t lib/main_staff.dart   (Android tablet)
Future<void> main() async {
  await bootstrap(offline: true);
  runApp(const StaffApp());
}

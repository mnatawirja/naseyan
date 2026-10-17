import 'package:flutter/material.dart';
import 'backoffice/backoffice_app.dart';
import 'core/bootstrap.dart';

/// flutter run -d chrome -t lib/main_backoffice.dart
Future<void> main() async {
  await bootstrap();
  runApp(const BackofficeApp());
}

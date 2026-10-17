import 'package:flutter/material.dart';
import 'core/bootstrap.dart';
import 'member/member_app.dart';

/// flutter run -t lib/main_member.dart   (Android, iOS or web)
Future<void> main() async {
  await bootstrap();
  runApp(const MemberApp());
}

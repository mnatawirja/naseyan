import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/widgets.dart';
import 'package:intl/date_symbol_data_local.dart';

import '../firebase_options.dart';

/// Shared start-up for all three apps.
Future<void> bootstrap({bool offline = false}) async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID');
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  // Tills keep working when Wi-Fi drops; Firestore syncs queued writes when back online.
  FirebaseFirestore.instance.settings = Settings(persistenceEnabled: offline, cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED);
}

/// All callable functions run in Jakarta.
FirebaseFunctions get fns => FirebaseFunctions.instanceFor(region: 'asia-southeast2');
FirebaseFirestore get db => FirebaseFirestore.instance;

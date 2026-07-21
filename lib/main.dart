import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:meditrace/app/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (defaultTargetPlatform == TargetPlatform.android) {
    await Firebase.initializeApp();
  }

  runApp(const MediTraceApp());
}

/// Retained as an entry-point widget name for the existing smoke test.
class MyApp extends MediTraceApp {
  const MyApp({super.key});
}

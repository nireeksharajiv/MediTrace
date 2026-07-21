import 'package:flutter/material.dart';
import 'package:meditrace/app/app_router.dart';
import 'package:meditrace/app/app_theme.dart';

class MediTraceApp extends StatelessWidget {
  const MediTraceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MediTrace',
      theme: AppTheme.lightTheme,
      initialRoute: AppRouter.splashRoute,
      routes: AppRouter.routes,
    );
  }
}

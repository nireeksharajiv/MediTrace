import 'package:flutter/material.dart';

abstract final class AppTheme {
  static final ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: const Color(0xFF00695C),
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: Colors.white,
  );
}

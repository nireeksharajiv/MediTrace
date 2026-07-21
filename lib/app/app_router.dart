import 'package:flutter/widgets.dart';
import 'package:meditrace/features/home/presentation/home_page.dart';
import 'package:meditrace/features/splash/presentation/splash_page.dart';

abstract final class AppRouter {
  static const splashRoute = '/';
  static const homeRoute = '/home';

  static final Map<String, WidgetBuilder> routes = {
    splashRoute: (_) => const SplashPage(),
    homeRoute: (_) => const HomePage(),
  };
}

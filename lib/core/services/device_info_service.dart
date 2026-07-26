import 'dart:math';

class DeviceInfoService {
  static String? _cachedDeviceId;

  /// Returns a persistent device identifier for the app session.
  static String get deviceId {
    if (_cachedDeviceId != null) return _cachedDeviceId!;

    final random = Random();
    final parts = List.generate(4, (_) => random.nextInt(0xFFFF).toRadixString(16).padLeft(4, '0'));
    _cachedDeviceId = 'device_${parts.join('-')}';
    return _cachedDeviceId!;
  }

  /// Returns mock coordinates if native location services are unconfigured.
  static Map<String, double?> get currentLocation {
    return {
      'latitude': 28.6139,
      'longitude': 77.2090,
    };
  }
}

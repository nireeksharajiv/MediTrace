import 'package:cloud_firestore/cloud_firestore.dart';

class DuplicateSerialDetectionService {
  DuplicateSerialDetectionService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  /// Checks if the [serialNumber] has already been scanned previously from a different device or location.
  /// Returns true ONLY if previous scan_history entries indicate cloning / suspicious scan activity.
  Future<bool> checkIsSuspicious({
    required String serialNumber,
    required String currentDeviceId,
    double? currentLatitude,
    double? currentLongitude,
  }) async {
    if (serialNumber.isEmpty || serialNumber == 'N/A' || serialNumber == 'Unavailable') {
      return false;
    }

    try {
      final snapshot = await _firestore
          .collection('scan_history')
          .where('serialNumber', isEqualTo: serialNumber)
          .limit(20)
          .get();

      if (snapshot.docs.isEmpty) {
        return false;
      }

      for (final doc in snapshot.docs) {
        final data = doc.data();
        final prevDeviceId = data['deviceId']?.toString();
        final prevLat = (data['latitude'] as num?)?.toDouble();
        final prevLng = (data['longitude'] as num?)?.toDouble();

        // 1. Different deviceId indicates scan from another device
        final isDifferentDevice = prevDeviceId != null && prevDeviceId != currentDeviceId;

        // 2. Significantly different location coordinates
        bool isDifferentLocation = false;
        if (prevLat != null && currentLatitude != null && prevLng != null && currentLongitude != null) {
          final latDiff = (prevLat - currentLatitude).abs();
          final lngDiff = (prevLng - currentLongitude).abs();
          if (latDiff > 0.01 || lngDiff > 0.01) {
            isDifferentLocation = true;
          }
        }

        // Return true ONLY if scanned from a different device or different location
        if (isDifferentDevice || isDifferentLocation) {
          return true;
        }
      }

      return false;
    } catch (_) {
      return false;
    }
  }
}

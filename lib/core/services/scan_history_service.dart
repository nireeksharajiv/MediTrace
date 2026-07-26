import 'package:cloud_firestore/cloud_firestore.dart';

class ScanHistoryService {
  ScanHistoryService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  /// Logs an online scan verification into the `scan_history` Firestore collection.
  Future<void> logScan({
    required String serialNumber,
    required String gtin,
    required String verificationStatus,
    double? latitude,
    double? longitude,
    String? deviceId,
  }) async {
    try {
      await _firestore.collection('scan_history').add({
        'serialNumber': serialNumber,
        'gtin': gtin,
        'timestamp': FieldValue.serverTimestamp(),
        'latitude': latitude,
        'longitude': longitude,
        'deviceId': deviceId ?? 'unknown_device',
        'verificationStatus': verificationStatus,
      });
    } catch (_) {
      // Ignore network log failures to keep verification fluid
    }
  }
}

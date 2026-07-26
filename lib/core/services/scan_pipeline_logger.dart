import 'package:flutter/foundation.dart';

abstract final class ScanPipelineLogger {
  /// Outputs structured debug logs tracing the camera scan pipeline.
  static void printLog({
    required String rawBarcode,
    required String barcodeFormat,
    required String decodedText,
    required String parsedGtin,
    required String parsedExpiry,
    required String parsedSerial,
    required bool internetAvailable,
    required String firestoreDocRequested,
    required String documentExists,
    required String repositoryResult,
  }) {
    debugPrint('''
----------------------------------------

RAW BARCODE:
$rawBarcode

Barcode Format:
$barcodeFormat

Decoded Text:
$decodedText

Parsed GTIN:
$parsedGtin

Parsed Expiry:
$parsedExpiry

Parsed Serial:
$parsedSerial

Internet Available:
$internetAvailable

Firestore Document Requested:
$firestoreDocRequested

Document Exists:
$documentExists

Repository Result:
$repositoryResult

----------------------------------------
''');
  }
}

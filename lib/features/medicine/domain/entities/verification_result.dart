import 'package:meditrace/core/services/gs1_parser_service.dart';

/// Values decoded from a scanned GS1 Data Matrix payload.
class ScannedMedicinePayload {
  const ScannedMedicinePayload({
    required this.gtin,
    required this.expiryDate,
    required this.serialNumber,
    required this.rawBarcode,
    this.barcodeFormat = 'DataMatrix',
    this.manufacturingDate,
  });

  final String gtin;
  final String expiryDate;
  final String serialNumber;
  final String rawBarcode;
  final String barcodeFormat;
  final String? manufacturingDate;

  /// Parses GS1 Data Matrix payloads.
  /// Throws FormatException('Unable to decode GS1 Data Matrix.') if decoding fails.
  factory ScannedMedicinePayload.parse(
    String rawPayload, {
    String barcodeFormat = 'DataMatrix',
  }) {
    final parsedMap = Gs1ParserService.parsePayload(rawPayload);

    return ScannedMedicinePayload(
      rawBarcode: rawPayload,
      barcodeFormat: barcodeFormat,
      gtin: parsedMap['gtin']!,
      expiryDate: parsedMap['expiryDate']!,
      serialNumber: parsedMap['serialNumber']!,
    );
  }

  /// Manual GTIN search fallback.
  factory ScannedMedicinePayload.fromGtin(String gtin) {
    return ScannedMedicinePayload(
      rawBarcode: gtin,
      barcodeFormat: 'Manual Input',
      gtin: gtin,
      expiryDate: 'Unavailable (not encoded)',
      serialNumber: 'N/A',
    );
  }
}
/// Values encoded in a scanned Data Matrix payload.
///
/// These values are available before a network request, allowing the app
/// to verify a medicine even while offline.
class ScannedMedicinePayload {
  const ScannedMedicinePayload({
    required this.gtin,
    required this.manufacturingDate,
    required this.expiryDate,
  });

  final String gtin;
  final String manufacturingDate;
  final String expiryDate;

  /// Supported payload examples:
  ///
  /// Example 1
  /// 08901234560013
  /// Manufacturing Date: 2026-01-15
  /// Expiry Date: 2028-01-14
  ///
  /// Example 2
  /// GTIN=08901234560013
  /// MFG=2026-01-15
  /// EXP=2028-01-14
  ///
  /// Example 3
  /// 08901234560013 Manufacturing Date:2026-01-15 Expiry Date:2028-01-14
  factory ScannedMedicinePayload.parse(String rawPayload) {
    final normalized = rawPayload
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .trim();

    // Debug
    print("========== RAW BARCODE ==========");
    print(normalized);
    print("================================");

    // ------------------------
    // Extract GTIN
    // ------------------------

    final gtinMatch = RegExp(r'\b\d{13,14}\b').firstMatch(normalized);

    if (gtinMatch == null) {
      throw const FormatException(
        'GTIN not found in scanned Data Matrix.',
      );
    }

    final gtin = gtinMatch.group(0)!;

    // ------------------------
    // Extract Manufacturing Date
    // ------------------------

    final mfgMatch = RegExp(
      r'(Manufacturing\s*Date|MFG)\s*[:=]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})',
      caseSensitive: false,
    ).firstMatch(normalized);

    // ------------------------
    // Extract Expiry Date
    // ------------------------

    final expMatch = RegExp(
      r'(Expiry\s*Date|EXP)\s*[:=]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})',
      caseSensitive: false,
    ).firstMatch(normalized);

    if (mfgMatch == null || expMatch == null) {
      throw FormatException(
        '''
The scanned Data Matrix does not contain both medicine dates.

Raw barcode:

$normalized
''',
      );
    }

    final manufacturingDate = mfgMatch.group(2)!;
    final expiryDate = expMatch.group(2)!;

    return ScannedMedicinePayload(
      gtin: gtin,
      manufacturingDate: manufacturingDate,
      expiryDate: expiryDate,
    );
  }

  /// Manual GTIN search.
  factory ScannedMedicinePayload.fromGtin(String gtin) {
    return ScannedMedicinePayload(
      gtin: gtin,
      manufacturingDate: 'Unavailable (not encoded)',
      expiryDate: 'Unavailable (not encoded)',
    );
  }
}
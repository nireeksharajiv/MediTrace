import 'package:flutter_test/flutter_test.dart';
import 'package:meditrace/core/services/gs1_parser_service.dart';
import 'package:meditrace/core/services/expiry_validation_service.dart';
import 'package:meditrace/features/medicine/domain/entities/medicine.dart';
import 'package:meditrace/features/medicine/domain/entities/verification_result.dart';

void main() {
  group('Gs1ParserService Tests', () {
    test('Parses GS1 bracketed AI notation (01), (17), (21)', () {
      const payload = '(01)08901234560013(17)280114(21)SN987654';
      final result = Gs1ParserService.parsePayload(payload);

      expect(result['gtin'], equals('08901234560013'));
      expect(result['expiryDate'], equals('2028-01-14'));
      expect(result['serialNumber'], equals('SN987654'));
    });

    test('Parses 13-digit GTIN 8901234560013 without leading zero', () {
      const payload = '(01)8901234560013(17)280114(21)SN100001';
      final result = Gs1ParserService.parsePayload(payload);

      expect(result['gtin'], equals('8901234560013'));
      expect(result['expiryDate'], equals('2028-01-14'));
      expect(result['serialNumber'], equals('SN100001'));
    });

    test('Parses key-value GS1 format', () {
      const payload = 'GTIN=08901234560013 EXP=2028-01-14 SN=SN12345';
      final parsed = ScannedMedicinePayload.parse(payload);

      expect(parsed.gtin, equals('08901234560013'));
      expect(parsed.expiryDate, equals('2028-01-14'));
      expect(parsed.serialNumber, equals('SN12345'));
    });

    test('Throws FormatException with Unable to decode GS1 Data Matrix message on invalid input', () {
      expect(
        () => Gs1ParserService.parsePayload('invalid_non_barcode_string'),
        throwsA(
          isA<FormatException>().having(
            (e) => e.message,
            'message',
            contains('Unable to decode GS1 Data Matrix'),
          ),
        ),
      );
    });
  });

  group('ExpiryValidationService Tests', () {
    test('Identifies past expiry dates as expired', () {
      final isExpired = ExpiryValidationService.isExpired(
        '2026-01-01',
        DateTime(2026, 07, 26),
      );
      expect(isExpired, isTrue);
    });

    test('Identifies future expiry dates as non-expired', () {
      final isExpired = ExpiryValidationService.isExpired(
        '2028-01-14',
        DateTime(2026, 07, 26),
      );
      expect(isExpired, isFalse);
    });
  });

  group('Medicine Entity & Serial Number Tests', () {
    test('Correctly maps serialNumber when present in JSON', () {
      final json = {
        'gtin': '8901234560013',
        'medicineName': 'Paracetamol',
        'manufacturer': 'Sun Pharma',
        'batchNumber': 'BAT2026001',
        'manufacturingDate': '2026-01-15',
        'expiryDate': '2028-01-14',
        'dosage': 'As directed',
        'status': 'Genuine',
        'description': 'Pain reliever',
        'serialNumber': 'SN100001',
      };

      final medicine = Medicine.fromJson(json);

      expect(medicine.serialNumber, equals('SN100001'));
      expect(medicine.gtin, equals('8901234560013'));
    });

    test('Defaults serialNumber to N/A when missing in JSON', () {
      final json = {
        'gtin': '8901234560013',
        'medicineName': 'Paracetamol',
        'manufacturer': 'Pharma Corp',
        'batchNumber': 'B123',
        'manufacturingDate': '2026-01-01',
        'expiryDate': '2028-01-01',
        'dosage': '500mg',
        'status': 'Verified',
        'description': 'Pain reliever',
      };

      final medicine = Medicine.fromJson(json);

      expect(medicine.serialNumber, equals('N/A'));
      expect(medicine.gtin, equals('8901234560013'));
    });
  });
}

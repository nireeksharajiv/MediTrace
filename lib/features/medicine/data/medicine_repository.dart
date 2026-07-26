import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:meditrace/features/medicine/domain/entities/medicine.dart';

class MedicineRepository {
  MedicineRepository({FirebaseFirestore? firestore})
    : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  Future<Medicine?> getMedicineByGtin(String gtin) async {
    final cleanGtin = gtin.replaceAll(RegExp(r'[^\d]'), '').trim();

    debugPrint('========== FIRESTORE REQUEST ==========');
    debugPrint('Firestore Document ID Requested: $cleanGtin');

    // 1. Try exact document lookup using GTIN as the document ID
    DocumentSnapshot<Map<String, dynamic>> snapshot = await _firestore
        .collection('medicines')
        .doc(cleanGtin)
        .get();

    // 2. Fallback: If 14 digits starting with '0', try 13 digits (strip leading zero)
    if (!snapshot.exists && cleanGtin.length == 14 && cleanGtin.startsWith('0')) {
      final gtin13 = cleanGtin.substring(1);
      debugPrint('Retrying Firestore Lookup with 13-digit GTIN: $gtin13');
      snapshot = await _firestore.collection('medicines').doc(gtin13).get();
    }

    // 3. Fallback: If 13 digits, try 14 digits (pad leading zero)
    if (!snapshot.exists && cleanGtin.length == 13) {
      final gtin14 = '0$cleanGtin';
      debugPrint('Retrying Firestore Lookup with 14-digit GTIN: $gtin14');
      snapshot = await _firestore.collection('medicines').doc(gtin14).get();
    }

    if (!snapshot.exists || snapshot.data() == null) {
      debugPrint('Firestore Response: Document NOT FOUND for GTIN "$cleanGtin".');
      debugPrint('=======================================');
      return null;
    }

    debugPrint('Firestore Response: Document FOUND (ID: ${snapshot.id})');
    final data = snapshot.data()!;

    final medicine = Medicine(
      gtin: _text(data['gtin'], fallback: snapshot.id),
      medicineId: _text(data['medicineId'], fallback: snapshot.id),
      medicineName: _text(data['medicineName']),
      manufacturer: _text(data['manufacturer']),
      batchNumber: _text(data['batchNumber']),
      manufacturingDate: _dateText(data['manufacturingDate']),
      expiryDate: _dateText(data['expiryDate']),
      dosage: _text(data['dosage']),
      status: _text(data['status']),
      description: _text(data['description']),
      serialNumber: _text(data['serialNumber'], fallback: 'N/A'),
    );

    debugPrint('''
Repository Success
↓

Medicine Object Created
Medicine Object:

medicineId: ${medicine.medicineId}
medicineName: ${medicine.medicineName}
manufacturer: ${medicine.manufacturer}
batchNumber: ${medicine.batchNumber}
manufacturingDate: ${medicine.manufacturingDate}
expiryDate: ${medicine.expiryDate}
gtin: ${medicine.gtin}
serialNumber: ${medicine.serialNumber}
dosage: ${medicine.dosage}
status: ${medicine.status}
description: ${medicine.description}
''');

    return medicine;
  }

  String _text(Object? value, {String fallback = 'Not available'}) {
    if (value == null) return fallback;
    final str = value.toString().trim();
    return str.isEmpty ? fallback : str;
  }

  String _dateText(Object? value) {
    if (value is Timestamp) {
      final date = value.toDate();
      return '${date.day.toString().padLeft(2, '0')}/'
          '${date.month.toString().padLeft(2, '0')}/${date.year}';
    }

    return _text(value);
  }
}

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:meditrace/features/medicine/domain/entities/medicine.dart';

class MedicineRepository {
  MedicineRepository({FirebaseFirestore? firestore})
    : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  Future<Medicine?> fetchByMedicineId(String medicineId) async {
    final snapshot = await _firestore
        .collection('medicines')
        .where('medicineId', isEqualTo: medicineId)
        .limit(1)
        .get();

    if (snapshot.docs.isEmpty) {
      return null;
    }

    final data = snapshot.docs.first.data();
    return Medicine(
      medicineId: _text(data['medicineId']),
      medicineName: _text(data['medicineName']),
      manufacturer: _text(data['manufacturer']),
      batchNumber: _text(data['batchNumber']),
      manufacturingDate: _dateText(data['manufacturingDate']),
      expiryDate: _dateText(data['expiryDate']),
      dosage: _text(data['dosage']),
      status: _text(data['status']),
      description: _text(data['description']),
    );
  }

  String _text(Object? value) => value?.toString() ?? 'Not available';

  String _dateText(Object? value) {
    if (value is Timestamp) {
      final date = value.toDate();
      return '${date.day.toString().padLeft(2, '0')}/'
          '${date.month.toString().padLeft(2, '0')}/${date.year}';
    }

    return _text(value);
  }
}

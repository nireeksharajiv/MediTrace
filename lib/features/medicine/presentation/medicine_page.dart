import 'package:flutter/material.dart';
import 'package:meditrace/features/medicine/domain/entities/medicine.dart';

class MedicinePage extends StatelessWidget {
  const MedicinePage({super.key, required this.medicine});

  final Medicine medicine;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Medicine Details')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            medicine.medicineName,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 24),
          _MedicineDetail(label: 'Manufacturer', value: medicine.manufacturer),
          _MedicineDetail(label: 'Batch Number', value: medicine.batchNumber),
          _MedicineDetail(
            label: 'Manufacturing Date',
            value: medicine.manufacturingDate,
          ),
          _MedicineDetail(label: 'Expiry Date', value: medicine.expiryDate),
          _MedicineDetail(label: 'Dosage', value: medicine.dosage),
          _MedicineDetail(label: 'Status', value: medicine.status),
          _MedicineDetail(label: 'Description', value: medicine.description),
        ],
      ),
    );
  }
}

class _MedicineDetail extends StatelessWidget {
  const _MedicineDetail({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 4),
          Text(value, style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }
}

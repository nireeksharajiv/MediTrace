import 'package:flutter/material.dart';
import 'package:meditrace/features/medicine/data/medicine_repository.dart';
import 'package:meditrace/features/medicine/presentation/medicine_page.dart';
import 'package:meditrace/features/scanner/presentation/scanner_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final MedicineRepository _medicineRepository = MedicineRepository();

  Future<void> _fetchMedicine(String medicineId) async {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator()),
    );

    try {
      final medicine = await _medicineRepository.fetchByMedicineId(medicineId);

      if (!mounted) {
        return;
      }

      Navigator.of(context, rootNavigator: true).pop();

      if (medicine == null) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Medicine not found')));
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => MedicinePage(medicine: medicine)),
      );
    } catch (_) {
      if (!mounted) {
        return;
      }

      Navigator.of(context, rootNavigator: true).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Unable to fetch medicine details')),
      );
    }
  }

  Future<void> _searchMedicine() => _fetchMedicine('MED001');

  Future<void> _scanMedicine() async {
    final medicineId = await Navigator.of(context).push<String>(
      MaterialPageRoute<String>(builder: (_) => const ScannerPage()),
    );

    if (!mounted || medicineId == null) {
      return;
    }

    await _fetchMedicine(medicineId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('MediTrace')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FilledButton.icon(
                onPressed: _scanMedicine,
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scan QR Code'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(56),
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _searchMedicine,
                icon: const Icon(Icons.search),
                label: const Text('Search Medicine'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(56),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

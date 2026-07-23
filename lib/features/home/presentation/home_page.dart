import 'package:flutter/material.dart';
import 'package:meditrace/features/medicine/data/medicine_repository.dart';
import 'package:meditrace/features/medicine/presentation/medicine_page.dart';
import 'package:meditrace/features/medicine/domain/entities/verification_result.dart';
import 'package:meditrace/features/medicine/presentation/offline_medicine_page.dart';
import 'package:meditrace/features/scanner/presentation/scanner_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final MedicineRepository _medicineRepository = MedicineRepository();

  Future<void> _fetchMedicine(String gtin) async {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: CircularProgressIndicator(),
      ),
    );

    try {
      final medicine = await _medicineRepository.getMedicineByGtin(
        gtin,
      );

      if (!mounted) return;

      Navigator.of(context, rootNavigator: true).pop();

      if (medicine == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Medicine not found'),
          ),
        );
        return;
      }

      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => MedicinePage(medicine: medicine),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      Navigator.of(context, rootNavigator: true).pop();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Unable to fetch medicine details'),
        ),
      );
    }
  }

  Future<void> _searchMedicine() async {
    final TextEditingController controller = TextEditingController();

    final gtin = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Search Medicine'),
          content: TextField(
            controller: controller,
            decoration: const InputDecoration(
              hintText: 'Enter GTIN',
              border: OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () {
                Navigator.pop(
                  context,
                  controller.text.trim(),
                );
              },
              child: const Text('Search'),
            ),
          ],
        );
      },
    );

    if (gtin == null || gtin.isEmpty) {
      return;
    }

    await _fetchMedicine(gtin);
  }

  Future<void> _scanMedicine() async {
    // Scanner returns the complete Data Matrix payload, not only its first line.
    final scannedPayload = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => const ScannerPage(),
      ),
    );

    if (!mounted || scannedPayload == null) {
      return;
    }

    try {
      final payload = ScannedMedicinePayload.parse(scannedPayload);
      if (!mounted) return;

      // Open the offline-first page before it attempts a Firestore request.
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => OfflineMedicinePage(payload: payload),
        ),
      );
    } on FormatException catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('MediTrace'),
      ),
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
                label: const Text('Scan QR / Data Matrix'),
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

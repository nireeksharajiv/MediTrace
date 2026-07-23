import 'dart:async';

import 'package:flutter/material.dart';
import 'package:meditrace/core/services/connectivity_service.dart';
import 'package:meditrace/features/medicine/data/medicine_repository.dart';
import 'package:meditrace/features/medicine/domain/entities/medicine.dart';
import 'package:meditrace/features/medicine/domain/entities/verification_result.dart';

/// Shows barcode data immediately, then enriches it from Firestore online.
/// Barcode manufacturing and expiry dates are deliberately never replaced.
class OfflineMedicinePage extends StatefulWidget {
  const OfflineMedicinePage({
    super.key,
    required this.payload,
    MedicineRepository? medicineRepository,
    ConnectivityService? connectivityService,
  }) : _medicineRepository = medicineRepository,
       _connectivityService = connectivityService;

  final ScannedMedicinePayload payload;
  final MedicineRepository? _medicineRepository;
  final ConnectivityService? _connectivityService;

  @override
  State<OfflineMedicinePage> createState() => _OfflineMedicinePageState();
}

class _OfflineMedicinePageState extends State<OfflineMedicinePage> {
  late final MedicineRepository _medicineRepository;
  late final ConnectivityService _connectivityService;
  StreamSubscription<bool>? _connectivitySubscription;
  Medicine? _medicine;
  bool _isOnline = false;
  bool _isLookingUp = false;

  @override
  void initState() {
    super.initState();
    _medicineRepository = widget._medicineRepository ?? MedicineRepository();
    _connectivityService = widget._connectivityService ?? ConnectivityService();

    // Delay connectivity work until after the first frame so barcode values
    // are visible before any Firestore lookup can start.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _connectivitySubscription = _connectivityService.onOnlineStatusChanged
          .listen(_handleConnectivityChange);
      _checkInitialConnectivity();
    });
  }

  Future<void> _checkInitialConnectivity() async {
    final isOnline = await _connectivityService.isOnline;
    await _handleConnectivityChange(isOnline);
  }

  Future<void> _handleConnectivityChange(bool isOnline) async {
    if (!mounted) return;
    setState(() => _isOnline = isOnline);

    // A restored connection automatically retries the same GTIN lookup.
    if (isOnline) {
      await _loadOnlineMedicine();
    }
  }

  Future<void> _loadOnlineMedicine() async {
    if (_isLookingUp || _medicine != null) return;

    setState(() => _isLookingUp = true);
    try {
      // Only the parsed GTIN is used as the Firestore document ID.
      final medicine = await _medicineRepository.getMedicineByGtin(
        widget.payload.gtin,
      );
      if (mounted && medicine != null) {
        setState(() => _medicine = medicine);
      }
    } catch (_) {
      // Barcode data stays visible if an online request fails.
    } finally {
      if (mounted) {
        setState(() => _isLookingUp = false);
      }
    }
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final medicine = _medicine;
    final unavailable = _isOnline
        ? 'Unavailable'
        : 'Unavailable (Offline)';
    final status = medicine?.status ?? 'Offline Verification';

    return Scaffold(
      appBar: AppBar(title: const Text('Medicine Verification')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          if (_isLookingUp) const LinearProgressIndicator(),
          if (_isLookingUp) const SizedBox(height: 16),
          _MedicineDetail(label: 'GTIN', value: widget.payload.gtin),
          _MedicineDetail(
            label: 'Medicine Name',
            value: medicine?.medicineName ?? unavailable,
          ),
          _MedicineDetail(
            label: 'Manufacturer',
            value: medicine?.manufacturer ?? unavailable,
          ),
          _MedicineDetail(
            label: 'Batch Number',
            value: medicine?.batchNumber ?? unavailable,
          ),
          // These values always come from the scanned Data Matrix.
          _MedicineDetail(
            label: 'Manufacturing Date',
            value: widget.payload.manufacturingDate,
          ),
          _MedicineDetail(label: 'Expiry Date', value: widget.payload.expiryDate),
          _MedicineDetail(label: 'Dosage', value: medicine?.dosage ?? unavailable),
          _MedicineDetail(label: 'Status', value: status),
          _MedicineDetail(
            label: 'Description',
            value: medicine?.description ?? unavailable,
          ),
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

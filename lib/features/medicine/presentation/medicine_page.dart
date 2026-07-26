import 'package:flutter/material.dart';
import 'package:meditrace/core/services/device_info_service.dart';
import 'package:meditrace/core/services/duplicate_serial_service.dart';
import 'package:meditrace/core/services/expiry_validation_service.dart';
import 'package:meditrace/core/services/scan_history_service.dart';
import 'package:meditrace/features/medicine/domain/entities/medicine.dart';
import 'package:meditrace/features/medicine/domain/entities/verification_state.dart';
import 'package:meditrace/features/medicine/presentation/widgets/verification_badge.dart';
import 'package:meditrace/features/medicine/presentation/widgets/verification_dialogs.dart';

class MedicinePage extends StatefulWidget {
  const MedicinePage({
    super.key,
    required this.medicine,
    this.duplicateSerialService,
    this.scanHistoryService,
  });

  final Medicine medicine;
  final DuplicateSerialDetectionService? duplicateSerialService;
  final ScanHistoryService? scanHistoryService;

  @override
  State<MedicinePage> createState() => _MedicinePageState();
}

class _MedicinePageState extends State<MedicinePage> {
  late final DuplicateSerialDetectionService _duplicateSerialService;
  late final ScanHistoryService _scanHistoryService;

  VerificationState _verificationState = VerificationState.verified;

  @override
  void initState() {
    super.initState();
    _duplicateSerialService =
        widget.duplicateSerialService ?? DuplicateSerialDetectionService();
    _scanHistoryService = widget.scanHistoryService ?? ScanHistoryService();

    final isExpired = ExpiryValidationService.isExpired(widget.medicine.expiryDate);
    _verificationState = isExpired ? VerificationState.expired : VerificationState.verified;

    debugPrint('''
Navigation Target: MedicinePage
↓

MedicineDetails Loaded: ${widget.medicine.medicineName} (GTIN: ${widget.medicine.gtin})
''');

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _performVerificationChecks(isExpired);
    });
  }

  Future<void> _performVerificationChecks(bool isExpired) async {
    final deviceId = DeviceInfoService.deviceId;
    final location = DeviceInfoService.currentLocation;

    if (isExpired) {
      VerificationDialogs.showExpiredDialog(
        context: context,
        expiryDate: widget.medicine.expiryDate,
      );
    } else {
      final isSuspicious = await _duplicateSerialService.checkIsSuspicious(
        serialNumber: widget.medicine.serialNumber,
        currentDeviceId: deviceId,
        currentLatitude: location['latitude'],
        currentLongitude: location['longitude'],
      );

      if (!mounted) return;

      if (isSuspicious) {
        setState(() => _verificationState = VerificationState.suspicious);
        VerificationDialogs.showSuspiciousDialog(context: context);
      }
    }

    await _scanHistoryService.logScan(
      serialNumber: widget.medicine.serialNumber,
      gtin: widget.medicine.gtin,
      verificationStatus: _verificationState == VerificationState.suspicious
          ? 'Suspicious'
          : (_verificationState == VerificationState.expired ? 'Expired' : 'Verified'),
      latitude: location['latitude'],
      longitude: location['longitude'],
      deviceId: deviceId,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Medicine Details'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(
              child: VerificationBadge(state: _verificationState),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            widget.medicine.medicineName,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 24),
          _MedicineDetail(label: 'Manufacturer', value: widget.medicine.manufacturer),
          _MedicineDetail(label: 'Batch Number', value: widget.medicine.batchNumber),
          _MedicineDetail(
            label: 'Manufacturing Date',
            value: widget.medicine.manufacturingDate,
          ),
          _MedicineDetail(label: 'Expiry Date', value: widget.medicine.expiryDate),
          _MedicineDetail(label: 'GTIN', value: widget.medicine.gtin),
          _MedicineDetail(label: 'Serial Number', value: widget.medicine.serialNumber),
          _MedicineDetail(label: 'Dosage', value: widget.medicine.dosage),
          _MedicineDetail(label: 'Status', value: widget.medicine.status),
          _MedicineDetail(label: 'Description', value: widget.medicine.description),
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

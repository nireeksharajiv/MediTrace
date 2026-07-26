import 'dart:async';

import 'package:flutter/material.dart';
import 'package:meditrace/core/services/connectivity_service.dart';
import 'package:meditrace/core/services/device_info_service.dart';
import 'package:meditrace/core/services/duplicate_serial_service.dart';
import 'package:meditrace/core/services/expiry_validation_service.dart';
import 'package:meditrace/core/services/scan_history_service.dart';
import 'package:meditrace/core/services/scan_pipeline_logger.dart';
import 'package:meditrace/features/medicine/data/medicine_repository.dart';
import 'package:meditrace/features/medicine/domain/entities/medicine.dart';
import 'package:meditrace/features/medicine/domain/entities/verification_result.dart';
import 'package:meditrace/features/medicine/domain/entities/verification_state.dart';
import 'package:meditrace/features/medicine/presentation/widgets/verification_badge.dart';
import 'package:meditrace/features/medicine/presentation/widgets/verification_dialogs.dart';

/// Shows decoded GS1 barcode payload immediately, then enriches it from Firestore online.
class OfflineMedicinePage extends StatefulWidget {
  const OfflineMedicinePage({
    super.key,
    required this.payload,
    this.medicineRepository,
    this.connectivityService,
    this.duplicateSerialService,
    this.scanHistoryService,
  });

  final ScannedMedicinePayload payload;
  final MedicineRepository? medicineRepository;
  final ConnectivityService? connectivityService;
  final DuplicateSerialDetectionService? duplicateSerialService;
  final ScanHistoryService? scanHistoryService;

  @override
  State<OfflineMedicinePage> createState() => _OfflineMedicinePageState();
}

class _OfflineMedicinePageState extends State<OfflineMedicinePage> {
  late final MedicineRepository _medicineRepository;
  late final ConnectivityService _connectivityService;
  late final DuplicateSerialDetectionService _duplicateSerialService;
  late final ScanHistoryService _scanHistoryService;

  StreamSubscription<bool>? _connectivitySubscription;
  Medicine? _medicine;
  bool _isOnline = false;
  bool _isLookingUp = false;
  bool _hasPromptedDialog = false;

  late VerificationState _verificationState;

  @override
  void initState() {
    super.initState();
    _medicineRepository = widget.medicineRepository ?? MedicineRepository();
    _connectivityService = widget.connectivityService ?? ConnectivityService();
    _duplicateSerialService =
        widget.duplicateSerialService ?? DuplicateSerialDetectionService();
    _scanHistoryService = widget.scanHistoryService ?? ScanHistoryService();

    // Perform immediate offline expiry validation
    final isExpired = ExpiryValidationService.isExpired(widget.payload.expiryDate);
    _verificationState = isExpired ? VerificationState.expired : VerificationState.verified;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      if (isExpired && !_hasPromptedDialog) {
        _hasPromptedDialog = true;
        VerificationDialogs.showExpiredDialog(
          context: context,
          expiryDate: widget.payload.expiryDate,
        );
      }

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

    if (isOnline) {
      await _loadOnlineMedicine();
    } else {
      // Print offline scan debug log without contacting Firestore
      ScanPipelineLogger.printLog(
        rawBarcode: widget.payload.rawBarcode,
        barcodeFormat: widget.payload.barcodeFormat,
        decodedText: widget.payload.rawBarcode,
        parsedGtin: widget.payload.gtin,
        parsedExpiry: widget.payload.expiryDate,
        parsedSerial: widget.payload.serialNumber,
        internetAvailable: false,
        firestoreDocRequested: 'None (Offline)',
        documentExists: 'N/A',
        repositoryResult: 'Skipped (Offline)',
      );
    }
  }

  Future<void> _loadOnlineMedicine() async {
    if (_isLookingUp || _medicine != null) return;

    setState(() => _isLookingUp = true);
    try {
      final medicine = await _medicineRepository.getMedicineByGtin(
        widget.payload.gtin,
      );

      final docExists = medicine != null;
      final repoResult = docExists ? 'success' : 'failure';

      ScanPipelineLogger.printLog(
        rawBarcode: widget.payload.rawBarcode,
        barcodeFormat: widget.payload.barcodeFormat,
        decodedText: widget.payload.rawBarcode,
        parsedGtin: widget.payload.gtin,
        parsedExpiry: widget.payload.expiryDate,
        parsedSerial: widget.payload.serialNumber,
        internetAvailable: true,
        firestoreDocRequested: 'medicines/${widget.payload.gtin}',
        documentExists: docExists.toString(),
        repositoryResult: repoResult,
      );

      if (!mounted) return;

      if (medicine != null) {
        debugPrint('''
Navigation Target: OfflineMedicinePage
↓

MedicineDetails Loaded: ${medicine.medicineName} (GTIN: ${medicine.gtin})
''');

        setState(() => _medicine = medicine);

        final serialToVerify =
            widget.payload.serialNumber != 'N/A' && widget.payload.serialNumber.isNotEmpty
                ? widget.payload.serialNumber
                : medicine.serialNumber;

        final deviceId = DeviceInfoService.deviceId;
        final location = DeviceInfoService.currentLocation;

        final isSuspicious = await _duplicateSerialService.checkIsSuspicious(
          serialNumber: serialToVerify,
          currentDeviceId: deviceId,
          currentLatitude: location['latitude'],
          currentLongitude: location['longitude'],
        );

        if (!mounted) return;

        final isExpired = ExpiryValidationService.isExpired(widget.payload.expiryDate);

        if (isSuspicious) {
          setState(() => _verificationState = VerificationState.suspicious);
          if (!_hasPromptedDialog) {
            _hasPromptedDialog = true;
            VerificationDialogs.showSuspiciousDialog(context: context);
          }
        } else if (isExpired) {
          setState(() => _verificationState = VerificationState.expired);
        } else {
          setState(() => _verificationState = VerificationState.verified);
        }

        // Log successful online verification scan to scan_history collection
        await _scanHistoryService.logScan(
          serialNumber: serialToVerify,
          gtin: widget.payload.gtin,
          verificationStatus: _verificationState == VerificationState.suspicious
              ? 'Suspicious'
              : (_verificationState == VerificationState.expired ? 'Expired' : 'Verified'),
          latitude: location['latitude'],
          longitude: location['longitude'],
          deviceId: deviceId,
        );
      }
    } catch (e) {
      ScanPipelineLogger.printLog(
        rawBarcode: widget.payload.rawBarcode,
        barcodeFormat: widget.payload.barcodeFormat,
        decodedText: widget.payload.rawBarcode,
        parsedGtin: widget.payload.gtin,
        parsedExpiry: widget.payload.expiryDate,
        parsedSerial: widget.payload.serialNumber,
        internetAvailable: true,
        firestoreDocRequested: 'medicines/${widget.payload.gtin}',
        documentExists: 'false',
        repositoryResult: 'failure ($e)',
      );
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
    final unavailable = _isOnline ? 'Unavailable' : 'Unavailable (Offline)';

    final effectiveSerial = (medicine?.serialNumber != null &&
            medicine!.serialNumber != 'N/A' &&
            medicine.serialNumber.isNotEmpty)
        ? medicine.serialNumber
        : (widget.payload.serialNumber.isNotEmpty
            ? widget.payload.serialNumber
            : 'N/A');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Medicine Verification'),
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
          if (_isLookingUp) const LinearProgressIndicator(),
          if (_isLookingUp) const SizedBox(height: 16),

          _MedicineDetail(label: 'GTIN', value: widget.payload.gtin),
          _MedicineDetail(label: 'Expiry Date', value: widget.payload.expiryDate),
          _MedicineDetail(label: 'Serial Number', value: effectiveSerial),
          // Manufacturing Date is intentionally removed from Offline Verification screen.

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
          _MedicineDetail(
            label: 'Dosage',
            value: medicine?.dosage ?? unavailable,
          ),
          _MedicineDetail(
            label: 'Status',
            value: medicine?.status ??
                (_verificationState == VerificationState.expired
                    ? 'Expired'
                    : (_verificationState == VerificationState.suspicious
                        ? 'Suspicious'
                        : 'Offline Verification')),
          ),
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

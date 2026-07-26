import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class ScannedBarcodeResult {
  final String rawBarcode;
  final String formatName;

  const ScannedBarcodeResult({
    required this.rawBarcode,
    required this.formatName,
  });
}

class ScannerPage extends StatefulWidget {
  const ScannerPage({super.key});

  @override
  State<ScannerPage> createState() => _ScannerPageState();
}

class _ScannerPageState extends State<ScannerPage> {
  final MobileScannerController _controller = MobileScannerController();
  bool _hasScanned = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _handleDetection(BarcodeCapture capture) async {
    if (_hasScanned || capture.barcodes.isEmpty) {
      return;
    }

    final barcode = capture.barcodes.first;
    final scannedPayload = barcode.rawValue?.trim();
    if (scannedPayload == null || scannedPayload.isEmpty) {
      return;
    }

    final formatName = barcode.format.name.isNotEmpty
        ? barcode.format.name
        : 'DataMatrix';

    _hasScanned = true;
    await _controller.stop();

    if (mounted) {
      Navigator.of(context).pop(
        ScannedBarcodeResult(
          rawBarcode: scannedPayload,
          formatName: formatName,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan QR / Data Matrix')),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(controller: _controller, onDetect: _handleDetection),
          Center(
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                border: Border.all(
                  color: Theme.of(context).colorScheme.primary,
                  width: 3,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          const Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Text(
                'Position the medicine Data Matrix or QR code inside the frame.',
                style: TextStyle(color: Colors.white),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

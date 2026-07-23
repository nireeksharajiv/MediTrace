import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

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

    // Keep the complete Data Matrix text so HomePage can parse its GTIN/dates.
    final scannedPayload = capture.barcodes.first.rawValue?.trim();
    if (scannedPayload == null || scannedPayload.isEmpty) {
      return;
    }

    _hasScanned = true;
    await _controller.stop();

    if (mounted) {
      Navigator.of(context).pop(scannedPayload);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan QR Code')),
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
                'Position the medicine QR code inside the frame.',
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

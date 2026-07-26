import 'package:flutter/material.dart';

abstract final class VerificationDialogs {
  /// Shows a blocking Material 3 warning dialog when a medicine has expired.
  static Future<void> showExpiredDialog({
    required BuildContext context,
    required String expiryDate,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          icon: const Icon(
            Icons.warning_amber_rounded,
            color: Colors.orange,
            size: 48,
          ),
          title: const Text(
            '⚠ Medicine Expired',
            textAlign: TextAlign.center,
          ),
          content: Text(
            'This medicine has expired.\n\n'
            'Expiry Date:\n$expiryDate\n\n'
            'Do not consume this medicine.',
            textAlign: TextAlign.start,
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
  }

  /// Shows a blocking Material 3 warning dialog when a duplicate serial is detected.
  static Future<void> showSuspiciousDialog({
    required BuildContext context,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          icon: const Icon(
            Icons.warning_rounded,
            color: Colors.red,
            size: 48,
          ),
          title: const Text(
            '⚠ Suspicious Medicine',
            textAlign: TextAlign.center,
          ),
          content: const Text(
            'This serial number has already been detected from another location.\n\n'
            'This may indicate a cloned or counterfeit medicine.\n\n'
            'Please verify with the pharmacist or manufacturer before consumption.',
            textAlign: TextAlign.start,
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
  }
}

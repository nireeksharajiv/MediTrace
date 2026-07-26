import 'package:flutter/material.dart';
import 'package:meditrace/features/medicine/domain/entities/verification_state.dart';

class VerificationBadge extends StatelessWidget {
  const VerificationBadge({super.key, required this.state});

  final VerificationState state;

  @override
  Widget build(BuildContext context) {
    late final Color color;
    late final String label;
    late final IconData icon;

    switch (state) {
      case VerificationState.verified:
        color = Colors.green;
        label = 'Verified';
        icon = Icons.check_circle_outline;
        break;
      case VerificationState.expired:
        color = Colors.orange;
        label = 'Expired';
        icon = Icons.warning_amber_rounded;
        break;
      case VerificationState.suspicious:
        color = Colors.red;
        label = 'Suspicious';
        icon = Icons.report_problem_outlined;
        break;
      case VerificationState.notFound:
        color = Colors.grey;
        label = 'Medicine Not Found';
        icon = Icons.help_outline;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withAlpha(30),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color, width: 1.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

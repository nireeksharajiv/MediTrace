abstract final class ExpiryValidationService {
  /// Checks whether [expiryDateStr] is earlier than today's date ([referenceDate]).
  static bool isExpired(String expiryDateStr, [DateTime? referenceDate]) {
    final expiryDateTime = parseDate(expiryDateStr);
    if (expiryDateTime == null) {
      return false;
    }

    final today = referenceDate ?? DateTime.now();

    // Reset today to midnight for clear date-only comparison
    final todayMidnight = DateTime(today.year, today.month, today.day);

    // Reset expiry date to end of day (23:59:59) so medicine is valid throughout its expiry day
    final expiryEndOfDay = DateTime(
      expiryDateTime.year,
      expiryDateTime.month,
      expiryDateTime.day,
      23,
      59,
      59,
    );

    return todayMidnight.isAfter(expiryEndOfDay);
  }

  /// Parses date string in YYYY-MM-DD, DD/MM/YYYY, or other standard formats.
  static DateTime? parseDate(String dateStr) {
    final clean = dateStr.trim();
    if (clean.isEmpty || clean.contains('Unavailable') || clean == 'N/A') {
      return null;
    }

    // Try ISO / YYYY-MM-DD
    try {
      final parsed = DateTime.parse(clean);
      return parsed;
    } catch (_) {}

    // Try DD/MM/YYYY
    if (clean.contains('/')) {
      final parts = clean.split('/');
      if (parts.length == 3) {
        try {
          final day = int.parse(parts[0]);
          final month = int.parse(parts[1]);
          final year = int.parse(parts[2]);
          return DateTime(year, month, day);
        } catch (_) {}
      }
    }

    // Try DD-MM-YYYY
    if (clean.contains('-')) {
      final parts = clean.split('-');
      if (parts.length == 3 && parts[0].length <= 2) {
        try {
          final day = int.parse(parts[0]);
          final month = int.parse(parts[1]);
          final year = int.parse(parts[2]);
          return DateTime(year, month, day);
        } catch (_) {}
      }
    }

    return null;
  }
}

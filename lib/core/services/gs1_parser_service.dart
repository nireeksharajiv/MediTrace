abstract final class Gs1ParserService {
  /// Decodes GS1 Data Matrix AI (01) GTIN, AI (17) Expiry Date, and AI (21) Serial Number.
  /// Throws FormatException('Unable to decode GS1 Data Matrix.') if decoding fails.
  static Map<String, String> parsePayload(String rawPayload) {
    final normalized = rawPayload
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .trim();

    if (normalized.isEmpty) {
      throw const FormatException('Unable to decode GS1 Data Matrix.');
    }

    String gtin = '';
    String expiryDate = '';
    String serialNumber = '';

    // 1. Check for bracketed GS1 AI format: (01)...(17)...(21)...
    if (normalized.contains('(01)') ||
        normalized.contains('(17)') ||
        normalized.contains('(21)')) {
      final gtinMatch = RegExp(r'\(01\)\s*(\d{13,14})').firstMatch(normalized);
      if (gtinMatch != null) {
        gtin = gtinMatch.group(1)!;
      }

      final expMatch = RegExp(r'\(17\)\s*(\d{6})').firstMatch(normalized);
      if (expMatch != null) {
        expiryDate = _formatYymmdd(expMatch.group(1)!);
      }

      final snMatch = RegExp(r'\(21\)\s*([^\(\s]+)').firstMatch(normalized);
      if (snMatch != null) {
        serialNumber = snMatch.group(1)!;
      }
    }

    // 2. Check for key-value / label format: GTIN=... EXP=... SN=...
    if (gtin.isEmpty) {
      final gtinMatch = RegExp(
        r'(?:GTIN|01)\s*[:=]\s*(\d{13,14})',
        caseSensitive: false,
      ).firstMatch(normalized);
      if (gtinMatch != null) {
        gtin = gtinMatch.group(1)!;
      }
    }

    if (expiryDate.isEmpty) {
      final expMatch = RegExp(
        r'(?:Expiry\s*Date|EXP|17)\s*[:=]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{6})',
        caseSensitive: false,
      ).firstMatch(normalized);
      if (expMatch != null) {
        final val = expMatch.group(1)!;
        expiryDate = val.length == 6 ? _formatYymmdd(val) : val;
      }
    }

    if (serialNumber.isEmpty) {
      final snMatch = RegExp(
        r'(?:Serial\s*(?:Number)?|SN|21)\s*[:=]\s*([A-Za-z0-9_-]+)',
        caseSensitive: false,
      ).firstMatch(normalized);
      if (snMatch != null) {
        serialNumber = snMatch.group(1)!;
      }
    }

    // 3. Fallback for raw unparenthesized GS1 string with FNC1 (\x1d or \u001d) or sequential fixed-length fields
    if (gtin.isEmpty || expiryDate.isEmpty || serialNumber.isEmpty) {
      final clean = normalized.replaceAll('\u001d', '\x1d');

      // GTIN fallback
      if (gtin.isEmpty) {
        if (clean.startsWith('01') && clean.length >= 16) {
          gtin = clean.substring(2, 16);
        } else {
          final standaloneGtin = RegExp(r'\b\d{13,14}\b').firstMatch(clean);
          if (standaloneGtin != null) {
            gtin = standaloneGtin.group(0)!;
          }
        }
      }

      // Expiry fallback
      if (expiryDate.isEmpty) {
        final expRegex = RegExp(r'17(\d{6})');
        final expMatch = expRegex.firstMatch(clean);
        if (expMatch != null) {
          expiryDate = _formatYymmdd(expMatch.group(1)!);
        } else {
          final dateRegex = RegExp(r'\b([0-9]{4}-[0-9]{2}-[0-9]{2})\b');
          final dateMatch = dateRegex.firstMatch(clean);
          if (dateMatch != null) {
            expiryDate = dateMatch.group(1)!;
          }
        }
      }

      // Serial Number fallback
      if (serialNumber.isEmpty) {
        final snRegex = RegExp(r'21([A-Za-z0-9_-]+)');
        final snMatch = snRegex.firstMatch(clean);
        if (snMatch != null) {
          var val = snMatch.group(1)!;
          if (val.contains('\x1d')) {
            val = val.split('\x1d').first;
          }
          serialNumber = val;
        }
      }
    }

    // Clean GTIN by stripping any lingering non-numeric characters
    final cleanGtin = gtin.replaceAll(RegExp(r'[^\d]'), '').trim();

    if (cleanGtin.isEmpty) {
      throw const FormatException('Unable to decode GS1 Data Matrix.');
    }

    final finalExpiry = expiryDate.isEmpty ? 'Unavailable' : expiryDate;
    final finalSerial = serialNumber.isEmpty ? 'N/A' : serialNumber;

    return {
      'gtin': cleanGtin,
      'expiryDate': finalExpiry,
      'serialNumber': finalSerial,
    };
  }

  /// Formats GS1 YYMMDD into YYYY-MM-DD
  static String _formatYymmdd(String yymmdd) {
    if (yymmdd.length != 6) return yymmdd;
    try {
      final yy = int.parse(yymmdd.substring(0, 2));
      final mm = int.parse(yymmdd.substring(2, 4));
      var dd = int.parse(yymmdd.substring(4, 6));

      final year = yy >= 50 ? 1900 + yy : 2000 + yy;

      if (dd == 0) {
        final lastDay = DateTime(year, mm + 1, 0).day;
        dd = lastDay;
      }

      final mmStr = mm.toString().padLeft(2, '0');
      final ddStr = dd.toString().padLeft(2, '0');
      return '$year-$mmStr-$ddStr';
    } catch (_) {
      return yymmdd;
    }
  }
}

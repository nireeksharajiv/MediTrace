import 'dart:async';
import 'dart:io';

/// Checks whether the Firestore host can be reached and polls for recovery.
///
/// This verifies Internet reachability rather than only a Wi-Fi/mobile signal.
class ConnectivityService {
  ConnectivityService({
    this.pollInterval = const Duration(seconds: 15),
    this.timeout = const Duration(seconds: 5),
  });

  final Duration pollInterval;
  final Duration timeout;

  Future<bool> get isOnline => _canReachFirestore();

  Stream<bool> get onOnlineStatusChanged {
    return Stream<bool>.periodic(pollInterval, (_) => true)
        .asyncMap((_) => _canReachFirestore())
        .distinct();
  }

  Future<bool> _canReachFirestore() async {
    try {
      final socket = await Socket.connect(
        'firestore.googleapis.com',
        443,
        timeout: timeout,
      );
      socket.destroy();
      return true;
    } on SocketException {
      return false;
    } on TimeoutException {
      return false;
    }
  }
}

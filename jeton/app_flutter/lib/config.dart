/// Build-time configuration (use `--dart-define=NAME=value`).
///
/// * `API_BASE_URL` : e.g. `https://api.jeton.example/v1`. When empty, the in-memory
///   fake API (lib/api/fake_api.dart) is used so the app runs without a backend.
/// * `NFC`          : `mock` | `native` | empty (auto: mock with the fake API, native with a real
///                    API; native = nfc_manager on Android, Web NFC in the browser).
/// * `TAG_TARGET`   : number of tags to enrol in bulk mode (counter N/TAG_TARGET).
/// * `PUBLIC_HOST`  : host printed in tag URLs by the fake API.
const String apiBaseUrl = String.fromEnvironment('API_BASE_URL');
const String nfcMode = String.fromEnvironment('NFC');
const int tagTarget = int.fromEnvironment('TAG_TARGET', defaultValue: 1000);
const String publicHost =
    String.fromEnvironment('PUBLIC_HOST', defaultValue: 'jeton.example');
const String appVersion = '1.0.0';

bool get useFakeApi => apiBaseUrl.isEmpty;

bool get useMockNfc => nfcMode == 'mock' || (nfcMode.isEmpty && useFakeApi);

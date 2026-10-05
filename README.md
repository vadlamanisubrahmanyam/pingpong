# Ping Pong (Android)
Black background, all-white game. Drag to move your paddle; first to 7 wins. Easy / Normal / Hard.

## Build
1. Create a GitHub repo, copy these files to its root (keep `app/` and `.github/`), push to `main`.
2. Actions tab -> "Build APK" -> download the `PingPong-apk` artifact -> unzip.
3. Install: `adb install -r PingPong.apk` (or copy to the phone and open it).

Package: com.subrahmanyam.pingpong | Expo SDK 53 | RN 0.79.6 | react-native-webview 13.13.5
Signing: committed self-signed keystore (app/keystore), so updates install over older builds.

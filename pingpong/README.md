# Ping Pong (Android)
Black background, all-white game. Developed by Subrahmanyam.

- Main menu: START GAME, SETUP, EXIT
- Levels: Easy / Normal / Hard; control by touch drag or device tilt
- Setup (admin): score to win, ball speed per level, paddle size per level
- Docs: `docs/PingPong_Design_Document.docx`, `docs/pingpong_wireframes.html`

## Build
1. Create a GitHub repo, copy these files to its root (keep `app/` and `.github/`), push to `main`.
2. Actions tab -> "Build APK" -> download the `PingPong-apk` artifact -> unzip.
3. Install: `adb install -r PingPong.apk`.

Package: com.subrahmanyam.pingpong | Expo SDK 53 | RN 0.79.6 | react-native-webview 13.13.5
Signing: committed self-signed keystore (app/keystore), so updates install over older builds.

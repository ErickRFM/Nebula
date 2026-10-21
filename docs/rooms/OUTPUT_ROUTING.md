# F12.10 — Optional browser audio output routing

When a browser exposes both `HTMLMediaElement.setSinkId` and `navigator.mediaDevices.enumerateDevices`, NÉBULA Rooms shows a selector for permitted audio output devices. Selection applies to the room's own HTMLAudioElement, including after its source URL is renewed. The UI handles permission/device failures and does not request microphone access.

**Important limitations**
- `setSinkId` is not universally supported on Android/iOS; output device discovery may show only a default device.
- This feature does **not** pair Bluetooth hardware, enable A2DP, broadcast one phone's audio, or guarantee background/screen-lock playback.
- Device identifiers and labels remain in the browser, never sent to the API or stored in PostgreSQL.
- Calibration profiles remain independent and manual. Selecting an output does not imply measured acoustic synchronization.
- Real two-phone and Bluetooth speaker validation is still required.

## Optional browser Remote Playback / Cast-compatible routes

When HTMLMediaElement exposes a `remote.prompt()` API on a supported browser and a room receiver has explicitly enabled its local output, NÉBULA shows **Transmitir a un receptor compatible**. This is the standards-based browser Remote Playback interface with a user gesture, **not** a native Google Cast SDK integration or automatic Chromecast discovery. The selected receiver must be able to fetch and decode the short-lived authorized R2 URL; failures are shown as a recoverable message, not reported as success. Browser/iOS availability is platform-dependent and not physically verified. Further Cast sender/receiver integration and calibration remain outstanding.

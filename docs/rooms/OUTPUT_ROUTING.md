# F12.10 — Optional browser audio output routing

When a browser exposes both `HTMLMediaElement.setSinkId` and `navigator.mediaDevices.enumerateDevices`, NÉBULA Rooms shows a selector for permitted audio output devices. Selection applies to the room's own HTMLAudioElement, including after its source URL is renewed. The UI handles permission/device failures and does not request microphone access.

**Important limitations**
- `setSinkId` is not universally supported on Android/iOS; output device discovery may show only a default device.
- This feature does **not** pair Bluetooth hardware, enable A2DP, broadcast one phone's audio, or guarantee background/screen-lock playback.
- Device identifiers and labels remain in the browser, never sent to the API or stored in PostgreSQL.
- Calibration profiles remain independent and manual. Selecting an output does not imply measured acoustic synchronization.
- Real two-phone and Bluetooth speaker validation is still required.

# F12.7 — Party Sound clock diagnostics and output profiles

## Delivered
- A separate authenticated four-timestamp `/v1/rooms/clock` probe every 15 seconds while a room is selected.
- A rolling window of 12 samples with low-RTT median filtering; the UI shows network RTT, sample count and estimated clock offset.
- Two independent **local browser** profiles: device/default output and Bluetooth output, each with estimated output latency (0–1000 ms) and manual fine calibration (-1000..1000 ms).
- Profile validation, bounds and migration from the previous single-slider localStorage value; unit tests.
- Logical drift indication from HTMLAudioElement, explicitly **not** an acoustic measurement.

## Operational limits
- Room state still polls every three seconds. This is **not** realtime transport, phase alignment or certified multi-speaker Party Sound.
- Choosing a Bluetooth profile does not pair or route the audio; use operating-system Bluetooth settings.
- The profile is browser/device-local, not synced across accounts or devices. Bluetooth output delay varies by codec and hardware.
- Background/screen-locked audio and acoustic offsets remain unverified until physical tests.
- A dedicated authenticated realtime gateway and real two-phone/Bluetooth QA remain required for F12 release.

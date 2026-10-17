# F12 — Physical Party Sound QA protocol

**Status:** NOT EXECUTED. Automated CI does not substitute for physical acoustic testing.

## Prerequisites
- Two Android phones with current Chrome; optional third phone and one Bluetooth A2DP speaker.
- Two authorized NÉBULA accounts (OWNER and invited MEMBER).
- A small MP3 owned by the host **with explicit permission to share**.
- File uploaded to the host's private Cloudflare R2 library and marked ready.
- Prefer a stable shared Wi-Fi network for the first baseline; repeat on separate networks.
- Set device volume conservatively to avoid hearing damage, feedback or clipping.

## Baseline test
1. On phone A create a Party Sound room, select a ready R2 track, confirm sharing rights, schedule playback.
2. On phone B sign in, join using the invite code, open the room and tap Play locally.
3. Record OS/browser versions, network type, track ID, number of devices and whether autoplay was blocked.
4. Compare the audible transient from both speakers. Adjust the manual compensation slider and record the value.
5. Pause/resume from A, change tracks using the queue and verify B follows without stale audio.
6. Refresh B, switch to another app and return, toggle Wi-Fi, then repeat after 5 minutes to test URL renewal.
7. Pair the Bluetooth speaker with B through Android settings, select it as B's output, recalibrate and repeat.
8. Attempt access to the audio endpoint with an unauthenticated browser and an account outside the room; expect rejection.
9. Disable sharing or close the room; verify no **new** signed URL can be issued. Previously issued links can remain valid for up to 300 seconds.

## Record evidence
| Field | Result |
|---|---|
| Device A / OS / browser | pending |
| Device B / OS / browser | pending |
| Bluetooth speaker model / codec | pending |
| Network / measured RTT | pending |
| Compensation A / B | pending |
| Audible echo / distortion | pending |
| Estimated acoustic offset (measured) | pending |
| Pause / resume / next | pending |
| Background / screen locked | pending |
| 5-minute URL renewal | pending |
| Unauthenticated / unauthorized access | pending |

## Limits
- Current browser transport polls room state approximately every 3 seconds. It is not a hard realtime protocol.
- Output latency differs by Bluetooth codec and OS. Two phones sounding together can increase echo or cancellation instead of clean volume.
- Web Audio timing does not guarantee acoustic phase alignment. Precise verification requires recording simultaneous transients and measuring delay.
- Screen-lock and background playback are platform-specific and are not certified.
- Never claim synchronized acoustic output, amplified volume or supported Bluetooth routing until real measurements are attached.

## F12.7–F12.11 follow-up matrix (still NOT executed)

1. Invite phone B through the `#room=` private link. Confirm Salas opens and the code is prefilled; join only after login and explicit confirmation.
2. Check clock RTT and offset estimates on A and B. They are **network/logic estimates**, not microphone/acoustic measurements.
3. Compare device and Bluetooth calibration profiles. Set estimated output latency and fine adjustment separately, reload, and verify persistence on each phone.
4. If a browser supports `setSinkId`, select an enumerated output and verify audio routing. Otherwise use Android/iOS OS Bluetooth settings; do not mark unsupported browsers as failed.
5. As host, reorder two queued tracks; verify the guest sees the new order and the next track follows it.
6. Transfer host to B, verify A loses host privileges, and test that B can expel A. Verify no new audio URLs for expelled participants; previously signed URLs may survive for up to 300 seconds.
7. Measure acoustic offset with an external reference recording or suitable audio analysis; do not infer it from `HTMLAudioElement.currentTime`.
8. Record foreground, background and locked-screen behavior independently for each browser/OS.

**Blocking:** production PostgreSQL health must be 200 and an authorized MP3 must be available in R2 before these tests can be completed.

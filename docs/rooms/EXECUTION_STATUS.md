# NÉBULA — F12 Rooms execution status

Updated 2026-10-16. Verify GitHub and deployment SHAs before trusting this document.

## Implemented in repository
- F12.1 pure room clock estimation, drift correction, timeline and tests (#28).
- F12.2 private rooms, authenticated membership, invitation rotation and browser UI (#29).
- F12.3 opt-in R2 room audio sharing with rights confirmation, short-lived signed URLs (#30).
- F12.4 browser-based room audio, host track selection, pause/resume and manual calibration (#31).
- F12.5 private durable queue, host-only controls and CAS next-track scheduling (#32).
- F12.6 URL renewal, foreground reconciliation, mobile navigation, E2E and physical QA protocol (#33).
- Private OWNER invitation UI and atomic redemption in PR #34 (pending merge at time of writing).

## Deployment / database
- Migrations 0005, 0006, 0007 are additive and were applied to the dedicated NÉBULA Supabase project.
- RLS is enabled; direct anon/authenticated table privileges are revoked.
- Health checks now include Rooms tables.

## Not yet validated or implemented
- Real multi-phone acoustic timing measurements, Bluetooth speaker latency and screen-lock playback.
- Dedicated realtime gateway: current transport is polling; do not claim sub-100ms sync.
- DJ guest permissions, voting, cross-provider playback, speaker output selection beyond OS routing.
- Registration email verification, password reset, Resend delivery and full member administration.
- Real R2 MP3 E2E: no ready cloud tracks were present when checked.

## Release rule
Do not label Party Sound physically verified until QA evidence exists for two phones and Bluetooth speaker. CI validates logic and browser flows, not acoustic output.

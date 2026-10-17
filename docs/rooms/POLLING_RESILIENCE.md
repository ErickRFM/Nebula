# Room polling and shared-IP rate limits

A Playwright mobile trace exposed real HTTP 429 responses during room creation and closure on CI. The previous 120 requests/minute global shared-IP limit was too low for multiple devices on the same Wi-Fi, plus concurrent browser E2E flows.

- Global shared-IP limit is now 900/minute. Login, register, invitation, room mutations and provider searches retain stricter per-route limits.
- Room snapshots poll every 3 seconds while visible; queue every 5 seconds; membership every 10 seconds; clock every 15 seconds.
- Hidden tabs stop periodic requests and reconcile on foreground.
- Transient 429/503/network errors retain the selected room and last confirmed queue; only explicit 403/404 membership loss clears it.
- This is a practical polling fallback, **not** low-latency realtime. A dedicated gateway remains required for acoustic Party Sound release.

## Regression
CI must pass Playwright mobile-chromium with concurrent OWNER onboarding and two-account room lifecycle. Do not suppress, skip or weaken these tests.

# F12.6 — Browser resilience and URL renewal

- Room audio GET URLs are valid for 300 seconds. The browser requests a fresh signed URL after 240 seconds and attempts to preserve playback position and active state.
- If URL renewal fails, the prior URL is kept until the user retries or it expires.
- Room state is refreshed when a backgrounded tab becomes visible again.
- Audio playback remains opt-in through native browser controls.
- This does **not** guarantee audio continuity under screen lock, background suspension or all Bluetooth routes. Hardware testing and a realtime transport are still required.

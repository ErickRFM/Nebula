# F12.9 — Private room invitation deep links

- A host can copy a room code or use **Compartir enlace privado** (native mobile share sheet when available, clipboard fallback).
- The link uses `#room=<192-bit-code>` rather than a query parameter, so the token is not sent in HTTP requests or referrers.
- Opening the link navigates to Salas and prefills the join code. Participants must authenticate and explicitly tap Unirme.
- After successful join, the URL fragment is removed using history.replaceState.
- Invite codes are bearer secrets: anyone with a valid code and an NÉBULA account may join until the host rotates the code, closes the room, or the code expires. Never publish them publicly.
- QR generation and native universal/app links are separate follow-up features; this change adds no external QR dependency.

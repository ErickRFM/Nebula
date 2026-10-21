# Party Sound — device registry and receiver consent (PS-03)

The room device endpoints register **participating NÉBULA clients**, not arbitrary devices on a Wi-Fi network.

- `POST /v1/rooms/:id/devices` with `{deviceId,label,platform}`: upsert this member's receiver; initially disabled.
- `GET /v1/rooms/:id/devices`: authenticated room roster; `online` is true if a heartbeat was received within 45 seconds.
- `PATCH /v1/rooms/:id/devices/:deviceId/output` with `{outputEnabled:boolean}`: only the receiver owner can toggle it.
- `POST /v1/rooms/:id/devices/:deviceId/heartbeat` with `{playbackState}`: authenticated presence update.
- `DELETE /v1/rooms/:id/devices/:deviceId`: disconnect one's own receiver.

A device has a browser-generated random UUID scoped to an account. Room membership grants visibility, **not permission to activate someone else's audio**. The server caps active records to four per account per room; leaving or being expelled cascades deletion. Raw local network addresses, Bluetooth identifiers, media URLs, and user agents are never stored in this table.

## Deployment prerequisites

Run `npm run db:migrate` with the project's authorized database connection before releasing the new endpoints. Migration `0008_room_devices.sql` is additive; there is no new database. CI integration tests use `NEBULA_TEST_DATABASE_URL`.

## Non-goals of this change

No local mDNS/NSD discovery, native Bluetooth pairing, audio broadcast, native background playback, or acoustic synchronization is claimed. Browser audio remains subject to local user gesture and the current room polling transport. Next steps are authenticated Realtime and measured multi-device QA.

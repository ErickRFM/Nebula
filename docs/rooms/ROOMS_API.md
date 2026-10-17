# Rooms API — F12.2 (private lifecycle, not synchronized audio yet)

Authentication: Bearer access token; session validated on every request. All room reads require membership.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /v1/rooms | My active rooms |
| POST | /v1/rooms | Create room; invite code shown once |
| POST | /v1/rooms/join | Join using 192-bit random invite |
| GET | /v1/rooms/:id | Membership-checked snapshot + server time |
| POST | /v1/rooms/:id/invite | Host rotates invitation |
| POST | /v1/rooms/:id/timeline | Host CAS timeline update; requires own ready cloud track |
| POST | /v1/rooms/:id/leave | Listener leaves |
| POST | /v1/rooms/:id/close | Host closes |
| GET | /v1/rooms/clock | Four-timestamp clock probe server fields |

All room codes are stored as SHA-256 digests; never log or store raw codes after creation. Invites expire after seven days. Joining is limited to 16 user accounts per room. Room membership does **not** grant access to the owner's private cloud audio.

## Deployment
Migration `0005_rooms.sql` must be applied before deploying API code that uses the room tables. It is additive, RLS enabled, and revokes direct Supabase anon/authenticated table access.

## Not yet done
No persistent realtime gateway, player integration, shared media authorization, device-specific timing or Bluetooth output control. Room snapshots are persisted but **Party Sound is not yet functional**. The web UI must not claim otherwise.

## F12.8 — Participant moderation and host transfer

| Method | Endpoint | Permission |
|---|---|---|
| GET | /v1/rooms/:id/members | Active participant; only host sees participant emails |
| DELETE | /v1/rooms/:id/members/:memberId | Host; cannot kick self |
| POST | /v1/rooms/:id/transfer-host | Host; target must be active listener |

Host transfer locks the room and updates membership roles and `owner_user_id` atomically, incrementing the room revision. Old host loses privileged actions immediately. Kicking a listener removes their ability to request new signed R2 URLs; previously issued URLs may remain usable for up to 300 seconds. This is not instant revocation of audio already downloaded.

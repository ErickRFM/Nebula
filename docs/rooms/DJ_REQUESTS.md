# Party Sound DJ suggestions (PS-10)

Room members can submit a title + artist suggestion, cast one idempotent vote per request, and view the sorted room request list. A host or original submitter may remove a suggestion. API endpoints require active room membership and have size/rate/cap guards.

- GET /v1/rooms/:id/requests
- POST /v1/rooms/:id/requests (title, artist)
- POST /v1/rooms/:id/requests/:requestId/vote
- DELETE /v1/rooms/:id/requests/:requestId

**Not an audio source:** Suggestions are text metadata only. No participant gets any access to another participant's music file, external source or signed URL. The host must explicitly select an authorized cloud track using the existing queue controls.

Migration: `0012_room_requests.sql`; permission revocation + RLS on both tables. Vote privacy is scoped to authenticated membership.
Future enhancements: named DJ role, moderator review, integration with authorized cloud catalog and guest vote cancellation.

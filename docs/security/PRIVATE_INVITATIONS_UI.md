# Private invitation onboarding

- OWNER can create email-bound invitations in the Account screen, using the existing authenticated admin API.
- The raw token is displayed only once. The server stores only its hash; the token expires after seven days.
- Recipients open Account → "Tengo un código de invitación", enter their invited email and choose a new password.
- Public registration remains closed. No email provider is required for manually shared codes.
- Invite redemption now uses a transactional conditional claim so concurrent requests cannot reuse one invitation.
- **Not included:** automatic email delivery, verification email, password reset, member suspension, or full admin console. Do not advertise those as completed.

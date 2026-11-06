# Code is incorrect (STUB: to be written with the user, 2026-11-04)

Use when the ticket says the code the BO received is incorrect or does not work (the BO DID get a code; it is rejected). Not the
"cannot get the code" topic (`code-not-received.md`), and not a loop or kick-back to login (`login-loop.md`).

## What we already know
- Fullstory records what the BO typed in the code field (the digits are not masked; seen on one session as `change input#...OtpInputFieldN`
  events). Verify clicks and 400 responses from the auth service show the attempts. Never repeat the digits in chat or in Slack.
- The code that was sent is in the SMS message (not available: no Twilio connection, decided 2026-11-04) or the SendGrid email (email code).
- Phase 2 flow in `PLAN.md` ("SMS code incorrect" ticket) already sketches the steps: created time, Fullstory session near it, the code
  typed, the code sent (phone from Control Tower), then compare: matched, mismatched, older or newer code used, expired, or no session.

## To write with the user
- How the ticket usually words it, and which cases it excludes (same exclusions as `code-not-received.md`: loop, kick-back to login, error or
  "oops" page, Android app, SSN/IDVQ).
- Order of checks, what to report, and the fixes the team uses.
- Whether the comparison is done by Claude or only reported to the user (the digits are customer data: chat only).

# Login loop or auth error

Examples: PS1682198 (code works, lands in the to-do list, any click returns to login); PS1683203 (Android app and web
refresh back to the email screen; later "something went wrong").

## Data to get
| Data | Where | Skill |
|---|---|---|
| Sessions near the created time, last page, devices | Fullstory | `sn-ticket-fullstory-session-lookup` |
| Errors in the session (error check) | Fullstory `review-summary` | same ("Error check on the session") |
| Enrollment state, username vs email, co-borrower reminders, phones, MFA rows | Control Tower | `sn-ticket-controltower-bo-lookup` |
| Number of offerings and opportunities on the profile | Control Tower opportunities; Profile API related offerings | `sn-ticket-profile-api-lookup` |
| User agent (only when asked) | Fullstory | same ("User agent") |

## What to report
- Sessions list, then the errors seen with time and what the BO was doing: failed token refresh (`invalid_grant`), 400s
  from the auth service (`auth-p…/davinci/...`), `Ping Flow Error`, `suspicious-activity` (fraud flag), ending on
  `/error?e=auth` or a repeating `/login` / `/welcome-back`.
- Whether the BO reached a signed-in page (checklist, documents) in any session (a desktop session may work while mobile fails).
- Enrollment state and the username-vs-email flag; count of offerings (PS1682198 had 20).
- If Fullstory finds no session, say so (the BO may not be identified); next option is the questionnaire GUID (not written yet).

## Fixes the team has used (need the user's yes, each time)
- PS1682198 work notes: create a new contact card and obliterate the old enrollment (new enrollment then good to go); and
  try removing unnecessary offerings from the BO's profile (20 offerings). Obliterate Account is irreversible; it needs
  its own explicit approval every time.
- PS1683203: no resolution seen yet; report the errors and ask the user.

# App or screen problem

Example: PS1683026 (insurance to-do asks for car info but has no fields to enter it; BO cannot continue; same on app and desktop).

## Data to get
| Data | Where | Skill |
|---|---|---|
| The BO's session near the created time, last page, devices | Fullstory | `sn-ticket-fullstory-session-lookup` |
| Errors in that session | Fullstory | same ("Error check on the session") |
| App crash / error logs | Embrace | idea only, not built |

## What to report
- Sessions and the pages involved; errors seen with times. No account data unless asked.
- Whether the problem reproduces for others (the opener may say so in the detail).

## Fixes the team has used
- None known yet. PS1683026 had a teammate asking the channel for advice and the form has a "Convert to Incident" option;
  report what was found and ask the user. Do not click Convert to Incident or change the ticket.

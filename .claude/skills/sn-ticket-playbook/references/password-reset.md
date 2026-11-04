# Password reset

## Data to get
| Data | Where | Skill |
|---|---|---|
| Username, enrollment, last login, phones | Control Tower | `sn-ticket-controltower-bo-lookup` |
| Reset / sign-in / MFA events for the BO | PingOne | not built |
| Reset email delivery | SendGrid | `sn-ticket-sendgrid-email-lookup` |

## What to report
- Username vs email, enrollment state, last login; whether the reset email was sent and delivered; PingOne events (not built: say so).

## Fixes the team has used
- None recorded yet. Ask the user.

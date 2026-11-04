# Codes not received or not working (SMS, email, voice)

Example: PS1675124 (BO not getting the text code; opener had reset 2FA, confirmed the phone, set texting to "Allow").

## Data to get
| Data | Where | Skill |
|---|---|---|
| Phones on file (home, mobile), enrollment, username vs email | Control Tower | `sn-ticket-controltower-bo-lookup` (`--show phones,mfa`) |
| MFA log rows: time, type, delivery status, description, which phone | Control Tower | same |
| Email send / delivery / bounce for the BO email | SendGrid | `sn-ticket-sendgrid-email-lookup` |
| SMS / voice delivery, failure reason, message body | Twilio | not built yet |
| What the BO did around the created time (typed the code? errors?) | Fullstory | `sn-ticket-fullstory-session-lookup` |

## Order and what to report
1. Control Tower MFA logs first; they may answer it. Report rows near the created time, which phone each went to, and the
   status text ("SMS Failed", "Voice Busy" = call placed, not answered; "Email Queued" = accepted, not delivered).
   If the MFA section is empty, say "no MFA log rows" (not "MFA failed").
2. Email code: SendGrid for the BO email. SMS code: Twilio (not built: say so).
3. Check the phones: leads can carry a different number than the contact; the ticket may be about the wrong number.
4. Fullstory session near the created time and its error check. "Code incorrect": the typed digits are captured in the
   session; compare with the code sent (Twilio message body, not built). Don't repeat the digits.

## Fixes the team has used (need the user's yes, each time)
- Reset 2FA (Control Tower "Reset All Phone & Biometrics Factors"); confirm the correct phone number; set texting to
  "Allow" with the BO's permission (seen in PS1675124's opener notes).
- "Grant MFA Bypass (15 min)" exists in Control Tower; mention it, don't click it.
- Carrier blocks or "not delivered" with successful sends: escalate (needs Twilio logs).

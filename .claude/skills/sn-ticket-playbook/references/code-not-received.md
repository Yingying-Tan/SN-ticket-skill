# Codes not received or not working (SMS, email, voice)

## How to recognize it (user, 2026-11-04)
The ticket normally says the BO is **having a login issue** and **cannot get the code**, and may end with a request. Match on those
words in the ticket detail. Here the BO is stuck at the code step because the code never arrives.
**"The code is incorrect" is NOT this topic** (user, 2026-11-04): it gets its own topic, `code-incorrect.md` (see that file).

**Do NOT use this topic (user, 2026-11-04) when the ticket is about:**
- a **loop**, or being **kicked back to the login page** at or after the 2FA step (BO gets the code, then lands on login again);
- an **error message in the app**, or an **"oops" page**;
- the **Android app** (any code or login problem on the Android app is out of this topic);
- **SSN or IDVQ** (identity verification questions) **not showing, or not offered as an option** to verify the BO (for example "we
  attempted to verify with SSN but that was not an option", as in PS1683203). Where these go is open (see below).
Those go to the login loop topic (`login-loop.md`) or, for the Android app, wherever the user decides (open: see below). If a ticket
has both (cannot get the code AND one of the above), the exclusion wins: don't run this topic.

Example: PS1675124 (BO not getting the text code; opener had reset 2FA, confirmed the phone, set texting to "Allow").

## Data to get
| Data | Where | Skill |
|---|---|---|
| Phones on file (home, mobile), enrollment, username vs email | Control Tower | `sn-ticket-controltower-bo-lookup` (`--show phones,mfa`) |
| MFA log rows: time, type, delivery status, description, which phone | Control Tower | same |
| Email send / delivery / bounce for the BO email | SendGrid | `sn-ticket-sendgrid-email-lookup` |
| SMS / voice delivery and the **failure reason** | Control Tower **MFA log first** (it already returns the failure reason, user 2026-11-04); **no Twilio connection** (decided not needed) | `sn-ticket-controltower-bo-lookup` (`--show mfa`) |
| What the BO did around the created time (typed the code? errors?) | Fullstory | `sn-ticket-fullstory-session-lookup` |

## Order and what to report
1. **Control Tower first (user, 2026-11-04):** `controltower-bo-lookup.cjs <BO email> --show phones,mfa`. **Ensure the MFA log shows
   everything as SUCCESS.** Report the rows near the created time, which phone each went to, and the status text ("SMS Failed",
   "Voice Busy" = call placed, not answered; "Email Queued" = accepted, not delivered). Say how many rows are SUCCESS and how
   many are not.
   - **If there is no MFA log (empty section, no section, or the script says it could not expand it): bubble it up.** Stop, tell the
     user plainly "no MFA log rows for this contact", and ask how to continue. Don't call it "MFA failed", and don't carry on to the
     other lookups on your own. (Seen on PS1675124: the MFA Logs section opened empty.)
   - **Phone number (user, 2026-11-04):** get **both the home and the mobile phone** from the same lookup and report both. **Pick one
     to carry forward** (for any later check): if home and mobile differ, use the **mobile (cell)**; if there is only one
     phone, use it whatever its type; if both are the same number, use that number. Say which one was picked and why.
   - If rows are not all SUCCESS, report the failed ones (time, phone, status description) and continue to step 2 if the user wants.
2. Email code: SendGrid for the BO email. SMS / voice code: the failure reason comes from the Control Tower MFA log (step 1), which already returns it (user, 2026-11-04); check there first and report it. Do not connect to Twilio.
3. Check the phones: use the picked number from step 1 (mobile if the two differ, else the only one). Leads can carry a different number than the contact; the ticket may be about the wrong number.
4. Fullstory session near the created time and its error check.

## Fixes the team has used (need the user's yes, each time)
- Reset 2FA (Control Tower "Reset All Phone & Biometrics Factors"); confirm the correct phone number; set texting to
  "Allow" with the BO's permission (seen in PS1675124's opener notes).
- "Grant MFA Bypass (15 min)" exists in Control Tower; mention it, don't click it.
- Carrier blocks or "not delivered" with successful sends: read the failure reason in the Control Tower MFA log first; if the log gives none, report what it shows and ask the user.

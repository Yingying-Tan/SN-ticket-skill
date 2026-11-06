# ServiceNow ticket support lookups

Scripts and notes used when working a ServiceNow (SN) ticket. Each lookup has a matching
Claude Code skill in `.claude/skills/` named `sn-ticket-<lookup>` so Claude picks it up
from a plain request like "look up the email log for X".

See `PLAN.md` for the full plan, build order and open questions.

| Lookup | Skill | Script | Status |
|---|---|---|---|
| BO info (Control Tower) | `sn-ticket-controltower-bo-lookup` | `controltower-bo-lookup.cjs <email\|username\|phone>` | Done. Verified end to end 2026-10-30: phones, profile, MFA logs, opportunities, reminders (username differs from email; co-borrower same as borrower), enrollment check from the result card (not enrolled when brand, username and PassportAccountId are all missing: Details are skipped, `--details` forces them; verified on a not-enrolled test contact) |
| Read a PS ticket (ServiceNow) | `sn-ticket-read` | `sn-ticket-read.cjs "<ticket URL>"` | Done. Verified 2026-11-02 on PS1678808: BO name, BO email, loan number, ticket detail, comments/work notes. Opens the exact ticket link; "read the latest ticket from Slack" gets the link from the newest ServiceNow Prod message in #cs_support. After every read it adds the reaction `:claude_look:` to the ticket's Slack message in #cs_support, whether or not the detail is posted anywhere (2026-11-06). Read only in ServiceNow. Updated 2026-11-04: prints `Created:` (earliest activity entry); headless by default (`--show-browser` to sign in by hand); skips the CRM phone, preferred contact time and entity lines and button-text "notes"; "read xxx and post it" also posts the info as one thread reply under the ticket's message in #cs_support, plain "read xxx" only returns it in chat |
| Email log (SendGrid) | `sn-ticket-sendgrid-email-lookup` | `sendgrid-email-lookup.cjs <email>` | Done. Verified end to end 2026-10-30 on Activity > Email Logs: table, failure JSON for bounced/failed emails, option `--days` (3, 7 or 30; default 3), `--max N` |
| SMS / voicemail log (Twilio) | `sn-ticket-twilio-sms-lookup` | - | Dropped 2026-11-04: no Twilio connection; the SMS failure reason is read from the Control Tower MFA log |
| Opportunity and lead (CRM) | `sn-ticket-crm-opportunity-lookup` | - | Not created yet |
| Profile API data (offerings, enrollment) | `sn-ticket-profile-api-lookup` | Profile ID, offering ID or Contact GUID | Built 2026-11-03 (Postman collection exported, Okta PKCE token via Playwright). 2026-11-04: added `--lead <leadGuid>[,...]` (enrollment by lead GUID, `--profile-by-lead` also GETs the profile); tested on a test account. GET only |
| Session (Fullstory) | `sn-ticket-fullstory-session-lookup` | none (uses the claude.ai Fullstory MCP connector; sign in via `/mcp`) | Done. Verified 2026-10-30: 30-day sessions by email, 15 sessions found for a test email. Option (2026-11-04, only when asked): the session's user agent via `review-summary`; the IP is not available from the connector. Web app fallback (2026-11-06): `fullstory-search.cjs <email\|guid> [days 7\|30\|90]` searches the Fullstory web app by email, then by text; a GUID (contact or questionnaire) runs the text search only. Each search leaves an unnamed ad hoc search in Fullstory. First tried on PS1687219: no match for the email or the contact GUID in 7 days |
| Log by email (PingOne) | `sn-ticket-pingone-log-lookup` | - | Not created yet |
| Log from Embrace (app monitoring; idea, 2026-11-04) | `sn-ticket-embrace-log-lookup` | - | Not created yet; name and access method to confirm |
| VU+ loan search (2026-11-04) | `sn-ticket-vuplus-open` (option) | `vuplus-loan-search.cjs <loan number>` | Built 2026-11-04: headless, clears filter chips, searches the loan number only, prints the result list |
| Playbook: what to check and fix per ticket topic (draft, 2026-11-04) | `sn-ticket-playbook` | - (reference files in `.claude/skills/sn-ticket-playbook/references/`) | Draft. Router plus 7 topic files (codes split into `code-not-received` and `code-incorrect`); `sn-ticket-read` points to it after each read. Step 2 (2026-11-06, POC, may be dropped): after a read, an auth or access ticket is posted automatically to #yy-test, then the playbook is followed; a non-auth ticket stops there |
| Wrap-up comment in Slack | `sn-ticket-slack-comment` | - | Writes the Category / Problem / Solution / Next Time comment and posts it as a thread reply under the ticket's message in #cs_support, when asked |
| CRM sign-in test | - | `crm-open.cjs` | Opens Dynamics 365 CRM so the user can sign in by hand and save the session; reads nothing. The CRM opportunity lookup is not built yet |
| Email in Outlook mailbox | `sn-ticket-outlook-email-lookup` | - | Not created yet; access method undecided (Playwright vs Microsoft 365 connector) |

## What the skills do, in a normal ticket
Example requests are in quotes; Claude picks the skill from the wording.

1. **Find and read** (`sn-ticket-read`): "read the latest ticket" or "read PS1687219". Takes the link from the newest
   ServiceNow Prod message in #cs_support (or the PS number), opens the ticket headless, and returns the ticket number,
   created time, BO name, BO email, loan number, detail and comments / work notes. Then it adds the `:claude_look:`
   reaction to that ticket's message in #cs_support. Every read gets the reaction. "read xxx and post it" also posts the info as a thread reply there.
2. **Forward to #yy-test (POC, 2026-11-06):** decide from the ticket detail whether it is an auth or access issue
   (cannot enroll, no enrollment link, no loan in the account, cannot log in, login loop, 2FA kick back or no code,
   code incorrect, VU+ error, mobile app error). If yes, the read detail is posted to #yy-test with the ticket number
   and link, automatically, and the work continues with step 3. If no (for example a to-do list item removal), stop
   here: no post, no playbook, no lookups. The `:claude_look:` reaction is added either way.
3. **Pick the topic** (`sn-ticket-playbook`, auth tickets only): matches the ticket detail to a topic (codes not
   received, code incorrect, login loop, enrollment, loan and offerings, app issue, password reset) and lists which
   lookups to run and what fixes the team used before. It only offers fixes, never does them.
4. **Look up the BO and the evidence** (read only):
   - `sn-ticket-controltower-bo-lookup`: "look up the BO in Control Tower". Enrollment, username, profile ID, contact
     GUID, created / updated times, last logins, phones, MFA log and opportunities, plus flags (username differs from
     email, co-borrower shares the email).
   - `sn-ticket-sendgrid-email-lookup`: "check the email log". Delivery status of emails sent to the BO.
   - `sn-ticket-profile-api-lookup`: offerings and enrollment by profile ID, contact GUID or lead GUID.
   - `sn-ticket-fullstory-session-lookup`: "find the Fullstory session for this email". Sessions by email, then text,
     then GUID.
   - `sn-ticket-vuplus-open` (with `vuplus-loan-search.cjs`): opens VU+ or searches a loan number.
5. **Wrap up** (`sn-ticket-slack-comment`): "comment the ticket". Writes the Category / Problem / Solution / Next Time
   summary and posts it under the ticket's message in #cs_support.

Anything that changes data (Control Tower buttons, ServiceNow, CRM, Slack posts other than the standing ones above)
needs the user's explicit yes each time.

## Terms used in tickets
BO = Borrower, CO = Co-Borrower (CBO means the same), LO = Loan Officer.

## Shared rules
- Playwright only. Claude in Chrome is not allowed at this org.
- The Playwright MCP browser does not launch on this machine; scripts here use the project's
  own `node_modules/playwright`. Control Tower and `sn-ticket-read` run headless (`--show-browser` to watch or
  to sign in by hand); the others open a visible Chromium.
- Access goes through https://vu.okta.com. The user completes any Okta/Microsoft sign-in or MFA
  by hand in the window; credentials are never typed by Claude.
- Lookups are read-only.
- Browser profiles (`.sendgrid-profile`, etc.) hold sign-in sessions. Do not share or commit them.

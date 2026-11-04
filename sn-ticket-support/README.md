# ServiceNow ticket support lookups

Scripts and notes used when working a ServiceNow (SN) ticket. Each lookup has a matching
Claude Code skill in `.claude/skills/` named `sn-ticket-<lookup>` so Claude picks it up
from a plain request like "look up the email log for X".

See `PLAN.md` for the full plan, build order and open questions.

| Lookup | Skill | Script | Status |
|---|---|---|---|
| BO info (Control Tower) | `sn-ticket-controltower-bo-lookup` | `controltower-bo-lookup.cjs <email\|username\|phone>` | Done. Verified end to end 2026-10-30: phones, profile, MFA logs, opportunities, reminders (username differs from email; co-borrower same as borrower), enrollment check from the result card (not enrolled when brand, username and PassportAccountId are all missing: Details are skipped, `--details` forces them; verified on a not-enrolled test contact) |
| Read a PS ticket (ServiceNow) | `sn-ticket-read` | `sn-ticket-read.cjs "<ticket URL>"` | Done. Verified 2026-11-02 on PS1678808: BO name, BO email, loan number, ticket detail, comments/work notes. Opens the exact ticket link; "read the latest ticket from Slack" gets the link from the newest ServiceNow Prod message in #cs_support. After a successful read it adds the reaction `:claude_look:` to the ticket's Slack message. Read only in ServiceNow. Updated 2026-11-04: prints `Created:` (earliest activity entry); headless by default (`--show-browser` to sign in by hand); skips the CRM phone, preferred contact time and entity lines and button-text "notes"; "read xxx and post it" also posts the info as one thread reply under the ticket's message in #cs_support, plain "read xxx" only returns it in chat |
| Email log (SendGrid) | `sn-ticket-sendgrid-email-lookup` | `sendgrid-email-lookup.cjs <email>` | Done. Verified end to end 2026-10-30 on Activity > Email Logs: table, failure JSON for bounced/failed emails, option `--days` (3, 7 or 30; default 3), `--max N` |
| SMS / voicemail log (Twilio) | `sn-ticket-twilio-sms-lookup` | - | Not created yet |
| Opportunity and lead (CRM) | `sn-ticket-crm-opportunity-lookup` | - | Not created yet |
| Profile API data (offerings, enrollment) | `sn-ticket-profile-api-lookup` | Profile ID, offering ID or Contact GUID | Built 2026-11-03 (Postman collection exported, Okta PKCE token via Playwright). 2026-11-04: added `--lead <leadGuid>[,...]` (enrollment by lead GUID, `--profile-by-lead` also GETs the profile); tested on a test account. GET only |
| Session (Fullstory) | `sn-ticket-fullstory-session-lookup` | none (uses the claude.ai Fullstory MCP connector; sign in via `/mcp`) | Done. Verified 2026-10-30: 30-day sessions by email, 15 sessions found for a test email. Option (2026-11-04, only when asked): the session's user agent via `review-summary`; the IP is not available from the connector |
| Log by email (PingOne) | `sn-ticket-pingone-log-lookup` | - | Not created yet |
| Log from Embrace (app monitoring; idea, 2026-11-04) | `sn-ticket-embrace-log-lookup` | - | Not created yet; name and access method to confirm |
| VU+ loan search (2026-11-04) | `sn-ticket-vuplus-open` (option) | `vuplus-loan-search.cjs <loan number>` | Built 2026-11-04: headless, clears filter chips, searches the loan number only, prints the result list |
| Playbook: what to check and fix per ticket topic (draft, 2026-11-04) | `sn-ticket-playbook` | - (reference files in `.claude/skills/sn-ticket-playbook/references/`) | Draft. Router plus 6 topic files; `sn-ticket-read` points to it after each read |
| Email in Outlook mailbox | `sn-ticket-outlook-email-lookup` | - | Not created yet; access method undecided (Playwright vs Microsoft 365 connector) |

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

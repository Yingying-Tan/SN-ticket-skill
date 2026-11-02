# ServiceNow ticket support lookups

Scripts and notes used when working a ServiceNow (SN) ticket. Each lookup has a matching
Claude Code skill in `.claude/skills/` named `sn-ticket-<lookup>` so Claude picks it up
from a plain request like "look up the email log for X".

See `PLAN.md` for the full plan, build order and open questions.

| Lookup | Skill | Script | Status |
|---|---|---|---|
| BO info (Control Tower) | `sn-ticket-controltower-bo-lookup` | `controltower-bo-lookup.cjs <email\|username\|phone>` | Done. Verified end to end 2026-10-30: phones, profile, MFA logs, opportunities, reminders (username differs from email; co-borrower same as borrower), enrollment check from the result card (not enrolled when brand, username and PassportAccountId are all missing: Details are skipped, `--details` forces them; verified on a not-enrolled test contact) |
| Read a PS ticket (ServiceNow) | `sn-ticket-read` | `sn-ticket-read.cjs "<ticket URL>"` | Done. Verified 2026-11-02 on PS1678808: BO name, BO email, loan number, ticket detail, comments/work notes. Opens the exact ticket link; "read the latest ticket from Slack" gets the link from the newest ServiceNow Prod message in #cs_support. After a successful read it adds the reaction `:claude_look:` to the ticket's Slack message (its only write). Read only in ServiceNow |
| Email log (SendGrid) | `sn-ticket-sendgrid-email-lookup` | `sendgrid-email-lookup.cjs <email>` | Done. Verified end to end 2026-10-30 on Activity > Email Logs: table, failure JSON for bounced/failed emails, option `--days` (3, 7 or 30; default 3), `--max N` |
| SMS / voicemail log (Twilio) | `sn-ticket-twilio-sms-lookup` | - | Not created yet |
| Opportunity and lead (CRM) | `sn-ticket-crm-opportunity-lookup` | - | Not created yet |
| Offering data (Offering Route) | `sn-ticket-offering-route-lookup` | - | Not created yet; access method unknown |
| Session (Fullstory) | `sn-ticket-fullstory-session-lookup` | none (uses the claude.ai Fullstory MCP connector; sign in via `/mcp`) | Done. Verified 2026-10-30: 30-day sessions by email, 15 sessions found for a test email |
| Log by email (PingOne) | `sn-ticket-pingone-log-lookup` | - | Not created yet |
| Email in Outlook mailbox | `sn-ticket-outlook-email-lookup` | - | Not created yet; access method undecided (Playwright vs Microsoft 365 connector) |

## Terms used in tickets
BO = Borrower, CO = Co-Borrower, LO = Loan Officer.

## Shared rules
- Playwright only. Claude in Chrome is not allowed at this org.
- The Playwright MCP browser does not launch on this machine; scripts here use the project's
  own `node_modules/playwright` and open a visible Chromium.
- Access goes through https://vu.okta.com. The user completes any Okta/Microsoft sign-in or MFA
  by hand in the window; credentials are never typed by Claude.
- Lookups are read-only.
- Browser profiles (`.sendgrid-profile`, etc.) hold sign-in sessions. Do not share or commit them.

---
name: sn-ticket-sendgrid-email-lookup
description: ServiceNow ticket support. Look up the SendGrid email log (Activity > Email Logs) for a recipient email address and, for bounced/failed emails, capture the failure JSON. Use when the user says "lookup the email log", "search SendGrid for X", "check if the email was delivered", or gives an email address and asks about verification codes, delivery, bounces or sent emails. Drives Playwright through vu.okta.com into SendGrid.
---

# SendGrid email log lookup

> **Terms:** BO = Borrower, CO = Co-Borrower (CBO means the same), LO = Loan Officer. When the user says "the BO", "the CO" or "the LO", they mean these.


Goal: find what SendGrid sent to a recipient address (status, subject, time, response) and, for any
email that was not delivered, the failure JSON (reason, bounce classification, status code).

## Hard rules
- Use Playwright only. Claude in Chrome (`mcp__claude-in-chrome__*`) is NOT allowed at this org; never use it.
- The Playwright MCP browser (`mcp__playwright__*`) has failed to launch here (Chrome exits immediately). Don't loop on it; use the script below, which uses the project's own `node_modules/playwright`.
- Never type the user's password or approve MFA. If a Microsoft or Okta sign-in prompt appears, ask the user to complete it in the visible window, then continue.
- The search is read-only. Never click "Remove from suppression list" or anything else that changes data. The Email Logs page is shared account-wide, so look only at the address the user asked about.

## Fast path
From `C:\myWork\snTicket`:

```
node sn-ticket-support/sendgrid-email-lookup.cjs <recipient-email> [--days 3|7|30] [--max N]
```

- Default is Last 3 days. `--days 7` uses Last 7 days. `--days 30` applies no date filter (SendGrid keeps 30 days of usage data). Other values are rejected.
- `--max` caps rows read (default 10).
- Run it in the background. It opens a visible Chromium and waits up to 3 minutes for any manual sign-in, prints a table (Processed At UTC, Status, Subject, Response), opens every email that is not Delivered, and prints the JSON of each failure event. It closes its own browser at the end.
- Profile is persisted in `sn-ticket-support/.sendgrid-profile`, so sessions are reused; Okta usually signs in with no prompt.

## What the script automates (if it breaks, do these steps by hand)
1. `https://vu.okta.com` (signed-in dashboard is `/app/UserHome`) -> click the **SendGrid** tile -> lands on `https://app.sendgrid.com/`. A Microsoft My Apps sign-in may appear first; the user completes it.
2. Left menu **Activity > Email Logs** (`https://app.sendgrid.com/email_logs`). Not the legacy "Activity Feed".
3. **Date** filter chip: choose "Last 3 days" or "Last 7 days" (also offers Custom; apply if an Apply button shows).
4. Type the address in **Search** ("Recipient email address") and press Enter. Wait for the results count.
5. Table columns: Processed At, Message ID (link), Recipient Email, Subject Line, Status, Response.
6. For a Bounced / Dropped / Deferred row: click its Message ID (opens `/email_logs/<id>/details`). The event table has a **View details** link per event (Received, Processed, Delivered, Bounce...). Click it on the failure event; the side panel shows Status, Description and a **JSON** block. The event table loads a moment after the page, so wait for the "View details" links.

## Reporting back
Start with the script's `SUMMARY:` line. If nothing failed, say so plainly: "All N email(s) to <address> were delivered successfully in the last X days. No bounces." Do not open detail pages or add JSON in that case. If the search returns zero results, say no emails were found in that range (suggest `--days 7` or `30`), which is not the same as delivered. A status such as Processed or Deferred is not a bounce but is not delivered yet either; report it as such.

If something failed: give a table of the emails, then for each failure the JSON fields that matter: `event`, `bounce_classification`, `status` (SMTP code), `reason`, `timestamp`, plus the Message ID and details URL. Mention that the page also shows a banner when the address was added to the Bounced suppression list, because later emails to it will be blocked until it is removed (removing it is a change; do not do it yourself, tell the user).

Example (2026-10-30): bounce, `bounce_classification: "Invalid Address"`, `status: "5.2.1"`, `reason: "Unable to parse reason from bounce report"`. A 5.2.1 code generally means the mailbox is disabled or unavailable. Report the classification as SendGrid gave it and say any meaning beyond that is an interpretation.

## If the browser is left running
Close any window you launched with `--remote-debugging-port` when finished unless the user wants to keep going.

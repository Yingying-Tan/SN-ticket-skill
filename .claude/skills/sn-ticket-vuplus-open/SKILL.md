---
name: sn-ticket-vuplus-open
description: ServiceNow ticket support. Open VU+ (Productivity Afterburner, Pipeline Summary at vuplus.p.vu.local) in a visible browser, signed in through Okta, so the user can look at a loan or borrower there. Use when the user says "open VU+", "open vuplus", "show me this in VU+" or "open the pipeline summary". It only opens the page; it does not search or click.
---

# Open VU+

> **Terms:** BO = Borrower, CO = Co-Borrower (CBO means the same), LO = Loan Officer.

Goal: open VU+ for the user in a signed-in browser window. The user does the looking, searching and clicking.

## Hard rules
- Playwright only. Claude in Chrome (`mcp__claude-in-chrome__*`) is NOT allowed at this org; never use it.
- The script only opens the page. Do not click, type, search or change anything in VU+ unless the user asks for that specific action. VU+ holds loan data and actions that change loans; treat it as read-only.
- Never type the user's password or approve MFA. If an Okta prompt appears, ask the user to complete it in the visible window.
- Keep what you see (loan numbers, names) in the chat. Do not write it to files or memory.

## Fast path
From the project root:

```
node sn-ticket-support/vuplus-open.cjs
```

- Run it in the **background**: it opens a visible Chromium and stays open until the user closes the window.
- URL: `https://vuplus.p.vu.local/ProductivityAfterburner/pipelinesummary` (internal; needs the VU network or VPN).
- Okta single sign-on signs in on its own (no prompt on 2026-11-03). The profile is persisted in `sn-ticket-support/.vuplus-profile` (git-ignored; never commit or share it).
- The page opens with the **User** filter set to the signed-in user (the LO filter shows their own name) and shows "0 Results" until a loan is searched. Menu: My Tasks, Pipeline Summary, Price Estimate, Lock+, Rate Status, Loan Search.

Tell the user in one line that VU+ is open.

## Option: search a loan by number (user, 2026-11-04)
When the user (or the playbook, enrollment topic step 1 and step 10) wants a loan searched in VU+:

```
node sn-ticket-support/vuplus-loan-search.cjs <loan number> [--show-browser]
```

- Headless by default; `--show-browser` to watch or sign in by hand. About 20 seconds. Not for the "open VU+" request: that one still opens the window and leaves it to the user.
- It clears every filter chip (the User chip and the "Active" status chip), so **only the loan number filters the search**, types the loan number, clicks Search and prints the list: `Loan List: N Result(s) | Borrower | Lock Exp | Closing | <borrower>, ... | ...`.
- Read only: it never opens a loan or clicks a loan action. These filters are just the page's search form (nothing is saved).
- "Loan List: 0 Results" means VU+ found no loan with that number. For step 1 of the enrollment procedure the search working is enough (user: "as soon as you are able to search that loan, it is good"); the "Error(s) present on MyVU and/or CRM" message did **not** show in the result list on the test loan, and where it shows, if anywhere in the list, is not known yet.
- Report the loan number searched, the number of results and the borrower name shown. The borrower name is customer data: chat only.

## If it breaks
- The page does not load: the user is off the VU network or VPN (`vuplus.p.vu.local` is internal).
- An Okta prompt shows: ask the user to complete it in the window, then retry.
- Blank or redirect loop: close the window and run it again.

## Verified
2026-11-03: opened through Okta single sign-on, the Pipeline Summary loaded.
2026-11-04: `vuplus-loan-search.cjs` headless on a test loan: filters cleared (Active, the signed-in user), 1 result found.

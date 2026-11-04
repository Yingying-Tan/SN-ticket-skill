# Enrollment: "Error(s) present on MyVU and/or CRM with this loan"

## How to recognize it (user, 2026-11-04)
The ticket most likely mentions a **VU+ / "VU Plus" error**, and may quote this VU+ message: **"Error(s) present on MyVU and/or CRM
with this loan. Please submit a HelpDesk ticket to resolve."** It may also say cannot enroll, enrollment failed, not enrolled, or
duplicate/wrong contact card. Match on those words in the ticket detail. The cause the team has seen: the enrollment that belongs to
the BO has a **null contact GUID**, so MyVU and CRM don't line up for the loan.

## The procedure (from the user, 2026-11-04). Steps 1 to 7 are read only. Step 8 is the only write.
| # | Step | Tool | Status |
|---|---|---|---|
| 1 | In VU+, search by **loan number only** (null out every other field) and confirm the error message shows. **If the ticket has no loan number, get it from Control Tower first** (the BO's opportunities, `--show opps`; user, 2026-11-04) | VU+ | **built 2026-11-04:** `vuplus-loan-search.cjs <loan>` (see `sn-ticket-vuplus-open`): clears the filter chips, searches the loan number only, prints the result. **Step 1 is good as soon as the loan can be searched** (user, 2026-11-04). The result list shows only Borrower, Lock Exp and Closing; the error message did not show in the list on the test loan, so don't claim it was seen unless it prints |
| 2 | Get the **Contact GUID** and **Profile ID** | Control Tower (`--show profile`) | built |
| 3 | Search the enrollment by the Contact GUID; confirm **no enrollment is found**. **If an enrollment IS found: STOP here (user, 2026-11-04) and return the JSON response body as is in the chat, then wait.** Don't continue to step 4 and don't treat it as this case | Profile API `--contact <guid>` | built |
| 4 | Get the **offering ID(s)** from the Profile ID | Profile API related offerings (`<profileId>`) | built |
| 5 | Get the **lead GUID** from each offering | Profile API (the offerings list includes `leadGuid`) | built |
| 6 | Search the enrollment by each **lead GUID**; keep the one that is **enrolled**, whose **username matches the email**; confirm its **contact GUID is null** | Profile API `--lead <guid>[,<guid>...]` (GET `enrollments?leadGuid=`, public gateway) | **built and tested 2026-11-04** on a test account: 404 "Enrollment not found" for leads with no enrollment, 200 with the enrollment for the matching lead. Skip offerings whose `leadGuid` is null. Pass every non-null lead GUID in one call |
| 7 | Return that **enrollment GUID** | report | **works** (the 200 body has `enrollmentGuid`, `status`, `email`, `username`, `contactGuid`); report it from the matching hit |
| 8 | **Patch the contact GUID onto that enrollment.** DO NOT DO THIS until the user has reviewed and approved steps 1 to 7 for this BO and says to do it | Profile API PATCH (write): `PATCH enrollments/:enrollmentId`, body `leadFormUniqueIdentifier`, `leadGuid`, `contactGuid` (from the Postman collection) | **not built, never called.** The Profile API skill is GET only. A PATCH must be a separate, clearly named step the user approves for that one enrollment. Open: can the body carry only `contactGuid`, or would a partial body blank the other fields? Don't test that on a real account |
| 9 | Call the **get enrollment route** again and confirm the contact GUID is now populated | Profile API `--contact <guid>` | built |
| 10 | Hard refresh or revisit VU+, search the loan as in step 1, confirm **the error message is gone** | VU+ | search built (same script, run again); confirming the error message is gone depends on where the message shows, still unknown |

## What to report after steps 1 to 7 (then stop and ask)
- Step 1 result (error shown or not), Contact GUID and Profile ID, the result of step 3 (enrollment found or not), the offering IDs
  and their lead GUIDs, and the matching enrollment: enrollment GUID, status, whether the username equals the email, and whether its
  contact GUID is null. If more than one enrollment matches, or none, or none has a username equal to the email, say so and stop; don't pick.
- State what step 8 would change (which enrollment GUID gets which contact GUID) and ask for approval. Nothing is written without a yes
  for that BO's enrollment.
- Don't report the PassportAccountId.

## Other things to know
- Control Tower reminders still apply (username vs email; co-borrower shares the borrower's email or username).
- Other fixes seen in tickets (need the user's yes each time): create a new contact card and obliterate the old enrollment
  (PS1682198; Obliterate is irreversible). "Resend Enrollment Email" exists in Control Tower; mention it, don't click it.
- CRM contact card / opportunity: CRM lookup not built (Dynamics sign-in not set up yet).

## Open (to build or confirm)
- VU+ loan search is built (steps 1 and 10). Still unknown: where the "Error(s) present on MyVU and/or CRM" message shows in VU+, if it
  is more than the search (for example inside the loan). Ask the user once a real case with the error comes up.
- Steps 6 and 7 are built and return data (tested 2026-11-04 on a healthy test account, where the enrollment's contact GUID was already
  populated, so the "contact GUID is null" condition has not been seen in a real broken case). Test account used: the MyVU test user
  `milestonemc01m…@mailosaur.io` (Control Tower gives the Contact GUID and Profile ID; 4 opportunities).
- The PATCH route is known (step 8) but not built; it needs its own approval design (and a safe way to test) before any code exists.
- Step 3 finds an enrollment: **answered 2026-11-04**: stop and return the JSON body here (see the table). Check that
  `profile-api-lookup.cjs --contact` can print the raw JSON body; if it only prints a summary, add a raw option (GET only).
- No offering's lead has an enrolled enrollment (steps 5 and 6): **answered 2026-11-04**: the lead GUID probably has to come from
  **CRM** instead (search CRM for the BO's lead GUID, then redo step 6 with it). **CRM is NOT connected, and the user does not want to
  connect it at this moment**, so don't open CRM or try to sign in. Stop, report what steps 1 to 6 found (offerings, their lead GUIDs,
  that no enrolled enrollment matched), say the next step needs the lead GUID from CRM, and ask the user to look it up by hand or paste it.

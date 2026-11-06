# Enrollment: the BO cannot enroll

Three types of enrollment ticket (user, 2026-11-05). Pick by the opener's words:

| Type | The ticket says | Section |
|---|---|---|
| 1. Enrollment link lands on login or welcome back | the BO **cannot enroll**: opening the **enrollment link** takes them to the **login page** or the **welcome back page** instead of the enrollment | "Type 1" below (to be filled in) |
| 2. No enrollment link email | the BO **cannot get the enrollment link email** | "Type 2" below (draft) |
| 3. VU+ error | a **VU+ / "VU Plus" error**, for example "Error(s) present on MyVU and/or CRM with this loan" | "Type 3" below (the 10-step procedure) |

If the ticket is about a code not arriving at login, or a loop after signing in, it is not enrollment: use `code-not-received.md` or
`login-loop.md`.

## Type 2: the BO cannot get the enrollment link email (user, 2026-11-05; DRAFT, to be filled in with the user)
- Data to get: the BO email; whether the BO is enrolled already (Control Tower, `sn-ticket-controltower-bo-lookup`: enrollment check,
  username vs email); whether the enrollment email was sent and delivered or bounced (SendGrid, `sn-ticket-sendgrid-email-lookup`, the
  BO email, around the created time).
- Report: enrollment state, the SendGrid rows (status, time, bounce reason if any), and whether the email on the ticket matches the one
  on the contact.
- Fix seen: "Resend Enrollment Email" exists in Control Tower; mention it, don't click it (needs the user's yes for that BO).
- Open: which email the system sends (subject line to search for), how far back to search, what to do on a bounce or a suppressed
  address, and whether a wrong or changed email address on the contact is the usual cause. Ask the user once a real ticket comes up.

## Type 1: the enrollment link goes to the login or welcome back page (user, 2026-11-05; DRAFT, first version)
The VU+ procedure under type 3 is NOT the fix for this type (user, 2026-11-05: VU+ is its own, third type).
There are four steps. Go to the next one only when the one before found no enrollment (user, 2026-11-05).

### Step 1: Control Tower
What the team usually does: check the enrollment status in Control Tower. It mostly shows the **contact is not enrolled**. **Also get the
Contact GUID here, in case step 3 is needed** (the Contact GUID is in Details; the script skips Details for a not-enrolled contact, so
run it with `--details --show profile,opps`; the opportunities are used in step 2).

| # | Step | Tool | Status |
|---|---|---|---|
| 1 | Search the BO email in Control Tower. On the search page, look at the **contact** record: if it has **no username** (also no Enrolled Brand, no PassportAccountId), the contact is **not enrolled**. Get the **Contact GUID** (and Profile ID) at the same time | `sn-ticket-controltower-bo-lookup <BO email> --details --show profile,opps` (the `ENROLLMENT:` line) | built; without `--details` the script reads the card and stops, so the GUID is not printed |
| 2 | The search may also return a **lead** record for the same email. Check whether the lead **has a username populated** | Control Tower search page (lead card) | **not built:** the script lists leads (type, name, email, phone, created) but does not print a lead's username. Read it by hand or add it |
| 3 | If the lead has a username: **get the username**, then **click Details on the lead** to get the **Profile ID** | Control Tower, lead Details | **not built:** the script never opens lead Details (modal has a different layout, untested) |
| 4 | **Ensure the email is the same as the username** (compare the BO email with the lead's username) | report | by hand from steps 2 and 3 |
| 5 | You may also need the **create date** from the **Profile Information** section in the same Details modal | Control Tower, lead Details | **not built** (same as step 3) |

- Report: contact enrolled or not (and what is missing), whether a lead exists and its username, whether the username equals the email,
  the Profile ID and the create date. Never the PassportAccountId. If there is no lead, or the lead has no username, say so.
- Fixes: none written down yet. Don't click anything in Control Tower ("Resend Enrollment Email" etc.); report and ask the user.

### Step 2: Control Tower, the co-borrower (CO) check (user, 2026-11-05)
Before the Profile API, read the contact's Details in Control Tower (same run as step 1, `--show opps`). It lists **all the
opportunities**. For each one, find whether it has a **CO**, and compare the CO's email and username with the BO's email:
- **CO email is the same as the BO email: a clue.** Point it out.
- **CO username is the same as the BO email: this is the issue found.** Tell the user plainly: **the CO has an account with the same
  email address as the BO**. We do not support the same email address on two accounts.
- The script already prints these as `FLAG:` lines in its `REMINDERS` block (CO email or CO username the same as the borrower's); report
  them, with the loan number and CO name of the opportunity they came from (never the PassportAccountId). If there is no CO, say so
  and go to step 3.
- **If the CO email is not the same as the BO's (or not always the same, across the opportunities), and the CO is not enrolled or has an
  account whose username is a different email: look further (user, 2026-11-05).**
  1. Take the **CO email and CO username** from the opportunity (Control Tower shows Co-Borrower Name / Email / Username).
  2. **Search the CO email (and the username, if different) in Control Tower** (`sn-ticket-controltower-bo-lookup <CO email>`) and report
     whether the CO is enrolled, the CO's username, and whether the CO's username equals the BO's email.
  3. Get the **full name of the BO and of the CO** (if there is a CO): the BO name from the ticket / Control Tower card, the CO name from
     the opportunity's Co-Borrower Name. Report both as "First Last".
  Then go to step 3.
- Fix: none written down yet (the user's call: the CO or BO needs a different email, or the accounts are merged or fixed by the team).
  Don't change anything; report and ask.

### Step 3: the Profile API (profile route), when steps 1 and 2 found no enrollment and no CO conflict
Look up the enrollment by the **Contact GUID** taken from Control Tower in step 1: `sn-ticket-profile-api-lookup` with `--contact <guid>`
(GET only, built). Report what it returns. **"Enrollable" is a status value in the response (user, 2026-11-05).** The response is
`data.items[]`, each item with `enrollmentGuid`, `leadGuid`, `leadFormUniqueIdentifier`, `contactGuid`, `status`, `email`, `username`.
The case that means "go to step 4": an item with **`status` = `"Enrollable"` and `username` = `null`** (the BO has an enrollment record
that is waiting to be enrolled, not an enrolled account). Report the status, the username (null or not), and whether the item's `email`
equals the BO email.
- **`Enrollable` with a null username: go to step 4.**
- Any other result (another status, or a username that is populated, meaning the BO is already enrolled): stop and return the JSON
  body as is in the chat, then wait. Don't treat it as step 4.
- "Enrollment not found" (404): report it and ask the user; it is not the `Enrollable` case.

### Step 4: keep investigating; the full steps are not given (user, 2026-11-05)
**Note: the user cannot give the full investigation steps for this type.** What to try next is one known thing, not a complete
procedure; after it, report and ask. Don't assume the rest is the VU+ procedure (type 3).
- **Try: search the enrollment by the lead GUIDs.** Get the offerings from the Profile ID (Profile API related offerings), take each
  offering's `leadGuid`, and run `sn-ticket-profile-api-lookup --lead <guid>[,<guid>...]` (same as type 3, steps 4 to 6; GET only,
  built).
- **If any of them is enrolled (`status`) and its `username` matches the BO email, that is the issue.** Say so plainly.
- **Then return the contact GUID from that enrollment** (the `contactGuid` in the enrolled item's response). It is almost always (the
  user says about 99%) **different from the Contact GUID Control Tower lists** for the BO. **Return the enrollment's contact GUID as
  the result (user, 2026-11-05)**, and show the Control Tower one next to it to make clear they do not match (or, if they match, say
  that, since it is unusual). Also give the enrollment GUID, status and username. Don't write anything (no PATCH); report and ask.
- If none is enrolled with a matching username, report what each lead GUID returned and ask the user.
- **Needs CRM (user, 2026-11-05).** Two parts of this step depend on CRM, and CRM is **not connected** (see Open below): (1) **how to get
  the lead GUID** when the offerings do not give a usable one (a null `leadGuid`, or none of them is enrolled); (2) **what to do next
  once the enrollment's contact GUID differs from Control Tower's**. Both are to be worked out with the user. Until then: stop after
  reporting what steps 1 to 4 found, say the next part needs CRM, and ask. Don't open CRM or try to sign in.

- Open: what the findings mean (for example a lead with a username but a contact without one, or a username that differs from the
  email) and what the team does next; the real fix for each outcome; and the rest of the steps after step 4 (the user cannot give them all). Ask the user.

## Type 3: VU+ error, "Error(s) present on MyVU and/or CRM with this loan"

### How to recognize it (user, 2026-11-04)
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

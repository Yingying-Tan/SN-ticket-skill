---
name: sn-ticket-profile-api-lookup
description: ServiceNow ticket support. Look up data from the VCCM Profile API (the Postman collection "Published (Internal)"): related offerings by Profile ID, one offering by ID, its loan team, the enrollment by Contact GUID, and the enrollment by lead GUID. Use when the user gives a Profile ID or Contact GUID (for example from Control Tower) and asks for the offerings, "offering route", related offerings, the loan team, or the enrollment. Runs a Node script that signs in through Okta (Authorization Code + PKCE) and makes read-only GET calls.
---

# Profile API lookup (VCCM Profile API)

> **Terms:** BO = Borrower, CO = Co-Borrower (CBO means the same), LO = Loan Officer.

Goal: from a Profile ID, list the offerings linked to that profile, and optionally read one offering and its loan team. From a Contact GUID, read the enrollment.

## Hard rules
- **GET only.** The same collection has requests that create, update or delete profiles, enrollments, factors and offerings, and one that resends enrollment notifications. Never call those. The script sends GET only; do not change that.
- The calls go to the **production** gateway. Look up only the profile the user gave.
- Never print, log or save the access token. The script keeps it in memory.
- Never type the user's password or approve MFA. If an Okta prompt appears, ask the user to complete it in the visible window.
- Playwright only. Claude in Chrome is NOT allowed at this org.
- Keep customer data (profile IDs, GUIDs, loan data) in the chat. Do not write it to files or memory.
- The Postman export (`*.postman_collection.json`) holds a stored token. It is git-ignored; never commit or share it.

## Fast path
From the project root:

```
node sn-ticket-support/profile-api-lookup.cjs <profileId>
node sn-ticket-support/profile-api-lookup.cjs --offering <offeringId> [--loan-team]
node sn-ticket-support/profile-api-lookup.cjs <profileId> --offering <offeringId> --loan-team
node sn-ticket-support/profile-api-lookup.cjs --contact <contactGuid>
node sn-ticket-support/profile-api-lookup.cjs --lead <leadGuid>[,<leadGuid>...] [--profile-by-lead]
```

- `<contactGuid>` is the Contact GUID (Control Tower shows it in the profile). `--contact` uses the public gateway, as the collection does.
- `<profileId>` is a GUID (the **Profile ID** Control Tower shows). `<offeringId>` is the numeric `id` from the related offerings.
- Default gateway is `https://api-prod-azure.vuhl.redchimney.com/vccm/v1` (brand `vuhl`). `--public` uses `https://api.vu.com/vccm-public/v1`; not needed so far.
- Opens a visible Chromium, signs in through `vu.okta.com` (Okta single sign-on, no prompt on 2026-11-03), prints each response as JSON, and closes itself. Profile is persisted in `sn-ticket-support/.profile-api-profile` (git-ignored).

## Calls
| Flag | Request |
|---|---|
| `<profileId>` | `GET /vuhl/profiles/<profileId>/related-offerings` |
| `--offering <id>` | `GET /vuhl/offerings/<id>` |
| `--offering <id> --loan-team` | also `GET /vuhl/offerings/<id>/loan-team` |
| `--contact <contactGuid>` | `GET /vuhl/enrollments?contactGuid=<guid>` on the public gateway |
| `--lead <guid>[,<guid>...]` | `GET /vuhl/enrollments?leadGuid=<guid>` on the public gateway, one call per lead GUID (playbook enrollment step 6; added 2026-11-04) |
| `--lead ... --profile-by-lead` | also `GET /vuhl/profiles?leadGuid=<guid>` per lead GUID (internal gateway; the collection's "Profiles" request) |

For `--lead`: a lead GUID with no enrollment returns **404** with "Enrollment not found for ... lead guid: <guid>"; that is the normal not-found answer, not a failure. A hit returns 200 with `enrollmentGuid`, `leadGuid`, `leadFormUniqueIdentifier`, `contactGuid`, `status`, `email`, `username`. The `leadGuid`s come from the related offerings (null on some offerings: skip those).

Auth: Okta `https://vu.okta.com/oauth2/auswzih7bekPPDaYx0x7`, client `0oa18m5a1bxEyKoJp0x8` (public client, no secret), scope `vuhl.svcAccount`, callback `https://oauth.pstmn.io/v1/callback`.

## The write route that exists (NOT built, never called here)
`PATCH {{baseUrl}}/{{brand}}/enrollments/:enrollmentId` ("Update Enrollment") with a JSON body of `leadFormUniqueIdentifier`, `leadGuid` and `contactGuid`. It is the playbook's enrollment step 8 (put the contact GUID onto the enrollment). The script is GET only; a PATCH needs its own named step and the user's explicit approval for that one enrollment first. Open: whether the body may carry only `contactGuid`, and whether a partial body would blank the other fields. Don't test that on a real account.

## Reporting back
For an enrollment, report `status`, `email`, `username`, `enrollmentGuid`, `leadGuid`, `leadFormUniqueIdentifier` and `contactGuid`. Note when the username equals the email, and when the email is a test address (for example `mailosaur.io`). If a lead GUID matches an offering's lead GUID, say they match; do not infer more.

For offerings:
Report what the API returned: for each offering the `id`, `leadGuid`, `homeLoanOpportunityGuid`, `lighthouseOpportunityGuid`, `homeLoanGuid`, `promotionGuid` and `created`. Say plainly when a field is null. Do not guess what the GUIDs map to. If the response is empty or not 200, report the status and body.

## If it breaks
- Timed out waiting for Okta: the sign-in was not finished. Retry and complete it in the window. The script logs the pages it visits (host and path only).
- Token request failed: Okta rejected the client or the callback URL. Report the error text.
- 401/403 on a call: the token was not accepted by that gateway or the scope is missing; try `--public`.
- 404 on related offerings: the Profile ID is wrong or has no offerings.

## Verified
2026-11-03: related offerings for one profile returned 200 with five offerings on the internal gateway. Enrollment by Contact GUID returned 200 with one enrollment (`AlreadyEnrolled`). `--offering` and `--loan-team` not tested yet.
2026-11-04 on a test account (mailosaur address): enrollment by Contact GUID 200; related offerings 200 (5 offerings, 3 distinct lead GUIDs, 2 with none); `--lead` on the 3 lead GUIDs: two returned 404 not found, one returned 200 with the enrollment (same enrollment GUID as the Contact GUID lookup, contact GUID populated, username equal to the email); `--profile-by-lead` on the same GUIDs matched (404, 404, 200 with the profile).

# Loan and offerings (BO does not see the loan, wrong data in MyVU)

## Data to get
| Data | Where | Skill |
|---|---|---|
| Per loan: loan number, CRM display name, status; co-borrower | Control Tower opportunities | `sn-ticket-controltower-bo-lookup` (`--show opps`) |
| Related offerings for the Profile ID; one offering; loan team | Profile API | `sn-ticket-profile-api-lookup` |
| Lead / opportunity record | CRM | not built |

## What to report
- Each loan with number, display name and status (not the loan officer). Offering count and any that look unneeded
  (PS1682198: 20 offerings on one profile). Loan number on the ticket vs the loans found.

## Fixes the team has used (need the user's yes, each time)
- Remove unnecessary offerings from the BO's profile (suggested in PS1682198 work notes). Claude only reports; it does
  not call anything but GET on the Profile API.

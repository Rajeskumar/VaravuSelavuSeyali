# Requirement agreement

Status: agreed. Owner and acceptance criteria: work-item.json.

## Problem and users
Web: the Exact and Percentage tabs pre-filled each value rounded on its own (100 / 3 = 33.33 x 3) and accepted totals within 0.02,
so Save was enabled and the server answered 400. Reproduced 2026-11-26 on both tabs. Web payers and mobile splits and payers also
allowed up to a cent of difference (mobile accepted 3.33 x 3 on 10.00 and payers of 5 + 4.99 on 10.00 in unit tests).

## Outcome and scope
Pre-filled values add up exactly; clients accept only what the server accepts. Excluded: server changes, rounding of shares the
server computes (equal, shares), adding a pre-fill to mobile, the mobile Adjustment rule (ROADMAP).

## Decisions and open questions
Owner, 2026-11-26: "go with no minus value fix", choosing no minus values anywhere over allowing negative adjustments (AC-004).
Owner, 2026-11-26: "it should randomly assign one person with a cent more and it doesnt ahve to be equal, for example splitting 10$
would be 3.33, 3.33, 3.34". Agent interpretation: when more than one cent is left over, each goes to a different random person.

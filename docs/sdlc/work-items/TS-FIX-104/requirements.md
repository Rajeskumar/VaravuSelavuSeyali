# Requirement agreement

2026-11-27. After the open risks were listed, the owner asked: "Fix 1 , 3, 5" - (1) server limits on recurring amounts,
(3) local-only guard for the QA account scripts, (5) duplicate protection for settle-up.
Excluded: item 2 (budget and card fee amounts), item 4 (third decimal after a lone dot), an undo control in the apps
(the API can already delete a settlement), protection for older app builds, which send no request_id.
Later on 2026-11-27 the owner asked: "fix the existing bug settle my share duplicate payments. for postgres test we can do
locally. spin localhost frontend and backend and use hte browser to validate it". That covers AC-005 and, found while
checking it, AC-006 (an edit forgot the paid mark) and AC-007 (the refused screen kept the old balance).
Acceptance criteria: work-item.json.

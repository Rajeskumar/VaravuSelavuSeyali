# Test specification

Requirements: requirements.md; acceptance-criterion text: work-item.json.

| Scenario ID | AC IDs | Preconditions / fixture | Action | Expected outcome | Level / location |
|---|---|---|---|---|---|
| TP-01 | AC-001 | User with personal spend, an active group and a deleted group, both with shares this month | GET analysis scope=combined | `total_expenses == spend_breakdown.personal + spend_breakdown.group_share`; deleted group absent from group_summaries | backend pytest |
| TP-02 | AC-002 | Same, user paid in the deleted group | GET analysis | `spend_breakdown.i_paid_share` includes the deleted group's amount_paid | backend pytest |
| TP-03 | AC-003 | Archived group + left membership | GET analysis | summaries list only the active group; totals include all | backend pytest |
| TP-04 | AC-001/002 | spend_breakdown present, summaries missing a group | computeMyExpensesTotal / computeIPaidTotal | uses spend_breakdown; falls back to summaries when absent | web Jest, mobile Jest |
| TP-05 | AC-004 | Desktop dialog with scanned items and long content | click Remove item | click lands; mismatch warning shows | QA e2e receipt-scan.spec (Chromium→Firefox local) |
| TP-06 | AC-005 | Candidate commit | qa.yml full matrix | green | CI |

# Bug-fix workflow

1. **Reproduce** (test, curl, or UI steps). If you cannot reproduce, say so and what you tried.
2. **Find the root cause**, not the symptom; check whether the other client (web/mobile) or a sibling code path has the same bug.
3. **Write the failing test first** where feasible (it must fail for the right reason).
4. **Fix minimally.** No drive-by refactors; note them separately.
5. **Prove it:** the new test passes, the surrounding suite passes (`scripts/quality/verify.sh`).
6. **Route review:** `route-review.sh`. Money, auth, permissions or data-loss bugs always get security/test review; cosmetic fixes need none.
7. **Record:** `CHANGELOG.md` line; add a Key Decision only if the fix established a rule others must follow.

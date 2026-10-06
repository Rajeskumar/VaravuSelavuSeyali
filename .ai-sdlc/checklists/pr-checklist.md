# PR checklist

- [ ] Scope is one logical item; description states what/why and how it was verified.
- [ ] `scripts/quality/verify.sh` green (paste summary).
- [ ] `scripts/quality/route-review.sh` output reviewed; listed reviewers run; no open P0/P1 (or explicitly accepted).
- [ ] Definition of Done ticked or marked n/a with reasons.
- [ ] Contract/schema change: both clients, spec and migration compatibility considered.
- [ ] Screenshots/recording for UI changes (light + dark, phone + desktop).
- [ ] `CHANGELOG.md` updated; `ROADMAP.md` if planned work changed.
- [ ] Not committed/pushed without the owner's go-ahead (hooks not bypassed).

# Work item — evaluate Firebase Performance Monitoring

Status: backlog, not planned. Created 2026-11-25 as a follow-up of TS-GA4-002 (the owner asked for Performance Monitoring to be evaluated separately from Analytics and Crashlytics).

## Problem and outcome
Decide whether Performance Monitoring (app start, screen rendering, network traces) is worth adding to the iOS and Android apps: what it collects (URLs and request metadata are a privacy risk for an app that carries financial data), consent and Data Safety/App Privacy impact, SDK size and startup cost, and whether it overlaps with what Crashlytics already gives. Output: a recommendation with a privacy review, not an implementation.

## Plan
Discover only. Expected risk: high if adopted (external data destination). No dependency is added by this item.

## Tests / Evidence
To be written at Plan.

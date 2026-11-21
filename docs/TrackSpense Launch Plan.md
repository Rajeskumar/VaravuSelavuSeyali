# TrackSpense Launch Plan

Oct 25, 2026 · @Rajesh

## Summary

Launch TrackSpense as a web beta on January 1, 2027, then on the App Store and Google Play around March 2027, published by Cerebroos LLC. The web beta catches the New Year budgeting wave without waiting on company paperwork and store reviews.

The critical path is paperwork, not code: visa and employer clearance, then a Texas LLC, EIN, D-U-N-S number, and the two developer accounts. Each step needs the one before it, so start the clearance checks this week.

Scope at launch is the core that only TrackSpense has: Groups and the personal ledger in one place, plus the redesign. Card Coach and Tags come later as premium features.

## Step zero: clear visa and employer rules first

Do not form the company, enroll in developer programs, or take revenue until both checks below are done. Everything later depends on them.

**Immigration.** If you hold a work visa such as H-1B, owning an LLC is generally allowed, but working for it may not be. Practitioners describe app revenue as a gray zone that depends on how the business is structured and who does the ongoing work ([f1jobs](https://www.f1jobs.io/resources/blog/moonlighting-side-project-risk-h1b-visa)). Book a paid consult with an immigration attorney and ask:

1. Can I own Cerebroos LLC, and in what structure (single-member LLC, LLC taxed as a corporation, C-Corp)?
2. Can I keep building and maintaining TrackSpense myself after launch, or must someone else operate it?
3. Can I sign the Apple and Google developer agreements as the account holder?
4. How should revenue reach me without creating unauthorized employment?

**Employer.** You work in banking and TrackSpense is a personal finance app, so the overlap is real. Read your offer letter and employee handbook for:

- An invention or IP assignment clause covering work done outside hours.
- A requirement to disclose or get approval for outside business activity.
- Conflict-of-interest rules for fintech or financial products.

Build only on your own laptop, accounts, and time. Never use employer devices, networks, data, or code.

## Company setup: Cerebroos LLC

Form Cerebroos LLC in Texas in early January, after your December move. Forming in your current state and then moving would mean registering again in Texas as a foreign LLC, which costs $750 on top of the original filing ([Zenind](https://www.zenind.com/help/post/cost-to-start-a-texas-llc-state-fees-franchise-tax-and-hidden-expenses)).

Do the steps in this order. Each one needs the previous one's paperwork.

| # | Step | Where | Cost | Time | Output you keep |
| --- | --- | --- | --- | --- | --- |
| 1 | Name and trademark search for "Cerebroos" and "TrackSpense" | Texas SOSDirect, USPTO trademark search | $0 | 1 hour | Confidence both names are free |
| 2 | File Certificate of Formation (Form 205) | Texas Secretary of State | $300, or about $308 online | A few days | Certificate of Filing |
| 3 | Appoint a registered agent | Yourself, or a paid agent to keep your home address off public records | $0 to a yearly service fee | Same day | Agent on file |
| 4 | Write an operating agreement | Template, attorney-reviewed | $0 | 1 evening | Signed agreement |
| 5 | Get an EIN | IRS online | $0 | Same day | EIN confirmation letter (CP575) |
| 6 | Get a D-U-N-S number | Apple's D-U-N-S lookup tool | $0 | Up to 5 business days | 9-digit D-U-N-S |
| 7 | Open a business bank account | Online business bank or local bank | $0 | 1 to 3 days | Account for store payouts |
| 8 | Business phone and mailing address | VoIP number, virtual mailbox | Small monthly fee | Same day | Public contact details |
| 9 | File a trademark (optional, later) | USPTO | Per-class filing fee | Months | Registered mark |

Notes:

- **Legal name matters.** Apple does not accept DBAs or trade names, only the exact legal entity name ([Apple](https://developer.apple.com/support/D-U-N-S/)). Use "Cerebroos LLC" identically everywhere.
- **D-U-N-S timing.** Apple says to allow up to 5 business days ([Apple](https://developer.apple.com/support/D-U-N-S/)). Other guides report longer waits, so request it the day the EIN arrives.
- **Yearly upkeep.** Texas has no annual fee, but every LLC must file a Public Information Report by May 15, even with zero revenue. Franchise tax applies only above $2.65 million in revenue for 2026 ([RunSensible](https://forms.runsensible.com/?p=27766)).
- **Address privacy.** Store listings and state records can show your business address. Use a virtual business address rather than your apartment.
- **Taxes.** By default a single-member LLC's income lands on your personal return. Confirm the right tax election with a CPA, since it interacts with the visa question.

## Brand and accounts

Set up the brand's online identity now; none of it needs the LLC. Apple requires a work email on your organization's domain and a public, working website on that domain ([Apple](https://developer.apple.com/programs/enroll/?product=WM)).

**Domains.** Buy cerebroos.com for the company, plus one TrackSpense domain (trackspense.com or trackspense.app, whichever is free). Use a registrar that sells at cost, such as Cloudflare, and turn on auto-renew.

**Email.** Run Google Workspace or a cheaper equivalent on cerebroos.com with one paid mailbox and free aliases:

| Address | Used for |
| --- | --- |
| rajesh@cerebroos.com | Your work identity; Apple Account and Google account for the stores |
| support@cerebroos.com | Store listings, in-app help, user questions |
| privacy@cerebroos.com | Privacy policy contact, data and deletion requests |
| legal@cerebroos.com | Agreements, trademark, registered agent mail |
| billing@cerebroos.com | GCP, OpenAI, Apple, Google, and other invoices |

Set up SPF, DKIM, and DMARC so your emails don't land in spam.

**Websites.**

- cerebroos.com: a one-page company site with the legal name, a contact address, and a link to TrackSpense.
- trackspense domain: landing page with a waitlist, plus Privacy Policy, Terms of Service, Support, and an Account Deletion page. Both stores link to these.

**Social handles.** Claim "cerebroos" and "trackspense" on X, LinkedIn (company page), Instagram, Threads, Reddit, YouTube, Product Hunt, and GitHub (as an organization) before anyone else does.

**Security.**

- Keep everything in a password manager, with a separate vault for Cerebroos.
- Turn on two-factor authentication everywhere, using an authenticator app or a hardware key rather than SMS where offered.
- Pay for business services with a business card, so personal and company spending stay separate for taxes.

**Service accounts to move or create under the company email:** GCP billing, OpenAI, Expo, GitHub, a subscriptions service such as RevenueCat, crash reporting such as Sentry, and product analytics such as PostHog.

## Developer accounts

Enroll both stores as an organization, Cerebroos LLC, not as an individual. The seller name then reads "Cerebroos LLC" instead of your personal name, and Google waives its 12-tester rule for organizations.

|  | Apple Developer Program | Google Play Console |
| --- | --- | --- |
| Account type | Company/Organization | Organization |
| Fee | $99 per year | $25 once |
| Needs | Legal entity, D-U-N-S, legal binding authority, domain email, public website | D-U-N-S, organization details, website, contact email and phone |
| Sign in with | Apple Account on rajesh@cerebroos.com, two-factor on | Google account on rajesh@cerebroos.com |
| Verification | Apple may phone the business number you list | Organization and payments verification |
| Testing before launch | TestFlight: internal testers with no review, external testers after a beta review | Internal testing (up to 100 testers, no review), then closed and open tracks |
| Extra gate | None | Personal accounts made after Nov 13, 2023 must run a 14-day closed test with 12 testers; organization accounts are exempt |
| After approval | Sign Paid Apps agreement, add tax (W-9) and banking, enroll in Small Business Program | Set up payments profile and merchant account, verify website ownership |

Sources: [Apple enrollment](https://developer.apple.com/programs/enroll/?product=WM), [Apple D-U-N-S](https://developer.apple.com/support/D-U-N-S/), [12-tester rule](https://extendsclass.com/blog/google-plays-closed-testing-requirement-what-developers-need-to-know-in-2026).

**Expo (EAS).**

- Create an Expo organization named "cerebroos" and move the project into it.
- Set the app IDs once and never change them: bundle ID com.cerebroos.trackspense (iOS) and package name com.cerebroos.trackspense (Android).
- Let EAS manage iOS certificates and provisioning profiles. Turn on Play App Signing for Android, and back up the upload key in the password manager.
- Use EAS Build for store builds and EAS Submit to push them to TestFlight and Play tracks.

**If the LLC is delayed.** Don't enroll as an individual to save time. Moving apps from a personal to a company account later is extra work, and the Google personal account would also trigger the 12-tester rule. The web beta covers January instead.

## Production readiness

The gap between "works on my workstation" and "safe for strangers' financial data" is mostly environments, security, legal pages, and deletion. Close it before any outside user signs up.

**Environments and infrastructure (GCP)**

- Two environments, staging and production, each with its own database, secrets, and API keys. Never test against production data.
- Backend on Cloud Run with minimum instances set to 0, so you pay only while requests run.
- Managed Postgres with daily backups and point-in-time recovery. For financial data, pay for backups even if a free tier would otherwise do.
- Web frontend on a static host behind your domain (app.trackspense…), API on api.trackspense…, both HTTPS only.
- Secrets in Secret Manager, never in the repo or the mobile app bundle. Rotate any key that was ever committed.
- A budget alert in GCP and a monthly spending cap on the OpenAI account.

**Security**

- Least-privilege service accounts; nobody but you has production access.
- Rate limiting on login and AI endpoints; tight CORS rules.
- No personal or financial data in logs or crash reports.
- Send the AI provider only the fields a question needs, and say in the privacy policy that an AI provider processes data.
- Dependency and secret scanning on the GitHub repo.

**Sign-in.** If the iOS app offers Google or another third-party sign-in, Apple expects an equivalent privacy-focused option such as Sign in with Apple. Email sign-in plus Sign in with Apple is the simplest combination.

**Account deletion.** Both stores require it. Apple has required in-app account deletion since 2022. Google requires deletion both inside the app and through a web link entered in Play Console, and deactivating an account does not count ([9to5Google](https://9to5google.com/?p=563006)). Deleting a user must also delete their expenses, receipts, and AI history, and handle their share in groups other people still use.

**Legal pages** (on the TrackSpense domain, linked in the app and both store listings):

- Privacy Policy: what you collect, why, the processors you use (GCP, AI provider, analytics), retention, deletion, contact.
- Terms of Service: acceptable use, subscription terms, limits of liability.
- A clear line that Card Coach and AI insights are informational and not financial advice.
- Start from a reputable template, then have a lawyer review it once before public launch.

**Monitoring.** Crash and error reporting on web, backend, and mobile; an uptime check on the API; privacy-light product analytics for the launch metrics.

**Scope freeze.** Ship Groups, the personal ledger, AI Analyst, and the core redesign. Leave Card Coach and Tags for after launch.

## Store submission

Most first-time rejections come from missing basics rather than the app itself: no demo login, broken links, or privacy answers that don't match the app. Prepare these once and reuse them on both stores.

**Shared listing assets**

- App name "TrackSpense", seller Cerebroos LLC, category Finance.
- Subtitle or short description built around the pitch: split with friends and track your own spending in one place.
- Screenshots for current phone sizes on both stores; one message per screenshot, with groups and the unified ledger first.
- Keywords drawn from what people search: split expenses, shared expenses, expense tracker, budget, roommates, trip expenses.
- Support URL, Privacy Policy URL, marketing URL.
- A demo account with realistic sample data, given to reviewers in the review notes.

**Apple App Store**

1. Create the app in App Store Connect with the bundle ID.
2. Fill in the App Privacy label to match the privacy policy exactly.
3. Complete the age rating questionnaire and export compliance answer (standard HTTPS only).
4. Set up subscriptions in App Store Connect before submitting, since paid digital features must use in-app purchase.
5. Ship builds to TestFlight: your own devices first, then external beta users.
6. Submit for review with the demo account and short notes on how Groups work.

**Google Play**

1. Create the app in Play Console with the package name.
2. Complete App content: privacy policy, Data safety form, the Financial features declaration (required even for apps without lending), content rating, target audience, ads declaration, and the account deletion URL ([Google](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en)).
3. Set up subscription products in Play Console.
4. Release to internal testing, then a closed track for the beta cohort.
5. Promote to production with a staged rollout, starting at a small percentage of users.

**Review risks specific to TrackSpense**

- Finance category apps get closer scrutiny. Make sure nothing implies lending, banking, or investment services.
- AI features must not present output as professional financial advice.
- Every link in the app and listing must work, and the app must not say "beta" in its store build.

## Pricing and payments

Make splitting free and unlimited, and charge a small subscription for the AI and power features. Free splitting drives group invites, which is the growth engine; the paywall also caps AI costs to paying users.

| Tier | Price (proposed) | Includes |
| --- | --- | --- |
| Free | $0 | Unlimited groups and splits, personal ledger, basic analytics |
| Premium | $2.99 per month or $19.99 per year | AI Analyst, Card Coach and Tags when they ship, exports, advanced analytics |

- **Store fees.** Apple's Small Business Program takes 15% instead of 30% for developers under $1 million in yearly proceeds, including subscriptions ([RevenueCat](https://www.revenuecat.com/blog/engineering/small-business-program)). Google charges 15% or less on subscriptions. Enroll in Apple's program right after the developer account is approved.
- **One subscription system.** Use a subscriptions service such as RevenueCat so one account works across iOS, Android, and web, and so you don't build receipt validation yourself.
- **Web payments.** The web beta can take payments through Stripe once Premium exists. Keep the web beta free at first.
- **Price testing.** Treat the prices above as a starting point and adjust after the first 100 paying users.
- **Payouts.** Store and Stripe payouts go to the Cerebroos business account only.

## Go-to-market

Win one audience first: people who split costs with roommates, a partner, or travel friends and keep a separate budget app today. They feel the two-app problem every month, and every group they create invites 3 to 5 new users.

**Positioning.** "Split with friends and track your own spending in one place." Splitwise handles groups only; Monarch and Copilot handle personal finance only.

**Channels, in order of effort**

1. **Your own circles.** Recruit 20 to 50 beta users as whole groups (roommates, couples, trip groups) rather than individuals.
2. **App store search.** Pick 5 to 10 search phrases, put the strongest in the app name, subtitle, and keyword fields, and track your rank weekly. Search is slow to build but keeps working once it does.
3. **Build in public.** Post progress, screenshots, and lessons weekly on X, LinkedIn, and Threads. Developer audiences respond to how the unified ledger works.
4. **Launch moments.** A Product Hunt launch when the store apps go live, and helpful, non-spammy posts in relevant subreddits that allow it.
5. **Comparison content.** Short pages on the TrackSpense site answering what people search, such as how to track your share of group expenses in your own budget.

**January timing.** Budgeting interest likely spikes at New Year, the way habit apps do. The web beta on January 1 lets you capture that interest as sign-ups and a waitlist, even before the store apps exist.

**Gates before each step**

| Gate | Check | Move on when |
| --- | --- | --- |
| Beta to store launch | Are beta users still adding expenses after 4 weeks? | Most active groups are still logging weekly |
| Store launch to marketing push | Do new users invite others? | Invites per new user are rising, not flat |
| Free to paid push | Do people use AI Analyst repeatedly? | A clear group returns to it weekly |

Set the exact numbers after the first cohort, when you have a baseline.

## Timeline

&#91;embedded content: launch roadmap · two lanes, Nov 2026 to Mar 2027\]

The two lanes run in parallel: the web beta doesn't wait on company paperwork, but the store launch needs both lanes finished. If the December move or the D-U-N-S number slips, the store launch moves to April and the web beta carries on.

## Budget

The fixed cost to get to launch is about $425 ($300 LLC filing, $99 Apple, $25 Google), plus the attorney consult and any optional services. Monthly running costs stay low until AI usage grows.

| Item | When | Cost | Notes |
| --- | --- | --- | --- |
| Texas LLC filing | Once | $300 ($308 online) | Form 205 |
| EIN | Once | $0 | IRS online |
| D-U-N-S number | Once | $0 | Through Apple's lookup tool |
| Google Play developer account | Once | $25 | Organization account |
| Apple Developer Program | Yearly | $99 | Organization account |
| Immigration attorney consult | Once | Varies | Do before forming anything |
| Domains | Yearly | Small | cerebroos.com plus one TrackSpense domain |
| Business email | Monthly | Per mailbox | One paid mailbox, aliases free |
| Registered agent, virtual address, phone | Yearly or monthly | Optional | Keeps your home address private |
| Trademark | Once per class | USPTO fee | Optional, after launch traction |
| Hosting (GCP, database) | Monthly | Low | Scale-to-zero backend, paid backups |
| AI API usage | Monthly | Grows with users | Behind the Premium paywall |
| Texas Public Information Report | Yearly | $0 | Due May 15, even with zero revenue |

Amounts without a number depend on the provider you pick; check current pricing when you sign up.

## Risks and open decisions

**Risks**

| Risk | Impact | What to do |
| --- | --- | --- |
| Visa rules limit your role in the company | Could block the whole plan or force a different structure | Attorney consult before forming anything |
| Employer IP or conflict-of-interest clause | Employer could claim the app or object to it | Read the agreement, disclose if required, build only on personal equipment |
| Time, with a newborn and a December move | Dates slip | Hold the scope freeze; move dates rather than add features |
| D-U-N-S or store verification delays | Store launch slips past March | Request D-U-N-S the day the EIN arrives; web beta keeps momentum |
| Data breach or leak of financial data | Loss of trust, legal exposure | Security checklist, no data in logs, backups, least-privilege access |
| AI costs grow faster than revenue | Losses per user | AI only in Premium, spending cap, cheap default model, caching |
| Store rejection | Launch slips by days to weeks | Demo account, matching privacy answers, working links |

**Open decisions**

- [ ] Company structure and tax election, after the attorney and CPA weigh in.
- [ ] Sign-in methods: email plus Sign in with Apple, or also Google sign-in.
- [ ] Which TrackSpense domain to buy (.com or .app).
- [ ] Premium price points before store submission.
- [ ] Whether the web beta takes payments or stays free until store launch.
- [ ] When to file trademarks.

## Master checklist

**Clearance (now)**

- [ ] Immigration attorney consult, with the four questions above
- [ ] Employer IP, outside-activity, and conflict-of-interest check
- [ ] CPA consult on LLC tax treatment

**Brand (November)**

- [ ] Texas SOSDirect name search and USPTO search for Cerebroos and TrackSpense
- [ ] Buy cerebroos.com and a TrackSpense domain
- [ ] Business email with support, privacy, legal, and billing aliases; SPF, DKIM, DMARC
- [ ] Claim social handles
- [ ] Password manager vault and two-factor on every account
- [ ] cerebroos.com page and TrackSpense landing page with waitlist

**Product (November to December)**

- [ ] Staging and production environments
- [ ] Managed Postgres with backups and point-in-time recovery
- [ ] Secrets moved to Secret Manager; old keys rotated
- [ ] Rate limiting, CORS, no data in logs
- [ ] Sign in with Apple, if any third-party sign-in exists
- [ ] In-app account deletion plus a web deletion page
- [ ] Privacy Policy and Terms of Service live
- [ ] Crash reporting, uptime check, analytics, budget alerts
- [ ] Web beta live on January 1

**Company (January)**

- [ ] Texas LLC Form 205 filed
- [ ] Operating agreement signed
- [ ] EIN
- [ ] D-U-N-S requested the same day
- [ ] Business bank account, phone, virtual address

**Stores (late January to March)**

- [ ] Apple Developer Program as Cerebroos LLC; Paid Apps agreement, tax, banking
- [ ] Apple Small Business Program
- [ ] Google Play organization account; payments profile, website verification
- [ ] Expo organization; bundle and package IDs set
- [ ] Subscriptions set up in both stores and the subscriptions service
- [ ] Listings, screenshots, keywords, demo account
- [ ] App Privacy label, Data safety form, Financial features declaration
- [ ] TestFlight and closed testing with the beta cohort
- [ ] Submit for review; staged rollout on Google Play
- [ ] Product Hunt and build-in-public launch posts

## Sources

- [Apple: enrolling an organization](https://developer.apple.com/programs/enroll/?product=WM)
- [Apple: D-U-N-S number](https://developer.apple.com/support/D-U-N-S/)
- [Google Play closed testing requirement (ExtendsClass)](https://extendsclass.com/blog/google-plays-closed-testing-requirement-what-developers-need-to-know-in-2026)
- [Google Play: Financial features declaration](https://support.google.com/googleplay/android-developer/answer/13849271?hl=en)
- [Google Play account deletion requirement (9to5Google)](https://9to5google.com/?p=563006)
- [Small Business Program fees (RevenueCat)](https://www.revenuecat.com/blog/engineering/small-business-program)
- [Texas LLC fees (Zenind)](https://www.zenind.com/help/post/cost-to-start-a-texas-llc-state-fees-franchise-tax-and-hidden-expenses)
- [Texas LLC filing steps (RunSensible)](https://forms.runsensible.com/?p=27766)
- [Side projects on H-1B (f1jobs)](https://www.f1jobs.io/resources/blog/moonlighting-side-project-risk-h1b-visa)

# TrackSpense policy release checks

The public HTML in `varavu_selavu_app/privacy_policy.html` and `varavu_selavu_app/terms_of_service.html` is the product policy copy. It applies to TrackSpense, while `cerebroos.com/privacy` and `/terms` cover the parent marketing website. This file is internal and must not be served as policy text.

## Confirmed for this revision

- Owner says TrackSpense is currently free, with no paid plan or in-app purchase.
- Use `cerebroos@gmail.com` for TrackSpense terms and privacy questions, as on the parent site.
- The operator is a Minnesota sole proprietor, has no registered LLC, and does not want a personal name in public policies. Neither product policy claims an LLC exists.
- Keep the product age rule at 18, distinct from the general-audience CerebroOS marketing website.
- Product analytics and crash reporting are separate optional choices from marketing-site analytics. Web GA4 and mobile Firebase have release gates; source alone does not prove the deployed configuration.
- Product support messages are delivered through Gmail SMTP; account and financial records are in the product backend, unlike CerebroOS marketing-site form submissions.
- Web login, registration, footer, profile, and consent links, plus mobile login, registration, About, and privacy controls, already open the backend's `/privacy-policy` and `/terms-of-service` routes. `main.py` serves the two HTML files in this revision; the production web build points at `https://trackspense-api.cerebroos.com`.

## Check before deployment

1. **Operator identity.** Minnesota's [assumed-name guidance](https://www.sos.mn.gov/business-liens/business-forms-fees/assumed-namedba/) says a person conducting business under a name other than their true full name must file. The owner has said no assumed-name filing exists. If EU/UK privacy law applies to the product, controller identification and other disclosures need review; see [GDPR Article 13](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) and [ICO notice guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/). Omitting a personal name from policy text does not settle these obligations.
2. **Retention operations.** The owner does not know the configured Google Analytics/Firebase retention or database backup period. The public text uses provider settings rather than an invented duration. Verify those settings and maintain a working 12-month deletion routine for product support/feedback emails before promising that practice. [Firebase's privacy page](https://firebase.google.com/support/privacy/) describes Crashlytics retention separately.
3. **AI provider configuration.** The backend supports Gemini, optional OpenAI, and a local model for Ask; receipt and categorization fallback use Gemini. Confirm the deployed model allowlist, Gemini API plan, and each provider's applicable data use, model-training, and retention terms. The public text makes no unverified provider-specific promise. Review `services/chat_service.py`, `services/receipt_service.py`, and `docs/INFRASTRUCTURE.md`.
4. **Analytics release.** Verify the actual deployed web and mobile consent gates, collection, payload minimization, and withdrawal. `docs/analytics/privacy.md` and `docs/analytics/mobile.md` list remaining evidence, including a historical GA review for group identifiers. The privacy policy must be updated if the deployed setup differs.
5. **Account deletion and shared records.** Reconfirm active-database deletion, group anonymization, exports, backup behavior, and connected-assistant retention against the released backend. See `auth/service.py`, `services/account_export_service.py`, and `docs/mcp-local-implementation.md`.
6. **Product release date.** The HTML says "Last updated: November 26, 2026." Set that to the actual release date if deployed later. Deployment, app-store submissions, and production writes are separate actions.
7. **Cross-links.** The product pages link to `cerebroos.com/terms` and `/privacy`; those marketing-site pages are staged locally and may still show placeholders in production. Release together or verify the links point to published final pages before deploying the product policy update.

The product policies avoid an unsupported India governing-law clause, an unregistered LLC claim, and exact vendor-retention promises that have not been verified. They do not constitute a legal conclusion that worldwide offering requirements are satisfied.

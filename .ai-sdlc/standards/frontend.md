# Frontend standard (web + mobile)

**Web** `varavu_selavu_ui/`: React 19 (CRA), MUI 7, TanStack Query, react-router 6, Plotly. **Mobile** `varavu_selavu_mobile/`: Expo SDK 57 / RN 0.86, React Navigation 7, TanStack Query.

## Rules
- Theme and tokens come from `src/theme.ts` (`cerebroTokens`, `withAlpha`, `directionalColor`, `tabularNums`); no new hard-coded colours or font sizes in components.
- Server state is TanStack Query. After creating/changing expenses outside the owning page call `refreshExpenseViews(queryClient)` (`utils/expenseEvents.ts`) and add new expense-derived query roots to its list.
- API access only through `src/api/*`; errors handled via `ApiError` (see `LoginPage`); AI gating errors via `aiErrorFromResponse`.
- Gated features use the `use*Enabled` hooks; never render a flagged surface from a hard-coded condition.
- Forms: `noValidate` + explicit validation with an announced error (`role="alert"`), `autoComplete` set, labels via MUI `label`. Use `PasswordField`, `SegmentedTabs`, `FormSheet`, `ConfirmDialog` instead of re-implementing.
- Overlays: Dialog on desktop, Drawer-as-sheet on phones; both named and `role="dialog"` (see accessibility.md). Mount heavy overlays lazily.
- Every routed page has one `<h1>` and a title in `components/common/RouteA11y.tsx`.
- Money/dates only through `utils/money.ts`, `utils/date.ts`; never format money inline.
- Unit tests beside the code (`*.test.tsx`, Jest + RTL); query by role/name, not by class.

## Mobile specifics
Navigate to a tab from outside `MainTabs` via `navigate('MainTabs', { screen, params })`. Bearer auth with `credentials: 'omit'`. Native a11y props (`accessibilityLabel`, `accessibilityRole`, `accessibilityState`) replace ARIA. OCR runs on-device through the local `receipt-ocr` module. Verify layout on a native build — web preview alone has missed native layout bugs.

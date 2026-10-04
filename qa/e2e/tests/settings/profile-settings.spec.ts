import { test, expect } from '../../fixtures/auth.fixture';
import { AccountSettingsPage } from '../../pages/AccountSettingsPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';

test.describe('profile settings @regression', () => {
  // Serial: both name-change tests write the shared primary persona's single `name` field
  // — running them concurrently races (whichever write lands last wins, so the other
  // test's reload-check can flakily see the wrong value). Same reasoning as
  // dashboard.spec.ts's serial config.
  test.describe.configure({ mode: 'serial' });

  test('a name change persists after reload', async ({ page }) => {
    const account = new AccountSettingsPage(page);
    const newName = qaLabel(`Name_${uniqueSuffix()}`);
    await account.goto();
    await account.updateName(newName);
    await account.expectSuccessToast();

    await page.reload();
    await expect(account.nameField).toHaveValue(newName, { timeout: 10_000 });
  });

  test('a name change persists after logging back in', async ({ page }) => {
    const account = new AccountSettingsPage(page);
    const newName = qaLabel(`Persisted_${uniqueSuffix()}`);
    await account.goto();
    await account.updateName(newName);
    await account.expectSuccessToast();

    // Let /dashboard finish loading before the reload: interrupting an in-flight load with
    // page.reload() intermittently crashed headless Firefox ("Page crashed"), locally and in
    // CI. Settled reloads never did (8/8). Not an app bug: nobody reloads mid-navigation.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await account.goto();
    await expect(account.nameField).toHaveValue(newName, { timeout: 10_000 });
  });

  test('the email field is read-only', async ({ page }) => {
    const account = new AccountSettingsPage(page);
    await account.goto();
    // MUI's InputProps={{readOnly:true}} leaves the field enabled-but-uneditable, so
    // toBeDisabled() would wrongly pass/fail here — toBeEditable() covers both disabled
    // and readonly.
    await expect(page.getByLabel('Email', { exact: true })).not.toBeEditable();
  });
});

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

    await page.goto('/dashboard');
    await page.reload();
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

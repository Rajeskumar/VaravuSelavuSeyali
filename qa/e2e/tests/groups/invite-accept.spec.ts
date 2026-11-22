import { test, expect } from '../../fixtures/auth.fixture';
import { GroupsPage } from '../../pages/GroupsPage';
import { qaLabel, uniqueSuffix } from '../../helpers/test-data.helper';
import { getPublicConfig } from '../../helpers/api.helper';
import { env } from '../../helpers/env';
import * as path from 'path';

// Backlog B-12 (UAT-GRP-012). The signed-out half stops at the sign-in prompt (no real login: the
// suite's login budget is spent); the accept half uses the secondary persona's saved session.
test.describe('group invite links (UI) @regression', () => {
  test.beforeAll(async () => {
    const config = await getPublicConfig();
    test.skip(!config.groups_enabled, 'GROUPS_ENABLED is off in this environment — see qa/README.md.');
  });

  async function groupWithOpenSeat(primaryApi: any) {
    const group = await primaryApi.createGroup({ name: qaLabel(`ui_invite_${uniqueSuffix()}`) });
    const seat = await primaryApi.post(`/api/v1/groups/${group.group_id}/members`, { data: { display_name: 'Seat For Invite' } });
    expect(seat.ok(), await seat.text()).toBeTruthy();
    const { member_id } = await seat.json();
    const invite = await primaryApi.post(`/api/v1/groups/${group.group_id}/invites`, { data: { member_id } });
    expect(invite.ok(), await invite.text()).toBeTruthy();
    const { token } = await invite.json();
    return { group, token: token as string };
  }

  test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('a valid link asks the person to log in and remembers the invite', async ({ page, primaryApi }) => {
      const { token } = await groupWithOpenSeat(primaryApi);
      await page.goto(`/groups/join/${token}`);
      await expect(page.getByRole('heading', { name: 'Log in to accept this invite' })).toBeVisible({ timeout: 15_000 });
      expect(await page.evaluate(() => sessionStorage.getItem('vs_pending_invite_token'))).toBe(token);
      await page.getByRole('button', { name: 'Go to Login' }).click();
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test('opening the link while signed in joins the group and lands on it', async ({ browser, primaryApi }) => {
    const { group, token } = await groupWithOpenSeat(primaryApi);
    const context = await browser.newContext({ baseURL: env.BASE_URL, storageState: path.resolve(__dirname, '..', '..', 'auth', 'secondary.json') });
    const page = await context.newPage();
    await page.goto(`/groups/join/${token}`);
    await expect(page).toHaveURL(new RegExp(`/groups/${group.group_id}`), { timeout: 20_000 });
    const groups = new GroupsPage(page);
    await groups.expectGroupVisible(group.name);
    await context.close();
  });

  test('an unknown invite link shows an error, not a join', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: env.BASE_URL, storageState: path.resolve(__dirname, '..', '..', 'auth', 'secondary.json') });
    const page = await context.newPage();
    await page.goto('/groups/join/this-token-does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/groups\/join\//);
    await expect(page.getByText('Joining group…')).toHaveCount(0);
    await context.close();
  });
});

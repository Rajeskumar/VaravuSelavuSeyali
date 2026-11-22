import { test, expect } from '../../fixtures/auth.fixture';
import { dismissCookieConsent } from '../../helpers/responsive.helper';

// Backlog B-16 (UAT-MCP-001/002), browser half. A real OAuth round trip needs the backend started
// with MCP_ENABLED and a scripted MCP client (not in CI yet), so the server is stubbed here: the
// config says MCP is on and the /mcp endpoints return fixed data. This covers what the person
// sees and does on the approval and management pages; backend `test_mcp*` covers the server side.
const FLAGS = { groups_enabled: true, entity_resolution_enabled: false, budgets_enabled: true, card_coach_enabled: true, tags_enabled: true, ai_enabled: false, mcp_enabled: true };

test.describe('assistant approval and management pages (UI, stubbed server) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/config', (route) => route.fulfill({ json: FLAGS }));
  });

  test('a duplicate warning must be acknowledged before approving, and approving does not save', async ({ page }) => {
    const draft = {
      status: 'pending_approval', approval_revision: 2, expires_at: new Date(Date.now() + 600_000).toISOString(),
      connection_name: 'QA Assistant',
      preview: { description: 'Lunch', amount: '12.34', currency: 'USD', date: '2026-11-20', category_id: 'food_drink.dining_out' },
      warnings: [{ code: 'possible_duplicate' }],
      possible_duplicates: [{ id: 'd1', date: '2026-11-20', amount: '12.34', currency: 'USD' }],
    };
    const posts: any[] = [];
    await page.route('**/api/v1/mcp/approvals/op_qa_1', async (route) => {
      if (route.request().method() === 'POST') {
        posts.push(JSON.parse(route.request().postData() || '{}'));
        await route.fulfill({ json: { ...draft, status: 'approved' } });
      } else {
        await route.fulfill({ json: draft });
      }
    });

    await page.goto('/ai/approve/op_qa_1');
    await dismissCookieConsent(page);
    const approve = page.getByRole('button', { name: 'Approve expense' });
    await expect(approve).toBeDisabled({ timeout: 15_000 });
    await page.getByRole('checkbox', { name: /I reviewed the warnings/ }).check();
    await expect(approve).toBeEnabled();
    await approve.click();

    await expect(page.getByText(/Approved, not saved yet/)).toBeVisible();
    expect(posts).toEqual([{ approve: true, approval_revision: 2, acknowledge_warnings: true }]);
  });

  test('an expired request offers no Approve button', async ({ page }) => {
    await page.route('**/api/v1/mcp/approvals/op_qa_2', (route) => route.fulfill({ json: { status: 'expired', approval_revision: 1 } }));
    await page.goto('/ai/approve/op_qa_2');
    await expect(page.getByText(/request is expired/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Approve expense' })).toHaveCount(0);
  });

  test('connected assistants can be listed and disconnected one at a time', async ({ page }) => {
    let connections = [
      { id: 'c1', client_name: 'Assistant One', scopes: ['categories:read'], status: 'active', expires_at: new Date(Date.now() + 86_400_000).toISOString() },
      { id: 'c2', client_name: 'Assistant Two', scopes: ['categories:read'], status: 'active', expires_at: new Date(Date.now() + 86_400_000).toISOString() },
    ];
    const deleted: string[] = [];
    await page.route('**/api/v1/mcp/connections', (route) => route.fulfill({ json: connections }));
    await page.route('**/api/v1/mcp/activity', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/v1/mcp/connections/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        const id = route.request().url().split('/').pop() as string;
        deleted.push(id);
        connections = connections.filter((c) => c.id !== id);
        await route.fulfill({ json: {} });
      } else await route.continue();
    });

    await page.goto('/account/assistants');
    await dismissCookieConsent(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Connected assistants');
    await expect(page.getByText('Assistant One', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Assistant Two', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /disconnect/i }).first().click();
    await expect(page.getByText('Assistant One', { exact: true })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText('Assistant Two', { exact: true })).toBeVisible();
    expect(deleted).toEqual(['c1']);
  });
});

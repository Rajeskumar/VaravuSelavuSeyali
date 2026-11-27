import { listAllExpenses, monthToDateRange } from './expenses';

const mockApiFetch = jest.fn();
jest.mock('../../../core/api/apiFetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('listAllExpenses', () => {
  it('fetches 500-item pages and follows next_offset so older months load', async () => {
    mockApiFetch
      .mockResolvedValueOnce(okJson({
        items: [
          { row_id: 1, date: '11/10/2026', description: 'Recent', category: 'Food', cost: 12 },
          { row_id: 2, date: '08/01/2026', description: 'Summer', category: 'Food', cost: 20 },
        ],
        next_offset: 500,
      }))
      .mockResolvedValueOnce(okJson({
        items: [
          { row_id: 2, date: '08/01/2026', description: 'Summer', category: 'Food', cost: 20 },
          { row_id: 3, date: '03/15/2026', description: 'March expense', category: 'Travel', cost: 99 },
        ],
        next_offset: null,
      }));

    const items = await listAllExpenses('tok', 'u@test.com', ['t1']);
    expect(items.map((i) => i.row_id)).toEqual([1, 2, 3]);
    expect(items[2].date).toBe('03/15/2026');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch.mock.calls[0][0]).toContain('offset=0&limit=500');
    expect(mockApiFetch.mock.calls[0][0]).toContain('tag_ids=t1');
    expect(mockApiFetch.mock.calls[1][0]).toContain('offset=500&limit=500');
  });

  it('stops at maxPages even if next_offset keeps advancing', async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      const m = /offset=(\d+)/.exec(url);
      const off = Number(m?.[1] ?? 0);
      return okJson({
        items: [{ row_id: off + 1, date: '01/01/2026', description: `Row ${off}`, category: 'Food', cost: 1 }],
        next_offset: off + 2,
      });
    });

    const items = await listAllExpenses('tok', 'u@test.com', undefined, 2, 3);
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(items.map((i) => i.row_id)).toEqual([1, 3, 5]);
  });

  it('sends start_date and end_date when a month dateRange is passed', async () => {
    mockApiFetch.mockResolvedValueOnce(okJson({ items: [], next_offset: null }));
    await listAllExpenses('tok', 'u@test.com', undefined, 500, 10, monthToDateRange('2026-03'));
    expect(mockApiFetch.mock.calls[0][0]).toContain('start_date=2026-03-01');
    expect(mockApiFetch.mock.calls[0][0]).toContain('end_date=2026-03-31');
  });
});

describe('monthToDateRange', () => {
  it('computes exact month boundaries including leap-year February and returns undefined for All time', () => {
    expect(monthToDateRange('')).toBeUndefined();
    expect(monthToDateRange('2026-03')).toEqual({ startDate: '2026-03-01', endDate: '2026-03-31' });
    expect(monthToDateRange('2024-02')).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' });
    expect(monthToDateRange('2026-02')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' });
  });
});

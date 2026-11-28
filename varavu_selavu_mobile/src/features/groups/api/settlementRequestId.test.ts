import { recordSettlement as record } from './groups';
import { apiFetch } from '../../../core/api/apiFetch';
import { RequestError } from '../../../core/api/request';

jest.mock('../../../core/api/apiFetch', () => ({ apiFetch: jest.fn() }));

const send = apiFetch as jest.Mock;
const ok = () => ({ ok: true, status: 201, json: async () => ({ id: 's1' }) });
const refused = () => ({ ok: false, status: 400, json: async () => ({ detail: 'no' }), text: async () => '{"detail":"no"}' });

const ids = () => send.mock.calls.map((c: any[]) => JSON.parse(c[1].body).request_id);
const pay = (amount = 20) => record('g1', { from_member_id: 'a', to_member_id: 'b', amount });

describe('settle-up request id (TS-FIX-104)', () => {
  beforeEach(() => { send.mockReset(); send.mockImplementation(async () => ok()); });

  it('sends a well-formed id, and a new one for each recorded payment', async () => {
    await pay();
    await pay();
    expect(ids()[0]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(ids()[1]).not.toBe(ids()[0]);
  });

  it('reuses the id when the same payment is sent again after an unknown outcome', async () => {
    send.mockImplementationOnce(async () => { throw new RequestError('timed out', true); });
    await expect(pay(31)).rejects.toThrow('timed out');
    await pay(31);
    await pay(31);
    const [first, retry, next] = ids();
    expect(retry).toBe(first);
    expect(next).not.toBe(first);
  });

  it('uses a new id for a different payment while one is unconfirmed', async () => {
    send.mockImplementationOnce(async () => { throw new RequestError('timed out', true); });
    await expect(pay(41)).rejects.toThrow();
    await pay(42);
    expect(ids()[1]).not.toBe(ids()[0]);
  });

  it('uses a new id after the server refuses the payment', async () => {
    send.mockImplementationOnce(async () => refused());
    await expect(pay(51)).rejects.toThrow();
    await pay(51);
    expect(ids()[1]).not.toBe(ids()[0]);
  });

  it('forgets an unconfirmed id after an hour', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    send.mockImplementationOnce(async () => { throw new RequestError('timed out', true); });
    await expect(pay(61)).rejects.toThrow();
    now.mockReturnValue(1_000_000 + 3_600_001);
    await pay(61);
    expect(ids()[1]).not.toBe(ids()[0]);
    now.mockRestore();
  });

  // A refusal of the retry says nothing about the first send, which may have been saved.
  it.each([
    ['offline', () => { throw new RequestError('You are offline', false); }],
    ['rate limited', () => ({ ...refused(), status: 429 })],
    ['signed out', () => ({ ...refused(), status: 401 })],
  ])('keeps an unconfirmed id when a retry fails because the person is %s', async (_name, failure) => {
    const amount = 70 + send.mock.calls.length + Math.floor(Math.random() * 1000);
    send.mockImplementationOnce(async () => { throw new RequestError('timed out', true); });
    send.mockImplementationOnce(async () => failure());
    await expect(pay(amount)).rejects.toThrow();
    await expect(pay(amount)).rejects.toThrow();
    await pay(amount);
    expect(ids()[2]).toBe(ids()[0]);
    expect(ids()[1]).toBe(ids()[0]);
  });

  it('keeps the id after a server error', async () => {
    send.mockImplementationOnce(async () => ({ ...refused(), status: 503 }));
    await expect(pay(81)).rejects.toThrow();
    await pay(81);
    expect(ids()[1]).toBe(ids()[0]);
  });

  it('gives two sends of one payment at the same moment the same id', async () => {
    await Promise.all([pay(91), pay(91)]);
    expect(ids()[1]).toBe(ids()[0]);
  });

  it('still keeps the id when one of two simultaneous sends is refused and the other is unknown', async () => {
    let failLater: () => void = () => {};
    send.mockImplementationOnce(async () => refused());
    send.mockImplementationOnce(() => new Promise((_resolve, reject) => { failLater = () => reject(new RequestError('timed out', true)); }));
    const first = pay(95).catch(() => {});
    const second = pay(95).catch(() => {});
    await first;
    failLater();
    await second;
    await pay(95);
    expect(ids()[2]).toBe(ids()[1]);
  });
});

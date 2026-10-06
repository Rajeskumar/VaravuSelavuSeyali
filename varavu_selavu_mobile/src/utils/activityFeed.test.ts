import { relativeShort, describeGroupActivity, mergeFeed, FeedItem } from './activityFeed';

const NOW = new Date('2026-09-19T12:00:00Z');
const nameFor = (id: string | null) => (id === 'm1' ? 'Suresh' : 'Someone');
const act = (action: string, payload: any = {}, actor: string | null = 'm1') => ({
  id: 'a1', action, actor_member_id: actor, entity_id: null, payload, created_at: '2026-09-19T11:58:00Z',
});

describe('relativeShort', () => {
  it('buckets into now / minutes / hours / days', () => {
    expect(relativeShort(new Date('2026-09-19T11:59:40Z'), NOW)).toBe('now');
    expect(relativeShort(new Date('2026-09-19T11:58:00Z'), NOW)).toBe('2m');
    expect(relativeShort(new Date('2026-09-19T11:00:00Z'), NOW)).toBe('1h');
    expect(relativeShort(new Date('2026-09-17T12:00:00Z'), NOW)).toBe('2d');
  });

  it('marks future dates', () => {
    expect(relativeShort(new Date('2026-09-22T12:00:00Z'), NOW)).toBe('in 3d');
  });
});

describe('describeGroupActivity', () => {
  it('describes an added expense with its amount', () => {
    const f = describeGroupActivity(act('expense_created', { description: 'Hotel Marriott', amount: 412 }), 'IndiaTrip', nameFor)!;
    expect(f.title).toBe('Suresh added “Hotel Marriott” to IndiaTrip');
    expect(f.body).toBe('$412.00');
    expect(f.tone).toBe('cyan');
  });

  it('describes a settlement as a green payment', () => {
    const f = describeGroupActivity(act('settlement_created', { amount: 120 }), 'RSJ', nameFor)!;
    expect(f.tone).toBe('green');
    expect(f.body).toBe('$120.00');
  });

  it('uses the joining member’s own name, not the actor', () => {
    const f = describeGroupActivity(act('member_joined', { display_name: 'Jay' }), 'RSJ', nameFor)!;
    expect(f.title).toBe('Jay joined RSJ');
  });

  it('says who paid whom when the settlement carries both members', () => {
    const names = (id: string | null) => (id === 'm1' ? 'You' : id === 'm2' ? 'Alex' : 'Someone');
    const f = describeGroupActivity(act('settlement_created', { amount: 10, from_member_id: 'm2', to_member_id: 'm1' }), 'RSJ', names)!;
    expect(f.title).toBe('Alex paid you in RSJ');
  });

  it('describes a name-only seat as added, not joined', () => {
    const f = describeGroupActivity(act('member_added', { display_name: 'Alex', user_email: null }), 'RSJ', nameFor)!;
    expect(f.title).toBe('Suresh added Alex to RSJ');
  });

  it('drops noise actions', () => {
    expect(describeGroupActivity(act('group_updated'), 'RSJ', nameFor)).toBeNull();
    expect(describeGroupActivity(act('something_new'), 'RSJ', nameFor)).toBeNull();
  });
});

describe('mergeFeed', () => {
  const item = (id: string, iso: string): FeedItem => ({ id, title: id, at: new Date(iso), tone: 'muted' });

  it('orders newest first across sources', () => {
    const merged = mergeFeed(
      [item('old', '2026-09-01T00:00:00Z')],
      [item('new', '2026-09-18T00:00:00Z'), item('mid', '2026-09-10T00:00:00Z')],
    );
    expect(merged.map((m) => m.id)).toEqual(['new', 'mid', 'old']);
  });

  it('keeps input order for identical timestamps', () => {
    const merged = mergeFeed([item('a', '2026-09-01T00:00:00Z'), item('b', '2026-09-01T00:00:00Z')]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

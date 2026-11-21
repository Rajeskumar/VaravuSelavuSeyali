import { toApiHistory } from './chatHistory';

describe('toApiHistory', () => {
  it('passes a normal conversation through unchanged', () => {
    expect(toApiHistory([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ])).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
  });

  it('drops an error bubble and the question that failed', () => {
    expect(toApiHistory([
      { role: 'user', content: 'when did I renew porkbun?' },
      { role: 'assistant', content: '❌ Error: CSRF token missing or invalid', isError: true },
      { role: 'user', content: 'when did I renew porkbun?' },
    ])).toEqual([{ role: 'user', content: 'when did I renew porkbun?' }]);
  });

  it('keeps earlier good turns around a failure', () => {
    expect(toApiHistory([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'limit reached', isError: true },
      { role: 'user', content: 'q3' },
    ])).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q3' },
    ]);
  });
});

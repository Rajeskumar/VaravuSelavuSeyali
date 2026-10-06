import { register } from './auth';

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

const payload = { name: 'A', email: 'a@b.co', password: 'longenough' };

test('a 422 becomes per-field messages, so the form can say which field is wrong', async () => {
  mockFetch(422, {
    detail: [
      { loc: ['body', 'email'], msg: 'value is not a valid email address' },
      { loc: ['body', 'password'], msg: 'String should have at least 8 characters' },
      { loc: ['body', 'email'], msg: 'second email message is ignored' },
    ],
  });
  await expect(register(payload)).rejects.toMatchObject({
    status: 422,
    fieldErrors: {
      email: expect.stringMatching(/isn't valid/i),
      password: expect.stringMatching(/at least 8/i),
    },
  });
});

test('a 400 stays generic — it must not reveal whether the email is taken', async () => {
  mockFetch(400, { detail: 'Unable to complete registration' });
  const err: any = await register(payload).catch((e) => e);
  expect(err.status).toBe(400);
  expect(err.fieldErrors).toBeUndefined();
  expect(err.message).toBe('Registration failed');
});

test('a 422 with an unreadable body still rejects with the status', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, json: async () => { throw new Error('bad json'); } }) as unknown as typeof fetch;
  await expect(register(payload)).rejects.toMatchObject({ status: 422 });
});

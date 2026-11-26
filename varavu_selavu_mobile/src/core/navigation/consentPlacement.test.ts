import { readFileSync } from 'fs';
import { resolve } from 'path';

const src = readFileSync(resolve(__dirname, 'RootNavigator.tsx'), 'utf8');

test('the consent sheet is mounted once at the root, for signed-out and signed-in users alike', () => {
  expect(src.match(/<ConsentPrompt \/>/g)).toHaveLength(1);
  const switchAt = src.indexOf('{accessToken ? signedIn : <AuthStack />}');
  expect(switchAt).toBeGreaterThan(-1);
  expect(src.indexOf('<ConsentPrompt />')).toBeGreaterThan(switchAt);                 // rendered beside the auth switch,
  const signedInStart = src.indexOf('const signedIn =');
  expect(src.indexOf('<ConsentPrompt />')).toBeGreaterThan(src.indexOf('</>,', signedInStart)); // not inside the signed-in tree
});

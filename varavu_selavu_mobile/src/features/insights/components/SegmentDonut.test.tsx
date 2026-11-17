import React from 'react';
import { render } from '@testing-library/react-native';
import SegmentDonut from './SegmentDonut';

// Real dark theme (not a hand-rolled stub) so a missing token fails here.
jest.mock('../../../core/theme/ThemeContext', () => {
  const { buildTheme: build } = jest.requireActual('../../../core/theme/theme');
  return { useAppTheme: () => ({ theme: build('dark'), mode: 'dark', isDark: true }) };
});

describe('SegmentDonut', () => {
  it('renders the centre total and label', () => {
    const { getByText } = render(
      <SegmentDonut
        segments={[{ key: 'a', pct: 60, color: '#fff' }, { key: 'b', pct: 40, color: '#000' }]}
        centerValue="$2,401"
      />,
    );
    expect(getByText('$2,401')).toBeTruthy();
    expect(getByText('TOTAL')).toBeTruthy();
  });
});

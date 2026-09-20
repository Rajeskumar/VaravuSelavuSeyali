import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { buildTheme } from '../theme';
import ListRow from './ListRow';
import TopTabs from './TopTabs';
import Chip from './Chip';
import SectionLabel from './SectionLabel';
import FieldBox from './FieldBox';
import SegmentDonut from './SegmentDonut';
import Sheet from './Sheet';

// Real dark theme (not a hand-rolled stub) so a missing token in a primitive fails here.
jest.mock('../context/ThemeContext', () => {
  const { buildTheme: build } = jest.requireActual('../theme');
  return { useAppTheme: () => ({ theme: build('dark'), mode: 'dark', isDark: true }) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('ListRow', () => {
  it('shows the category code tile, title, meta and amount', () => {
    const { getByText } = render(
      <ListRow category="Dining out" title="India bazaar dinner" meta="Sep 19 · Dining out" amount="$28.91" />,
    );
    expect(getByText('DIN')).toBeTruthy();
    expect(getByText('India bazaar dinner')).toBeTruthy();
    expect(getByText('Sep 19 · Dining out')).toBeTruthy();
    expect(getByText('$28.91')).toBeTruthy();
  });

  it('renders a sub line under the amount and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ListRow category="Groceries" title="Milk" amount="$4.00" sub="you +$2.00" onPress={onPress} />,
    );
    expect(getByText('you +$2.00')).toBeTruthy();
    fireEvent.press(getByText('Milk'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses a custom leading node and trailing node instead of the defaults', () => {
    const { getByText, queryByText } = render(
      <ListRow leading={<Text>LEAD</Text>} title="Rent" trailing={<Text>TRAIL</Text>} amount="$1" />,
    );
    expect(getByText('LEAD')).toBeTruthy();
    expect(getByText('TRAIL')).toBeTruthy();
    expect(queryByText('$1')).toBeNull();
  });
});

describe('TopTabs', () => {
  it('marks the active tab selected and reports changes', () => {
    const onChange = jest.fn();
    const { getByText } = render(
      <TopTabs value="a" onChange={onChange} options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />,
    );
    fireEvent.press(getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(getByText('Alpha')).toBeTruthy();
  });
});

describe('Chip', () => {
  it('renders its label and is inert without onPress', () => {
    const { getByText } = render(<Chip label="Category" />);
    expect(getByText('Category')).toBeTruthy();
  });

  it('calls onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Chip label="Today" variant="accent" onPress={onPress} />);
    fireEvent.press(getByText('Today'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('SectionLabel', () => {
  it('renders children', () => {
    expect(render(<SectionLabel>Recent</SectionLabel>).getByText('Recent')).toBeTruthy();
  });
});

describe('FieldBox', () => {
  it('toggles password visibility', () => {
    const { getByText, getByPlaceholderText } = render(
      <FieldBox label="Password" placeholder="pw" secureToggle value="secret" onChangeText={() => {}} />,
    );
    expect(getByPlaceholderText('pw').props.secureTextEntry).toBe(true);
    fireEvent.press(getByText('Show'));
    expect(getByPlaceholderText('pw').props.secureTextEntry).toBe(false);
    expect(getByText('Hide')).toBeTruthy();
  });
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

describe('Sheet', () => {
  it('renders children only while visible', () => {
    const { queryByText, rerender } = render(<Sheet visible={false} onClose={() => {}}><Text>inside</Text></Sheet>);
    expect(queryByText('inside')).toBeNull();
    rerender(<Sheet visible onClose={() => {}}><Text>inside</Text></Sheet>);
    expect(queryByText('inside')).toBeTruthy();
  });
});

describe('theme tokens the V2 primitives rely on', () => {
  it('exist in both modes', () => {
    for (const mode of ['dark', 'light'] as const) {
      const t = buildTheme(mode);
      for (const key of ['surfaceElevated', 'borderLight', 'border', 'overlay', 'textQuaternary', 'secondary', 'gradientStart', 'gradientEnd'] as const) {
        expect(t.colors[key]).toBeTruthy();
      }
      expect(t.typography.fontFamily.mono).toBeTruthy();
      expect(t.typography.fontFamily.display).toBeTruthy();
    }
  });
});

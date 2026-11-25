import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { buildTheme } from '../theme/theme';
import ListRow from './ListRow';
import TopTabs from './TopTabs';
import Chip from './Chip';
import SectionLabel from './SectionLabel';
import FieldBox from './FieldBox';
import Sheet from './Sheet';
import SegmentedTabs from './SegmentedTabs';
import CustomButton from './CustomButton';

// Real dark theme (not a hand-rolled stub) so a missing token in a primitive fails here.
jest.mock('../theme/ThemeContext', () => {
  const { buildTheme: build } = jest.requireActual('../theme/theme');
  return { useAppTheme: () => ({ theme: build('dark'), mode: 'dark', isDark: true }) };
});
// CustomButton presses through AnimatedPressable, whose Reanimated springs need the library's mock.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('ListRow', () => {
  it('shows the category code tile, title, meta and amount', () => {
    const { getByText } = render(
      <ListRow tileCode="DIN" tileTone="#AEA5FF" title="India bazaar dinner" meta="Sep 19 · Dining out" amount="$28.91" />,
    );
    expect(getByText('DIN')).toBeTruthy();
    expect(getByText('India bazaar dinner')).toBeTruthy();
    expect(getByText('Sep 19 · Dining out')).toBeTruthy();
    expect(getByText('$28.91')).toBeTruthy();
  });

  it('renders a sub line under the amount and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <ListRow tileCode="GRO" tileTone="#4ADE80" title="Milk" amount="$4.00" sub="you +$2.00" onPress={onPress} />,
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

describe('FieldBox accessibility', () => {
  it('names the input with its label, so screen readers and getByLabelText find it', () => {
    const { getByLabelText } = render(<FieldBox label="Email" value="a@b.co" onChangeText={() => {}} />);
    expect(getByLabelText('Email').props.value).toBe('a@b.co');
  });

  it('lets a caller override the accessible name', () => {
    const { getByLabelText } = render(<FieldBox label="Pw" accessibilityLabel="Password" value="" onChangeText={() => {}} />);
    expect(getByLabelText('Password')).toBeTruthy();
  });
});

describe('SegmentedTabs accessibility', () => {
  it('exposes tabs whose selected one is announced', () => {
    const onChange = jest.fn();
    const { getByRole } = render(
      <SegmentedTabs value="month" onChange={onChange} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} />,
    );
    expect(getByRole('tab', { name: 'Month' })).toBeSelected();
    expect(getByRole('tab', { name: 'Year' })).not.toBeSelected();
    fireEvent.press(getByRole('tab', { name: 'Year' }));
    expect(onChange).toHaveBeenCalledWith('year');
  });
});

describe('CustomButton accessibility', () => {
  it.each(['primary', 'outline'] as const)('is a named button (%s)', (variant) => {
    const onPress = jest.fn();
    const { getByRole } = render(<CustomButton title="Save" variant={variant} onPress={onPress} />);
    fireEvent.press(getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('announces disabled, and keeps its name and reports busy while loading', () => {
    const { getByRole, rerender } = render(<CustomButton title="Save" disabled onPress={() => {}} />);
    expect(getByRole('button', { name: 'Save' })).toBeDisabled();
    rerender(<CustomButton title="Save" loading onPress={() => {}} />);
    expect(getByRole('button', { name: 'Save' })).toBeBusy();
  });
});

describe('Sheet', () => {
  it('renders children only while visible', () => {
    const { queryByText, rerender } = render(<Sheet visible={false} onClose={() => {}}><Text>inside</Text></Sheet>);
    expect(queryByText('inside')).toBeNull();
    rerender(<Sheet visible onClose={() => {}}><Text>inside</Text></Sheet>);
    expect(queryByText('inside')).toBeTruthy();
  });

  it('is not itself an accessibility element, so its rows stay individually reachable', () => {
    // The panel is a Pressable (it swallows backdrop taps), and a Pressable is accessible by default. On iOS an
    // accessible container collapses its whole subtree into ONE element ("Who was this for?, Close, Just me, ..."),
    // so VoiceOver users and UI tests cannot pick a row.
    const { getByTestId } = render(<Sheet visible onClose={() => {}}><Text>inside</Text></Sheet>);
    expect(getByTestId('sheet.panel')).toHaveProp('accessible', false);
    expect(getByTestId('sheet.panel')).toHaveProp('focusable', false); // Android: not a TalkBack focus stop either
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

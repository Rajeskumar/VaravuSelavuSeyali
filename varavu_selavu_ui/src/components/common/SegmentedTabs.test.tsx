import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import SegmentedTabs from './SegmentedTabs';

const options = ['equal', 'exact', 'percentage', 'shares', 'adjustment'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

test('long option lists wrap inside their container instead of running off a phone screen', () => {
  render(<SegmentedTabs value="equal" onChange={() => {}} options={options} ariaLabel="Split method" />);
  const group = screen.getByLabelText('Split method');
  const style = getComputedStyle(group);
  expect(style.flexWrap).toBe('wrap');
  expect(style.maxWidth).toBe('100%');
});

test('selecting a segment reports it and every label stays available', () => {
  const onChange = jest.fn();
  render(<SegmentedTabs value="equal" onChange={onChange} options={options} />);
  expect(screen.getAllByRole('button')).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Adjustment' }));
  expect(onChange).toHaveBeenCalledWith('adjustment');
});

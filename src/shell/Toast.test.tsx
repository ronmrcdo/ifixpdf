import {act, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useApp} from '../state/app';
import {Toast} from './Toast';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({matches: false})),
  );
  useApp.setState({toast: null});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const text = () => document.querySelector('.toast');

describe('Toast', () => {
  it('keeps both live regions mounted and puts the text in the region for its tone', () => {
    render(<Toast />);
    act(() => useApp.getState().notify('Saved'));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    act(() => useApp.getState().notify('Broke', 'error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Broke');
  });

  it('slides out for 160ms after its 4.5s, then leaves', () => {
    render(<Toast />);
    act(() => useApp.getState().notify('Saved'));
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(text()).toHaveClass('leaving');
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(text()).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('a new toast replaces the leaving one at once', () => {
    render(<Toast />);
    act(() => useApp.getState().notify('One'));
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    act(() => useApp.getState().notify('Two'));
    expect(text()).not.toHaveClass('leaving');
    expect(text()).toHaveTextContent('Two');
  });

  it('under reduced motion it leaves without a slide', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({matches: true})),
    );
    render(<Toast />);
    act(() => useApp.getState().notify('Saved'));
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(text()).toBeNull();
  });
});

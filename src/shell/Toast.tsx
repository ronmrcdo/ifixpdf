import {useEffect, useState} from 'react';
import {useApp} from '../state/app';
import {prefersReducedMotion} from './viewTransition';

const SHOWN_MS = 4500;
const SLIDE_OUT_MS = 160;

/** Two always-mounted live regions so screen readers hear every toast; only their text changes. */
export function Toast() {
  const toast = useApp((s) => s.toast);
  const [last, setLast] = useState(toast); // the toast on screen, kept for its slide-out after the store clears it
  if (toast && toast !== last) setLast(toast);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => useApp.setState({toast: null}), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (toast || !last) return;
    const timer = setTimeout(() => setLast(null), prefersReducedMotion() ? 0 : SLIDE_OUT_MS);
    return () => clearTimeout(timer);
  }, [toast, last]);
  const shown = toast ?? last;
  const show = (tone: 'info' | 'error') =>
    shown?.tone === tone && (
      <div key={shown.id} className={toast ? 'toast' : 'toast leaving'}>
        {shown.text}
      </div>
    );
  return (
    <>
      <div role="status" aria-live="polite">
        {show('info')}
      </div>
      <div role="alert">{show('error')}</div>
    </>
  );
}

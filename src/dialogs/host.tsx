import {create} from 'zustand';
import type {ExportSpec} from '../pdf/export';
import {PasswordDialog} from './PasswordDialog';
import {SplitDialog} from './SplitDialog';

interface PasswordTarget {
  name: string;
  bytes: Uint8Array;
}
interface SplitTarget {
  count: number;
  name: string;
  spec: ExportSpec;
}
type Active = ({kind: 'password'} & PasswordTarget) | ({kind: 'split'} & SplitTarget) | null;

// Holds which dialog is open and its document; never anything the user types.
export const useDialogs = create<{active: Active}>()(() => ({active: null}));
export const showPasswordDialog = (t: PasswordTarget) =>
  useDialogs.setState({active: {kind: 'password', ...t}});
export const showSplitDialog = (t: SplitTarget) =>
  useDialogs.setState({active: {kind: 'split', ...t}});
const close = () => useDialogs.setState({active: null});

export function DialogHost() {
  const active = useDialogs((s) => s.active);
  if (active?.kind === 'password') return <PasswordDialog file={active} onClose={close} />;
  if (active?.kind === 'split') return <SplitDialog {...active} onClose={close} />;
  return null;
}

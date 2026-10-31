import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Dialog} from '../components/Dialog';
import {protectedName} from '../domain/naming';
import {protectPdf} from '../pdf/export';
import {platform} from '../platform';
import {track} from '../state/work';

const MISMATCH = 'Passwords do not match. Enter the same password in both fields.';
const FAILED = 'Could not protect this PDF. Try a different unlocked PDF.';

// The passwords live only in this component's state: it unmounts on close, and nothing else reads them.
export function PasswordDialog({
  file,
  onClose,
}: {
  file: {name: string; bytes: Uint8Array};
  onClose(): void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus(), [savedName]);

  const mismatch = confirm !== '' && password !== confirm;
  const valid = password.length >= 8 && password === confirm;
  const type = show ? 'text' : 'password';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await track(
        (async () =>
          platform.saveAs(
            await protectPdf(file.bytes, password),
            protectedName(file.name),
            'pdf',
          ))(),
      );
      if (!saved) return setBusy(false); // cancelled: keep the form
      setPassword('');
      setConfirm('');
      setSavedName(saved.name);
    } catch {
      setError(FAILED);
      setBusy(false);
    }
  }

  if (savedName) {
    return (
      <Dialog title="Protected copy is ready" open onClose={onClose}>
        <div className="action-success">
          <p>Saved as {savedName}. The original PDF is unchanged.</p>
          <button ref={done} type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title="Add password" open onClose={onClose}>
      <form onSubmit={submit}>
        <p>
          Save a protected copy of <strong>{file.name}</strong>. A password will be required to open
          it.
        </p>
        <label className="field">
          <span>Password</span>
          <input
            type={type}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={64}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type={type}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            maxLength={64}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>Show passwords</span>
        </label>
        <small>
          Use at least 8 characters. Keep your password somewhere safe; iFixPDF does not store it.
        </small>
        <p className="action-error" role="alert">
          {mismatch ? MISMATCH : error}
        </p>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!valid || busy}>
            {busy ? 'Protecting PDF…' : 'Save protected copy'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

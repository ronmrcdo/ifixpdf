import {useEffect, useMemo, useRef, useState, type FormEvent} from 'react';
import {exclusive} from '../actions/save';
import {Dialog} from '../components/Dialog';
import {splitZipName} from '../domain/naming';
import {defaultSplitText, parseSplitGroups} from '../domain/ranges';
import {splitZip, type ExportSpec} from '../pdf/export';
import {platform} from '../platform';
import {documentStore} from '../state/workspaces';

const FAILED = 'Could not split this PDF. Try again.';
const plural = (n: number) => `${n} PDF${n === 1 ? '' : 's'}`;

export function SplitDialog({
  count,
  name,
  spec,
  onClose,
}: {
  count: number;
  name: string;
  spec: ExportSpec;
  onClose(): void;
}) {
  const [mode, setMode] = useState<'ranges' | 'every'>('ranges');
  const [text, setText] = useState(() => defaultSplitText(count));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [parts, setParts] = useState<{n: number; file: string} | null>(null);
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus(), [parts]);

  const plan = useMemo(() => {
    if (mode === 'every') return {groups: Array.from({length: count}, (_, i) => [i])};
    try {
      return {groups: parseSplitGroups(text, count)};
    } catch (e) {
      return {groups: null, message: e instanceof Error ? e.message : FAILED};
    }
  }, [mode, text, count]);
  const {groups} = plan;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!groups || busy) return;
    setBusy(true);
    setError('');
    await exclusive(documentStore, FAILED, async (_s, progress) => {
      try {
        const zip = await splitZip(spec, groups, name, progress);
        const saved = await platform.saveAs(zip, splitZipName(name), 'zip');
        if (saved) setParts({n: groups.length, file: saved.name});
      } catch {
        setError(FAILED);
      }
    });
    setBusy(false);
  }

  if (parts) {
    return (
      <Dialog title={`${plural(parts.n)} ready`} open onClose={onClose}>
        <div className="action-success">
          <p>Saved as {parts.file}. The original document is unchanged.</p>
          <button ref={done} type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title="Split PDF" open onClose={onClose}>
      <form onSubmit={submit}>
        <p>Create separate PDFs from the current page order. Your document stays unchanged.</p>
        <label className="field">
          <span>Split by</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value === 'every' ? 'every' : 'ranges')}
          >
            <option value="ranges">Page ranges</option>
            <option value="every">Every page</option>
          </select>
        </label>
        <label className="field" hidden={mode === 'every'}>
          <span>Ranges</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby="split-help"
          />
          <small id="split-help">
            Each comma creates a separate PDF. Example: 1-3, 4-6. Available pages: 1–{count}.
          </small>
        </label>
        <div className="split-results" aria-live="polite">
          {groups &&
            `${plural(groups.length)} · ${groups.reduce((n, g) => n + g.length, 0)} of ${count} pages included`}
        </div>
        <small>Save all parts together in one ZIP file.</small>
        <p className="action-error" role="alert">
          {plan.message ?? error}
        </p>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!groups || busy}>
            {busy ? 'Splitting PDF…' : 'Split & save ZIP'}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

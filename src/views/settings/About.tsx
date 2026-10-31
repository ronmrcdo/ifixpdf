import {useRef, useState} from 'react';
import {version} from '../../../package.json';
import eula from '../../../EULA.txt?raw';
import license from '../../../LICENSE?raw';
import {platform} from '../../platform';
import {useApp} from '../../state/app';
import {UpdatesRow} from '../../updates/UpdatesRow';

const REPO = 'https://github.com/ronmrcdo/ifixpdf';
const thirdParty = Object.entries(
  import.meta.glob<string>('/licenses/**/*', {query: '?raw', import: 'default'}),
);
const PLAIN_LABELS: Record<string, string> = {
  'npm-THIRD-PARTY': 'Open-source packages (app)',
  'rust-THIRD-PARTY': 'Open-source packages (Rust)',
  'linux-appimage-system-libraries': 'Linux AppImage system libraries',
};
const label = (path: string) => {
  const name = (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '').replace(/-LICENSE$/, '');
  return PLAIN_LABELS[name] ?? name;
};

/** Body loads on first open and renders as text, never HTML. */
export function LicenseItem({name, load}: {name: string; load: () => Promise<string>}) {
  const [text, setText] = useState<string | null>(null);
  const started = useRef(false);
  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open || started.current) return;
    started.current = true;
    load().then(setText, () => setText('Could not load this license.'));
  };
  return (
    <details onToggle={onToggle}>
      <summary>{name}</summary>
      {text !== null && <pre>{text}</pre>}
    </details>
  );
}

export function About() {
  return (
    <div className="about">
      <h2>About</h2>
      <div className="settings-row">
        <div className="about-id">
          <img
            className="brand-mark"
            src="/brand/ifixpdf-mark.svg"
            width={24}
            height={24}
            alt=""
            draggable={false}
          />
          <div>
            iFixPDF<p>Version {version}</p>
            <p>Developer: Ron Mercado</p>
          </div>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            platform
              .openUrl(REPO)
              .catch(() => useApp.getState().notify('Could not open the link.', 'error'))
          }
        >
          GitHub
        </button>
      </div>
      <UpdatesRow />
      <div className="settings-row">
        <div>
          Privacy<p className="about-privacy">{eula.split(/\r?\n\r?\n/)[0]}</p>
        </div>
      </div>
      <div className="settings-row about-legal">
        <div>
          License
          <LicenseItem name="MIT License" load={async () => license} />
        </div>
      </div>
      <div className="settings-row about-legal">
        <div className="about-licenses">
          Open-source licenses
          {thirdParty.map(([path, load]) => (
            <LicenseItem key={path} name={label(path)} load={load} />
          ))}
        </div>
      </div>
    </div>
  );
}

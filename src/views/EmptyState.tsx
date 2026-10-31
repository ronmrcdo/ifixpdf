import {FolderOpen, type LucideIcon} from 'lucide-react';
import {pickAndImport} from '../shell/useFileImport';

export function EmptyState({icon: Icon, title, text}: {icon: LucideIcon; title: string; text: string}) {
  return (
    <section className="preview-empty empty">
      <Icon aria-hidden="true" />
      <h2>{title}</h2>
      <p>{text}</p>
      <button type="button" className="primary" data-action="add" onClick={() => void pickAndImport()}><FolderOpen aria-hidden="true" /> Open PDF</button>
    </section>
  );
}

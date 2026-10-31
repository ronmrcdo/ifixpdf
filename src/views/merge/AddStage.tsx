import {Download, FilePlus2, Files, GripVertical, Plus} from 'lucide-react';
import {pickAndImport} from '../../shell/useFileImport';

/** Merge with no pages: the drop area and the three-step instructions. */
export function AddStage() {
  return (
    <section className="combine-start">
      <div className="combine-drop">
        <span className="combine-start-icon">
          <Files aria-hidden="true" />
        </span>
        <h2>Choose PDFs to merge</h2>
        <p>Add two or more PDFs, then put them in the order you need.</p>
        <button
          type="button"
          className="primary"
          data-action="add"
          onClick={() => void pickAndImport()}
        >
          <Plus aria-hidden="true" /> Add PDF files
        </button>
        <span className="drop-caption">or drag and drop PDFs into this window</span>
      </div>
      <div className="combine-instructions">
        <h3>From files to one PDF</h3>
        <div>
          <FilePlus2 aria-hidden="true" />
          <p>
            <strong>Add your PDFs</strong>
            <span>Choose files from your device. Originals stay untouched.</span>
          </p>
        </div>
        <div>
          <GripVertical aria-hidden="true" />
          <p>
            <strong>Arrange and review</strong>
            <span>Reorder files or individual pages. Preview and rotate pages as needed.</span>
          </p>
        </div>
        <div>
          <Download aria-hidden="true" />
          <p>
            <strong>Name and save</strong>
            <span>Choose a file name and page range, then save one PDF.</span>
          </p>
        </div>
      </div>
    </section>
  );
}

import React, { useState } from 'react';
import { FileText, FolderOpen } from 'lucide-react';
import type { Note, DocFolder, DocFile } from '../../types';
import { NotesHub } from '../notes/NotesHub';
import { DocHub } from '../dochub/DocHub';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  notes: Note[];
  setNotes: (v: Note[] | ((p: Note[]) => Note[])) => void;
  scratchpad: string;
  setScratchpad: (v: string | ((p: string) => string)) => void;
  docFolders: DocFolder[];
  setDocFolders: (fn: (prev: DocFolder[]) => DocFolder[]) => void;
  docFiles: DocFile[];
  setDocFiles: (fn: (prev: DocFile[]) => DocFile[]) => void;
}

type TabId = 'notes' | 'docs';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'notes', label: 'Notes & Intel', icon: <FileText size={14} /> },
  { id: 'docs',  label: 'Documents',     icon: <FolderOpen size={14} /> },
];

export function NotesDocsHub({
  notes, setNotes, scratchpad, setScratchpad,
  docFolders, setDocFolders, docFiles, setDocFiles,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('notes');

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex-1 justify-center"
            style={{
              backgroundColor: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'notes' && (
        <NotesHub notes={notes} setNotes={setNotes} scratchpad={scratchpad} setScratchpad={setScratchpad} />
      )}
      {activeTab === 'docs' && (
        <DocHub folders={docFolders} setFolders={setDocFolders} files={docFiles} setFiles={setDocFiles} />
      )}
    </div>
  );
}

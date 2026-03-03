import React, { useState, useRef, useCallback } from 'react';
import {
  FolderOpen, Folder, Upload, FileText, Image, File as FileIcon,
  Plus, X, Pencil, Check, Trash2, Download, MoreHorizontal,
  ChevronRight, AlertTriangle,
} from 'lucide-react';
import type { DocFolder, DocFile } from '../../types';
import { generateId } from '../../utils';
import { format } from 'date-fns';

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  folders: DocFolder[];
  setFolders: (fn: (prev: DocFolder[]) => DocFolder[]) => void;
  files: DocFile[];
  setFiles: (fn: (prev: DocFile[]) => DocFile[]) => void;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FOLDER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#3b82f6', '#ef4444', '#6b7280',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const WARN_FILE_SIZE = 5 * 1024 * 1024;  // 5 MB

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith('image/')) return <Image className="w-5 h-5" />;
  if (type === 'application/pdf' || type.includes('pdf')) return <FileText className="w-5 h-5" />;
  return <FileIcon className="w-5 h-5" />;
}

function fileColor(type: string): string {
  if (type.startsWith('image/')) return '#8b5cf6';
  if (type.includes('pdf')) return '#ef4444';
  if (type.includes('word') || type.includes('document')) return '#3b82f6';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return '#22c55e';
  return '#6b7280';
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── FOLDER ITEM ──────────────────────────────────────────────────────────────

function FolderItem({
  folder,
  count,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  folder: DocFolder;
  count: number;
  isActive: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(folder.name);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div
      className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
      style={{
        backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
      }}
      onClick={() => !editing && onSelect()}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = isActive ? 'var(--bg-elevated)' : 'transparent'; }}
    >
      {isActive
        ? <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: folder.color }} />
        : <Folder className="w-4 h-4 flex-shrink-0" style={{ color: folder.color }} />}

      {editing ? (
        <input
          autoFocus
          className="flex-1 text-xs bg-transparent outline-none border-b"
          style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
          value={draftName}
          onChange={e => setDraftName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={commitRename}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 text-xs truncate">{folder.name}</span>
      )}

      <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{count}</span>

      {!editing && (
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            className="p-0.5 rounded hover:bg-[var(--border)]"
            onClick={e => { e.stopPropagation(); setDraftName(folder.name); setEditing(true); }}
            title="Rename"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            className="p-0.5 rounded hover:bg-[var(--border)]"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Delete folder"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── DOC CARD ─────────────────────────────────────────────────────────────────

function DocCard({
  file,
  folders,
  onDelete,
  onMove,
  onPreview,
}: {
  file: DocFile;
  folders: DocFolder[];
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
  onPreview: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const color = fileColor(file.type);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = file.content;
    a.download = file.name;
    a.click();
  };

  return (
    <div
      className="group relative rounded-xl flex flex-col overflow-hidden cursor-pointer transition-all hover:shadow-md"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
      onClick={onPreview}
    >
      {/* Preview area */}
      <div
        className="flex items-center justify-center"
        style={{ height: 100, backgroundColor: `${color}15` }}
      >
        {file.type.startsWith('image/') ? (
          <img
            src={file.content}
            alt={file.name}
            className="max-h-full max-w-full object-contain"
            style={{ maxHeight: 96 }}
          />
        ) : (
          <div style={{ color }}>{fileIcon(file.type)}</div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {file.name}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {formatBytes(file.size)} · {format(new Date(file.uploadedAt), 'MMM d, yyyy')}
        </p>
        {file.folderId && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
            {folders.find(f => f.id === file.folderId)?.name ?? ''}
          </p>
        )}
      </div>

      {/* Actions overlay */}
      <div
        className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        <button
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          onClick={handleDownload}
          title="Download"
        >
          <Download className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
        </button>
        <div className="relative">
          <button
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={() => setMenuOpen(v => !v)}
            title="More"
          >
            <MoreHorizontal className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-1 z-20 rounded-lg shadow-xl w-40 py-1 overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
              >
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Move to
                </p>
                <button
                  className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-elevated)]"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => { onMove(null); setMenuOpen(false); }}
                >
                  Unfiled
                </button>
                {folders.map(f => (
                  <button
                    key={f.id}
                    className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-elevated)] flex items-center gap-2"
                    style={{ color: 'var(--text-primary)' }}
                    onClick={() => { onMove(f.id); setMenuOpen(false); }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                    {f.name}
                  </button>
                ))}
                <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />
                <button
                  className="w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-elevated)] flex items-center gap-2"
                  style={{ color: '#ef4444' }}
                  onClick={() => { onDelete(); setMenuOpen(false); }}
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PREVIEW MODAL ────────────────────────────────────────────────────────────

function PreviewModal({ file, onClose }: { file: DocFile; onClose: () => void }) {
  const isPdf = file.type.includes('pdf');
  const isImage = file.type.startsWith('image/');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = file.content;
    a.download = file.name;
    a.click();
  };

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }} onClick={onClose} />
      <div
        className="fixed z-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          top: '5vh', left: '50%', transform: 'translateX(-50%)',
          width: '90vw', maxWidth: 860,
          height: '88vh',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ color: fileColor(file.type) }}>{fileIcon(file.type)}</span>
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {file.name}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              · {formatBytes(file.size)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-elevated)]"
            >
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {isImage ? (
            <img src={file.content} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg" />
          ) : isPdf ? (
            <iframe
              src={file.content}
              className="w-full h-full rounded-lg"
              title={file.name}
              style={{ border: 'none' }}
            />
          ) : (
            <div className="text-center">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: `${fileColor(file.type)}20`, color: fileColor(file.type) }}
              >
                {fileIcon(file.type)}
              </div>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Preview not available for this file type.
              </p>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mx-auto"
                style={{ backgroundColor: '#6366f1', color: '#fff' }}
              >
                <Download className="w-4 h-4" /> Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── NEW FOLDER DIALOG ────────────────────────────────────────────────────────

function NewFolderDialog({ onSave, onClose }: { onSave: (name: string, color: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div
        className="fixed z-50 rounded-2xl shadow-2xl p-5 w-80"
        style={{
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>New Folder</h3>
        <input
          autoFocus
          className="caesar-input w-full mb-4"
          placeholder="Folder name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onSave(name.trim(), color); if (e.key === 'Escape') onClose(); }}
        />
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Color</p>
        <div className="flex gap-2 flex-wrap mb-5">
          {FOLDER_COLORS.map(c => (
            <button
              key={c}
              className="w-6 h-6 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            >
              {color === c && <Check className="w-3 h-3 text-white" />}
            </button>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button className="caesar-btn-ghost text-xs px-3 py-1.5" onClick={onClose}>Cancel</button>
          <button
            className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ backgroundColor: '#6366f1', color: '#fff', opacity: name.trim() ? 1 : 0.4 }}
            disabled={!name.trim()}
            onClick={() => onSave(name.trim(), color)}
          >
            Create
          </button>
        </div>
      </div>
    </>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function DocHub({ folders, setFolders, files, setFiles }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null | 'all'>('all');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [previewFile, setPreviewFile] = useState<DocFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const sortedFolders = [...folders].sort((a, b) => a.order - b.order);

  const visibleFiles = files.filter(f => {
    if (activeFolderId === 'all') return true;
    if (activeFolderId === null) return f.folderId === null;
    return f.folderId === activeFolderId;
  });

  const countForFolder = (id: string | null) =>
    files.filter(f => id === null ? f.folderId === null : f.folderId === id).length;

  const handleFiles = useCallback(async (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setUploadError(null);
    setUploading(true);

    const toAdd: DocFile[] = [];
    const errors: string[] = [];

    for (const file of Array.from(incoming)) {
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} is too large (max 20 MB)`);
        continue;
      }
      try {
        const content = await readFileAsDataURL(file);
        toAdd.push({
          id: generateId(),
          name: file.name,
          folderId: activeFolderId === 'all' || activeFolderId === null ? null : activeFolderId,
          type: file.type || 'application/octet-stream',
          size: file.size,
          uploadedAt: new Date().toISOString(),
          content,
        });
      } catch {
        errors.push(`Failed to read ${file.name}`);
      }
    }

    if (toAdd.length > 0) setFiles(prev => [...prev, ...toAdd]);
    if (errors.length > 0) setUploadError(errors.join(' · '));
    setUploading(false);
  }, [activeFolderId, setFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleCreateFolder = (name: string, color: string) => {
    setFolders(prev => [
      ...prev,
      { id: generateId(), name, color, order: prev.length, createdAt: new Date().toISOString() },
    ]);
    setShowNewFolder(false);
  };

  const handleRenameFolder = (id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  };

  const handleDeleteFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    setFiles(prev => prev.map(f => f.folderId === id ? { ...f, folderId: null } : f));
    if (activeFolderId === id) setActiveFolderId('all');
  };

  const handleDeleteFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleMoveFile = (id: string, folderId: string | null) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, folderId } : f));
  };

  return (
    <div className="flex gap-0 h-full" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* ── Folder sidebar ──────────────────────────────────────────────────── */}
      <aside
        className="flex-shrink-0 flex flex-col"
        style={{
          width: 192,
          borderRight: '1px solid var(--border)',
          paddingRight: 0,
        }}
      >
        <div className="p-3 space-y-0.5">
          {/* All files */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: activeFolderId === 'all' ? 'var(--bg-elevated)' : 'transparent',
              color: activeFolderId === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
            onClick={() => setActiveFolderId('all')}
          >
            <FolderOpen className="w-4 h-4" style={{ color: '#6366f1' }} />
            <span className="flex-1 text-left">All Files</span>
            <span className="text-[10px]">{files.length}</span>
          </button>

          {/* Unfiled */}
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: activeFolderId === null ? 'var(--bg-elevated)' : 'transparent',
              color: activeFolderId === null ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
            onClick={() => setActiveFolderId(null)}
          >
            <Folder className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <span className="flex-1 text-left">Unfiled</span>
            <span className="text-[10px]">{countForFolder(null)}</span>
          </button>

          {/* User folders */}
          {sortedFolders.length > 0 && (
            <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '6px 12px' }} />
          )}
          {sortedFolders.map(folder => (
            <FolderItem
              key={folder.id}
              folder={folder}
              count={countForFolder(folder.id)}
              isActive={activeFolderId === folder.id}
              onSelect={() => setActiveFolderId(folder.id)}
              onRename={name => handleRenameFolder(folder.id, name)}
              onDelete={() => handleDeleteFolder(folder.id)}
            />
          ))}
        </div>

        {/* New folder button */}
        <div className="mt-auto p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowNewFolder(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Plus className="w-4 h-4" />
            New Folder
          </button>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 pl-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {activeFolderId === 'all'
                ? 'All Files'
                : activeFolderId === null
                ? 'Unfiled'
                : folders.find(f => f.id === activeFolderId)?.name ?? 'Folder'}
            </h2>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              {visibleFiles.length}
            </span>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity"
            style={{ backgroundColor: '#6366f1', color: '#fff', opacity: uploading ? 0.6 : 1 }}
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Uploading…' : 'Upload Files'}
          </button>
        </div>

        {uploadError && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg mb-4 text-xs"
            style={{ backgroundColor: 'var(--bg-elevated)', color: '#ef4444', border: '1px solid var(--border)' }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {uploadError}
            <button className="ml-auto" onClick={() => setUploadError(null)}>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Drop zone + grid */}
        <div
          className="flex-1 rounded-xl transition-colors"
          style={{
            border: `2px dashed ${isDraggingOver ? 'var(--border-strong)' : 'transparent'}`,
            backgroundColor: isDraggingOver ? 'var(--bg-elevated)' : 'transparent',
          }}
          onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
        >
          {visibleFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: 'var(--bg-elevated)' }}
              >
                <Upload className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                No files here
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Drag & drop files or click Upload Files
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {visibleFiles.map(file => (
                <DocCard
                  key={file.id}
                  file={file}
                  folders={sortedFolders}
                  onDelete={() => handleDeleteFile(file.id)}
                  onMove={folderId => handleMoveFile(file.id, folderId)}
                  onPreview={() => setPreviewFile(file)}
                />
              ))}
            </div>
          )}
        </div>

        <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
          Max file size: 20 MB · Files stored locally in your account
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {/* Dialogs */}
      {showNewFolder && (
        <NewFolderDialog
          onSave={handleCreateFolder}
          onClose={() => setShowNewFolder(false)}
        />
      )}
      {previewFile && (
        <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}

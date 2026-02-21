import React, { useState, useRef, useCallback, useMemo } from 'react';
import Papa from 'papaparse';
import {
  Upload,
  FileText,
  ChevronLeft,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import type { FinancialEntry, VentureFinancial } from '../../types';
import { Modal } from '../shared/Modal';
import { generateId } from '../../utils';
import { format, parse, isValid } from 'date-fns';

// ─── LOCAL TYPES ──────────────────────────────────────────────────────────────

type BankSource = 'afcu' | 'mercury';
type ImportStatus = 'pending' | 'cleared' | 'failed';

interface ParsedTransaction {
  id: string;
  date: string;
  description: string;
  rawDescription: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  ventureId: string;
  bank: BankSource;
  status: ImportStatus;
  include: boolean;
  isPending: boolean;
  isDuplicate: boolean;
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingEntries: FinancialEntry[];
  ventureFinancials: VentureFinancial[];
  onImport: (entries: FinancialEntry[]) => void;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  'Income', 'Payroll', 'Tithing', 'Groceries', 'Dining', 'Gas & Transport',
  'Housing', 'Fitness', 'Subscriptions', 'Shopping', 'Transfer',
  'Marketing Tools', 'AI Subscriptions', 'Maintenance', 'Business Revenue',
  'Business Expense', 'Software', 'Advertising', 'Contractor', 'Office', 'Misc',
  'Uncategorized',
];

const CATEGORY_RULES: { keywords: string[]; category: string; ventureId: string }[] = [
  { keywords: ['canva', 'meta ads', 'google ads', 'facebook ads', 'mailchimp', 'hootsuite'], category: 'Marketing Tools', ventureId: 'proj_2' },
  { keywords: ['openai', 'anthropic', 'claude', 'chatgpt', 'midjourney', 'replicate'], category: 'AI Subscriptions', ventureId: 'proj_3' },
  { keywords: ['home depot', "lowe's", 'lowes', 'ace hardware', 'maintenance', 'plumbing'], category: 'Maintenance', ventureId: 'proj_4' },
  { keywords: ["smith's", 'walmart', 'costco', 'trader joe', 'whole foods', 'grocery'], category: 'Groceries', ventureId: '' },
  { keywords: ['shell', 'chevron', 'gas', 'fuel', 'exxon'], category: 'Gas & Transport', ventureId: '' },
  { keywords: ['restaurant', 'cafe', 'pizza', 'burger', 'sushi', 'chipotle', 'chick-fil'], category: 'Dining', ventureId: '' },
  { keywords: ['tithing', 'fast offering', 'lds', 'church of jesus'], category: 'Tithing', ventureId: '' },
  { keywords: ['gym', 'planet fitness', 'la fitness', 'crunch', 'supplement', 'protein'], category: 'Fitness', ventureId: '' },
  { keywords: ['netflix', 'spotify', 'hulu', 'disney', 'amazon prime', 'youtube'], category: 'Subscriptions', ventureId: '' },
  { keywords: ['amazon', 'ebay', 'target', 'best buy'], category: 'Shopping', ventureId: '' },
  { keywords: ['direct dep', 'payroll', 'paycheck', 'salary'], category: 'Income', ventureId: '' },
  { keywords: ['rent', 'mortgage', 'lease'], category: 'Housing', ventureId: '' },
  { keywords: ['transfer', 'xfer'], category: 'Transfer', ventureId: '' },
];

// ─── AUTO-CATEGORIZER ────────────────────────────────────────────────────────

function autoCategorize(
  description: string,
  bank: BankSource,
  amount: number
): { category: string; ventureId: string } {
  if (bank === 'mercury') {
    return {
      category: amount >= 0 ? 'Business Revenue' : 'Business Expense',
      ventureId: '',
    };
  }

  const lower = description.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { category: rule.category, ventureId: rule.ventureId };
    }
  }

  return { category: 'Uncategorized', ventureId: '' };
}

// ─── DUPLICATE DETECTION ─────────────────────────────────────────────────────

function detectDuplicate(tx: ParsedTransaction, existing: FinancialEntry[]): boolean {
  return existing.some((e) => {
    if (e.date !== tx.date) return false;
    if (Math.abs(e.amount - Math.abs(tx.amount)) > 0.01) return false;
    const a = e.description.toLowerCase();
    const b = tx.description.toLowerCase();
    return (
      a.includes(b.slice(0, 10)) ||
      b.includes(a.slice(0, 10)) ||
      a.includes(b) ||
      b.includes(a)
    );
  });
}

// ─── DESCRIPTION CLEANER ──────────────────────────────────────────────────────

function cleanAFCUDescription(raw: string): string {
  let s = raw;
  // Strip noise patterns
  s = s.replace(/\bPOS PURCHASE\b/gi, '');
  s = s.replace(/\bACH DEBIT\b/gi, '');
  s = s.replace(/\bACH CREDIT\b/gi, '');
  s = s.replace(/\bONLINE TRANSFER\b/gi, '');
  // Remove sequences of 6+ digits (terminal IDs, reference numbers)
  s = s.replace(/\b\d{6,}\b/g, '');
  // Remove branch codes like #123, BR-45
  s = s.replace(/\b(BR|BRANCH)[-\s]?\d+\b/gi, '');
  s = s.replace(/#\d+/g, '');
  // Trim and collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // Title case
  return s
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function cleanMercuryDescription(raw: string): string {
  let s = raw;
  // Remove wire transfer IDs (long alphanumeric strings 12+ chars)
  s = s.replace(/\b[A-Z0-9]{12,}\b/g, '');
  // Remove ACH trace numbers
  s = s.replace(/ACH TRACE[:\s#]?\w+/gi, '');
  // Remove reference numbers like REF#12345678
  s = s.replace(/REF#?\s?\w+/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  // Title case
  return s
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ─── DATE CONVERTER ───────────────────────────────────────────────────────────

function parseMMDDYYYY(str: string): string {
  try {
    const d = parse(str.trim(), 'MM/dd/yyyy', new Date());
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  } catch { /* fall through */ }
  // Try M/D/YYYY
  try {
    const d = parse(str.trim(), 'M/d/yyyy', new Date());
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  } catch { /* fall through */ }
  return str.trim();
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────

function findColumn(row: Record<string, string>, names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const found = keys.find((k) => k.trim().toLowerCase() === name.toLowerCase());
    if (found !== undefined) return row[found] ?? '';
  }
  return '';
}

function parseAFCU(rows: Record<string, string>[]): ParsedTransaction[] {
  return rows
    .filter((row) => Object.values(row).some((v) => v.trim() !== ''))
    .map((row) => {
      const rawDate = findColumn(row, ['Date', 'date', 'Transaction Date']);
      const rawDesc = findColumn(row, ['Description', 'description', 'Memo']);
      const rawAmount = findColumn(row, ['Amount', 'amount']);
      const rawType = findColumn(row, ['Type', 'type', 'Transaction Type']);

      const dateStr = parseMMDDYYYY(rawDate);
      const rawDescription = rawDesc.trim();
      const description = cleanAFCUDescription(rawDescription);

      let amount = parseFloat(rawAmount.replace(/[$,]/g, '')) || 0;
      // If Type column says Debit, ensure negative
      if (rawType.toLowerCase().includes('debit') && amount > 0) {
        amount = -amount;
      }

      const type: 'income' | 'expense' = amount >= 0 ? 'income' : 'expense';
      const absAmount = Math.abs(amount);

      const { category, ventureId } = autoCategorize(description, 'afcu', amount);

      const tx: ParsedTransaction = {
        id: generateId(),
        date: dateStr,
        description,
        rawDescription,
        amount: absAmount,
        type,
        category,
        ventureId,
        bank: 'afcu',
        status: 'cleared',
        include: true,
        isPending: false,
        isDuplicate: false,
      };

      return tx;
    });
}

function parseMercury(rows: Record<string, string>[], ventureId: string): ParsedTransaction[] {
  return rows
    .filter((row) => Object.values(row).some((v) => v.trim() !== ''))
    .map((row) => {
      const rawDate = findColumn(row, ['Date', 'date']);
      const rawDesc = findColumn(row, ['Description', 'description']);
      const rawAmount = findColumn(row, ['Amount', 'amount']);
      const rawStatus = findColumn(row, ['Status', 'status']);

      const dateStr = rawDate.trim(); // already YYYY-MM-DD
      const rawDescription = rawDesc.trim();
      const description = cleanMercuryDescription(rawDescription);

      const amount = parseFloat(rawAmount.replace(/[$,]/g, '')) || 0;
      const type: 'income' | 'expense' = amount >= 0 ? 'income' : 'expense';
      const absAmount = Math.abs(amount);

      const statusLower = rawStatus.toLowerCase();
      const isPending = statusLower.includes('pending');

      const { category } = autoCategorize(description, 'mercury', amount);

      const tx: ParsedTransaction = {
        id: generateId(),
        date: dateStr,
        description,
        rawDescription,
        amount: absAmount,
        type,
        category,
        ventureId,
        bank: 'mercury',
        status: isPending ? 'pending' : 'cleared',
        include: !isPending, // pending excluded by default
        isPending,
        isDuplicate: false,
      };

      return tx;
    });
}

// ─── BANK BADGE ───────────────────────────────────────────────────────────────

function BankBadge({ bank }: { bank: BankSource }) {
  const isAFCU = bank === 'afcu';
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 4,
        backgroundColor: isAFCU ? 'var(--bg-elevated)' : 'var(--bg-elevated)',
        color: isAFCU ? 'var(--text-muted)' : 'var(--text-muted)',
        border: `1px solid ${isAFCU ? 'var(--bg-elevated)' : 'var(--bg-elevated)'}`,
        whiteSpace: 'nowrap' as const,
      }}
    >
      {isAFCU ? 'AFCU' : 'Mercury'}
    </span>
  );
}

// ─── STEP INDICATOR ──────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = ['Upload', 'Review', 'Done'];
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((label, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  backgroundColor: done ? 'var(--text-secondary)' : active ? 'var(--text-muted)' : 'var(--bg-elevated)',
                  color: done || active ? '#05080f' : 'var(--text-muted)',
                  border: `2px solid ${done ? 'var(--text-secondary)' : active ? 'var(--border-strong)' : 'var(--border)'}`,
                  transition: 'all 0.2s',
                }}
              >
                {done ? <Check size={13} /> : idx}
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  marginBottom: 16,
                  backgroundColor: done ? 'var(--text-muted)' : 'var(--border)',
                  maxWidth: 48,
                  borderRadius: 1,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function CSVImportModal({
  isOpen,
  onClose,
  existingEntries,
  ventureFinancials,
  onImport,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedBank, setSelectedBank] = useState<BankSource | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [mercuryVentureId, setMercuryVentureId] = useState<string>(ventureFinancials[0]?.id ?? '');
  const [pendingOpen, setPendingOpen] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [importResult, setImportResult] = useState({ imported: 0, duplicates: 0, pending: 0 });

  // Ledger filters
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [ledgerBankFilter, setLedgerBankFilter] = useState<'all' | 'afcu' | 'mercury'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Reset on close ────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setStep(1);
    setSelectedBank(null);
    setSelectedFile(null);
    setParseError(null);
    setTransactions([]);
    setMercuryVentureId(ventureFinancials[0]?.id ?? '');
    setPendingOpen(false);
    setBulkCategoryOpen(false);
    setBulkCategory('');
    setLedgerSearch('');
    setLedgerTypeFilter('all');
    setLedgerBankFilter('all');
    onClose();
  }, [onClose, ventureFinancials]);

  // ── File handling ─────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setParseError('Please select a .csv file.');
      return;
    }
    setSelectedFile(file);
    setParseError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  // ── Parse file ────────────────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    if (!selectedFile || !selectedBank) return;
    setParseError(null);

    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          let parsed: ParsedTransaction[];
          if (selectedBank === 'afcu') {
            parsed = parseAFCU(results.data);
          } else {
            parsed = parseMercury(results.data, mercuryVentureId);
          }

          // Run duplicate detection
          const withDupes = parsed.map((tx) => {
            const isDuplicate = detectDuplicate(tx, existingEntries);
            return { ...tx, isDuplicate, include: isDuplicate ? false : tx.include };
          });

          setTransactions(withDupes);
          setStep(2);
        } catch (err) {
          setParseError(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
      error: (err) => {
        setParseError(`CSV parse error: ${err.message}`);
      },
    });
  }, [selectedFile, selectedBank, mercuryVentureId, existingEntries]);

  // ── Transaction updates ───────────────────────────────────────────────────
  const toggleInclude = (id: string) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, include: !tx.include } : tx))
    );
  };

  const updateCategory = (id: string, category: string) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, category } : tx))
    );
  };

  const updateVenture = (id: string, ventureId: string) => {
    setTransactions((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ventureId } : tx))
    );
  };

  const fixAllUncategorized = () => {
    if (!bulkCategory) return;
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.category === 'Uncategorized' ? { ...tx, category: bulkCategory } : tx
      )
    );
    setBulkCategory('');
    setBulkCategoryOpen(false);
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const included = transactions.filter((tx) => tx.include);
    const income = included.filter((tx) => tx.type === 'income').length;
    const expenses = included.filter((tx) => tx.type === 'expense').length;
    const pending = transactions.filter((tx) => tx.isPending).length;
    const duplicates = transactions.filter((tx) => tx.isDuplicate).length;
    const uncategorized = included.filter((tx) => tx.category === 'Uncategorized').length;
    return { income, expenses, pending, duplicates, uncategorized };
  }, [transactions]);

  const mainTransactions = useMemo(
    () => transactions.filter((tx) => !tx.isPending),
    [transactions]
  );

  const pendingTransactions = useMemo(
    () => transactions.filter((tx) => tx.isPending),
    [transactions]
  );

  const previewRows = useMemo(() => mainTransactions.slice(0, 10), [mainTransactions]);

  // ── Confirm import ────────────────────────────────────────────────────────
  const handleConfirmImport = () => {
    const toImport = transactions.filter((tx) => tx.include);
    const duplicatesSkipped = transactions.filter((tx) => tx.isDuplicate).length;
    const pendingCount = transactions.filter((tx) => tx.isPending && tx.include).length;

    const entries: FinancialEntry[] = toImport.map((tx) => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      ventureId: tx.ventureId || undefined,
    }));

    onImport(entries);
    setImportResult({
      imported: entries.length,
      duplicates: duplicatesSkipped,
      pending: pendingCount,
    });
    setStep(3);
  };

  // ── Row style helpers ─────────────────────────────────────────────────────
  function rowBg(tx: ParsedTransaction): string {
    if (tx.isDuplicate) return 'var(--bg-elevated)';
    if (tx.category === 'Uncategorized') return 'var(--bg-elevated)';
    return 'transparent';
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Transactions"
      size="xl"
    >
      <StepIndicator step={step} />

      {/* ── STEP 1: UPLOAD ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          {/* Bank Selector */}
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                marginBottom: 10,
              }}
            >
              Select Bank
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* AFCU */}
              <button
                onClick={() => setSelectedBank('afcu')}
                style={{
                  padding: '16px',
                  borderRadius: 12,
                  border: `2px solid ${selectedBank === 'afcu' ? 'var(--border-strong)' : 'var(--border)'}`,
                  backgroundColor:
                    selectedBank === 'afcu'
                      ? 'var(--bg-elevated)'
                      : 'var(--bg-elevated)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    America First CU
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      backgroundColor: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--bg-elevated)',
                    }}
                  >
                    AFCU
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Personal checking / savings
                </p>
              </button>

              {/* Mercury */}
              <button
                onClick={() => setSelectedBank('mercury')}
                style={{
                  padding: '16px',
                  borderRadius: 12,
                  border: `2px solid ${selectedBank === 'mercury' ? 'var(--border-strong)' : 'var(--border)'}`,
                  backgroundColor:
                    selectedBank === 'mercury'
                      ? 'var(--bg-elevated)'
                      : 'var(--bg-elevated)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    Mercury Business
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      backgroundColor: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--bg-elevated)',
                    }}
                  >
                    Mercury
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Business banking
                </p>
              </button>
            </div>
          </div>

          {/* Mercury venture selector */}
          {selectedBank === 'mercury' && (
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Which venture is this Mercury account for?
              </label>
              <select
                value={mercuryVentureId}
                onChange={(e) => setMercuryVentureId(e.target.value)}
                className="caesar-input w-full"
                style={{ fontSize: 13 }}
              >
                {ventureFinancials.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                <option value="">— No Venture / Personal —</option>
              </select>
            </div>
          )}

          {/* File Dropzone */}
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                marginBottom: 10,
              }}
            >
              Upload CSV
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? 'var(--border-strong)' : selectedFile ? 'var(--border-strong)' : 'var(--border)'}`,
                borderRadius: 12,
                padding: '32px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: isDragging
                  ? 'var(--bg-elevated)'
                  : selectedFile
                  ? 'var(--bg-elevated)'
                  : 'var(--bg-elevated)',
                transition: 'all 0.15s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText size={28} style={{ color: 'var(--text-secondary)' }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {selectedFile.name}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {(selectedFile.size / 1024).toFixed(1)} KB · Click to change
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={28} style={{ color: 'var(--text-muted)' }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Drag & drop your CSV here
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    or click to browse · .csv files only
                  </p>
                </div>
              )}
            </div>
          </div>

          {parseError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 12,
              }}
            >
              {parseError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleParse}
              disabled={!selectedBank || !selectedFile}
              className="caesar-btn-primary"
              style={{
                opacity: !selectedBank || !selectedFile ? 0.4 : 1,
                cursor: !selectedBank || !selectedFile ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileText size={14} />
              Parse File
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: PREVIEW & REVIEW ─────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {transactions.length} transactions found
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Review and adjust before importing
              </p>
            </div>

            {/* Bulk fix uncategorized */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setBulkCategoryOpen((p) => !p)}
                style={{
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--bg-elevated)',
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Fix All Uncategorized ({stats.uncategorized})
                {bulkCategoryOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {bulkCategoryOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '110%',
                    right: 0,
                    zIndex: 20,
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 12,
                    minWidth: 220,
                    boxShadow: 'var(--shadow-card)',
                  }}
                >
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Assign category to all uncategorized rows:
                  </p>
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="caesar-input w-full mb-2"
                    style={{ fontSize: 12 }}
                  >
                    <option value="">— Select category —</option>
                    {ALL_CATEGORIES.filter((c) => c !== 'Uncategorized').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    onClick={fixAllUncategorized}
                    disabled={!bulkCategory}
                    className="caesar-btn-primary w-full"
                    style={{ fontSize: 12, opacity: !bulkCategory ? 0.5 : 1 }}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Summary bar */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              {stats.income} income
            </span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              {stats.expenses} expenses
            </span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
              {stats.pending} pending
            </span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              {stats.duplicates} duplicates skipped
            </span>
          </div>

          {/* Preview table (first 10) */}
          {previewRows.length > 0 && (
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                }}
              >
                Preview (first {previewRows.length} rows)
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Date', 'Description', 'Amount', 'Category'].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: 'left',
                            padding: '4px 8px',
                            color: 'var(--text-muted)',
                            fontWeight: 600,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((tx) => (
                      <tr
                        key={tx.id}
                        style={{ borderBottom: '1px solid var(--border)', opacity: 0.85 }}
                      >
                        <td style={{ padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {tx.date}
                        </td>
                        <td
                          style={{
                            padding: '4px 8px',
                            color: 'var(--text-primary)',
                            maxWidth: 180,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tx.description}
                        </td>
                        <td
                          style={{
                            padding: '4px 8px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: tx.type === 'income' ? 'var(--text-secondary)' : 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>
                          {tx.category}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Full table */}
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                marginBottom: 8,
              }}
            >
              All Transactions ({mainTransactions.length})
            </p>
            <div
              style={{
                maxHeight: 320,
                overflowY: 'auto',
                overflowX: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 10,
              }}
            >
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 700 }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 2 }}>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 10px', width: 32 }} />
                    <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                    <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Description</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Amount</th>
                    <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Bank</th>
                    <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Category</th>
                    <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Venture</th>
                    <th style={{ padding: '8px 6px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mainTransactions.map((tx) => (
                    <tr
                      key={tx.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: rowBg(tx),
                        opacity: tx.include ? 1 : 0.45,
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={tx.include}
                          onChange={() => toggleInclude(tx.id)}
                          style={{ cursor: 'pointer', accentColor: 'var(--text-muted)' }}
                        />
                      </td>

                      {/* Date */}
                      <td style={{ padding: '6px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {tx.date}
                      </td>

                      {/* Description */}
                      <td
                        style={{
                          padding: '6px',
                          color: 'var(--text-primary)',
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={tx.description}
                      >
                        {tx.isDuplicate && (
                          <AlertTriangle
                            size={11}
                            style={{ color: 'var(--text-secondary)', display: 'inline', marginRight: 4, verticalAlign: 'middle' }}
                          />
                        )}
                        {tx.description}
                      </td>

                      {/* Amount */}
                      <td
                        style={{
                          padding: '6px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: tx.type === 'income' ? 'var(--text-secondary)' : 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
                      </td>

                      {/* Bank badge */}
                      <td style={{ padding: '6px' }}>
                        <BankBadge bank={tx.bank} />
                      </td>

                      {/* Category dropdown */}
                      <td style={{ padding: '4px 6px' }}>
                        <select
                          value={tx.category}
                          onChange={(e) => updateCategory(tx.id, e.target.value)}
                          style={{
                            fontSize: 11,
                            padding: '3px 6px',
                            borderRadius: 6,
                            border: `1px solid ${tx.category === 'Uncategorized' ? 'var(--bg-elevated)' : 'var(--border)'}`,
                            backgroundColor: tx.category === 'Uncategorized'
                              ? 'var(--bg-elevated)'
                              : 'var(--bg-elevated)',
                            color: tx.category === 'Uncategorized' ? 'var(--text-muted)' : 'var(--text-primary)',
                            cursor: 'pointer',
                            maxWidth: 140,
                          }}
                        >
                          {ALL_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>

                      {/* Venture dropdown */}
                      <td style={{ padding: '4px 6px' }}>
                        <select
                          value={tx.ventureId}
                          onChange={(e) => updateVenture(tx.id, e.target.value)}
                          style={{
                            fontSize: 11,
                            padding: '3px 6px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            maxWidth: 130,
                          }}
                        >
                          <option value="">Personal / None</option>
                          {ventureFinancials.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '6px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: 4,
                            backgroundColor:
                              tx.status === 'cleared'
                                ? 'var(--bg-elevated)'
                                : tx.status === 'pending'
                                ? 'rgba(251,191,36,0.12)'
                                : 'var(--bg-elevated)',
                            color:
                              tx.status === 'cleared'
                                ? 'var(--text-secondary)'
                                : tx.status === 'pending'
                                ? 'var(--text-muted)'
                                : 'var(--text-secondary)',
                          }}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending section (collapsible) */}
          {pendingTransactions.length > 0 && (
            <div
              style={{
                border: '1px solid rgba(251,191,36,0.25)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setPendingOpen((p) => !p)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'rgba(251,191,36,0.06)',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>Mercury Pending Transactions ({pendingTransactions.length})</span>
                {pendingOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {pendingOpen && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 500 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '6px 10px', width: 32 }} />
                        <th style={{ padding: '6px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Date</th>
                        <th style={{ padding: '6px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Description</th>
                        <th style={{ padding: '6px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingTransactions.map((tx) => (
                        <tr
                          key={tx.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            opacity: tx.include ? 1 : 0.5,
                          }}
                        >
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={tx.include}
                              onChange={() => toggleInclude(tx.id)}
                              style={{ cursor: 'pointer', accentColor: 'var(--text-muted)' }}
                            />
                          </td>
                          <td style={{ padding: '6px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {tx.date}
                          </td>
                          <td style={{ padding: '6px', color: 'var(--text-primary)' }}>
                            {tx.description}
                          </td>
                          <td
                            style={{
                              padding: '6px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: tx.type === 'income' ? 'var(--text-secondary)' : 'var(--text-secondary)',
                            }}
                          >
                            {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="caesar-btn-ghost flex items-center gap-2"
              style={{ fontSize: 13 }}
            >
              <ChevronLeft size={15} />
              Back
            </button>
            <button
              onClick={handleConfirmImport}
              className="caesar-btn-primary flex items-center gap-2"
              style={{ fontSize: 13 }}
            >
              <Check size={15} />
              Confirm Import ({transactions.filter((tx) => tx.include).length})
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: SUCCESS ──────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="flex flex-col items-center text-center py-8 gap-5">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: 'var(--bg-elevated)',
              border: '2px solid var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Check size={28} style={{ color: 'var(--text-secondary)' }} />
          </div>

          <div>
            <h3
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 6,
              }}
            >
              Import Complete
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {importResult.imported} transaction{importResult.imported !== 1 ? 's' : ''} imported
              {importResult.duplicates > 0 && ` · ${importResult.duplicates} duplicate${importResult.duplicates !== 1 ? 's' : ''} skipped`}
              {importResult.pending > 0 && ` · ${importResult.pending} pending flagged`}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 24,
              padding: '16px 24px',
              borderRadius: 12,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="text-center">
              <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-secondary)' }}>
                {importResult.imported}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Imported</p>
            </div>
            {importResult.duplicates > 0 && (
              <>
                <div style={{ width: 1, backgroundColor: 'var(--border)' }} />
                <div className="text-center">
                  <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {importResult.duplicates}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Skipped</p>
                </div>
              </>
            )}
            {importResult.pending > 0 && (
              <>
                <div style={{ width: 1, backgroundColor: 'var(--border)' }} />
                <div className="text-center">
                  <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {importResult.pending}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pending</p>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleClose}
            className="caesar-btn-primary"
            style={{ fontSize: 14, padding: '10px 32px' }}
          >
            Close
          </button>
        </div>
      )}
    </Modal>
  );
}

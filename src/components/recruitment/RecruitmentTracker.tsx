import React, { useState, useMemo, useRef } from 'react';
import {
  Building2, Plus, Edit3, Trash2, Mail, Phone, Search,
  CheckCircle2, Clock, AlertCircle, Users, Bell,
  CreditCard, FileText, Briefcase, RefreshCw,
  Upload, Download, Eye, FileCheck, FilePlus, Printer, PenLine,
} from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { PDFDocument, rgb } from 'pdf-lib';
import type { Client, ClientPayment, ClientStatus, PaymentStatus, ClientContractInfo } from '../../types';
import { generateId, todayStr, formatDate } from '../../utils';
import { Modal } from '../shared/Modal';
import { ContractSignModal } from './ContractSignModal';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CLIENT_STATUSES: { key: ClientStatus; label: string; color: string }[] = [
  { key: 'prospect',  label: 'Prospect',  color: '#6b7280' },
  { key: 'active',    label: 'Active',    color: '#10b981' },
  { key: 'paused',    label: 'Paused',    color: '#d97706' },
  { key: 'completed', label: 'Completed', color: '#3b82f6' },
];

const PAYMENT_STATUSES: { key: PaymentStatus; label: string; color: string }[] = [
  { key: 'pending', label: 'Pending', color: '#d97706' },
  { key: 'paid',    label: 'Paid',    color: '#10b981' },
  { key: 'overdue', label: 'Overdue', color: '#ef4444' },
];

const SERVICES = [
  'Social Media Management', 'Paid Ads (PPC)', 'SEO / SEM',
  'Email Marketing', 'Content Creation', 'Branding',
  'Web Design', 'Analytics & Reporting', 'Full-Service', 'Consulting', 'Other',
];

const BILLING_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Handles old localStorage/Supabase data that may have `service: string` instead of `services: string[]` */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeClient(c: any): Client {
  return {
    ...c,
    services: Array.isArray(c.services) ? c.services : c.service ? [c.service] : [],
    payments: Array.isArray(c.payments) ? c.payments : [],
    name: c.name ?? '',
    company: c.company ?? '',
    status: c.status ?? 'prospect',
    contractValue: Number(c.contractValue) || 0,
    startDate: c.startDate ?? '',
    notes: c.notes ?? '',
  };
}

function fmtUSD(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function effectivePaymentStatus(p: ClientPayment): PaymentStatus {
  if (p.status === 'paid') return 'paid';
  if (p.dueDate < todayStr()) return 'overdue';
  return 'pending';
}

function nextDuePayment(client: Client): ClientPayment | null {
  const pending = client.payments
    .filter(p => p.status !== 'paid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return pending[0] ?? null;
}

function ordinal(n: number): string {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function emptyClient(): Omit<Client, 'id'> {
  return {
    name: '', company: '', email: '', phone: '',
    status: 'prospect', services: [], contractValue: 0,
    billingDay: undefined, startDate: todayStr(), endDate: '', notes: '', payments: [],
    contract: undefined,
  };
}

// ─── CONTRACT HTML GENERATOR ──────────────────────────────────────────────────

interface ContractOpts {
  pricingModel: 'retainer' | 'commission';
  retainerAmount: number;
  commissionRate: number;
  commissionBasis: string;
  paymentTerms: string;
  contractDuration: string;
  additionalNotes: string;
}

function generateContractHTML(client: Client, opts: ContractOpts): string {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const services = client.services.length > 0 ? client.services : ['Marketing Services'];
  const billingLine = client.billingDay
    ? `Invoices will be issued on the ${ordinal(client.billingDay)} of each calendar month.`
    : 'Invoices will be issued monthly.';

  const compensation = opts.pricingModel === 'retainer'
    ? `<p>Client agrees to pay Agency a monthly retainer fee of <strong>$${opts.retainerAmount.toLocaleString('en-US')}</strong> for the Services described herein. ${billingLine} Payment is due within <strong>${opts.paymentTerms}</strong> of invoice date.</p>`
    : `<p>Client agrees to pay Agency a commission of <strong>${opts.commissionRate}%</strong> of ${opts.commissionBasis || "gross revenue generated through Agency's efforts"}. Commissions will be calculated and invoiced monthly. Payment is due within <strong>${opts.paymentTerms}</strong> of invoice date.</p>`;

  const termination = opts.contractDuration === 'Month-to-month'
    ? 'Either party may terminate this Agreement with thirty (30) days prior written notice. Client shall remain responsible for all fees accrued prior to the effective termination date.'
    : 'Either party may terminate this Agreement for material breach upon fourteen (14) days written notice if the breaching party fails to cure such breach within the notice period. Early termination by Client for convenience shall require thirty (30) days notice and payment of all fees through the end of the current term.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Marketing Services Agreement — ${client.company || client.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 780px; margin: 48px auto; padding: 0 32px; color: #1a1a1a; line-height: 1.75; font-size: 14px; }
    .cover { text-align: center; padding: 40px 0 32px; border-bottom: 2px solid #1a1a1a; margin-bottom: 32px; }
    .cover h1 { font-size: 20px; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px; }
    .cover .subtitle { font-size: 12px; color: #555; letter-spacing: 0.04em; text-transform: uppercase; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; border: 1px solid #ccc; border-radius: 4px; padding: 20px 24px; margin: 28px 0; }
    .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 4px; }
    .party-name { font-weight: bold; font-size: 15px; }
    .party-sub { font-size: 12px; color: #555; margin-top: 2px; }
    section { margin-top: 28px; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #ddd; color: #333; }
    p { margin: 8px 0; }
    ul { margin: 8px 0 8px 22px; }
    li { margin: 3px 0; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 64px; padding-top: 24px; border-top: 1px solid #ccc; }
    .sig-block strong { display: block; margin-bottom: 8px; }
    .sig-img { display: block; height: 60px; max-width: 220px; object-fit: contain; margin-bottom: 4px; }
    .sig-placeholder { height: 60px; display: flex; align-items: flex-end; margin-bottom: 4px; }
    .sig-line { border-top: 1px solid #333; padding-top: 7px; font-size: 11px; color: #444; }
    .sig-date { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 7px; font-size: 11px; color: #666; }
    .sig-instructions { margin-top: 14px; padding: 10px 12px; background: #f8f9fa; border: 1px solid #e2e4e6; border-radius: 4px; font-size: 11px; color: #555; line-height: 1.6; }
    .sig-instructions strong { color: #1a1a1a; }
    .sign-here-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #10b981; font-weight: bold; margin-bottom: 4px; }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 12px; }
    @media print {
      body { margin: 24px; padding: 0; }
      @page { margin: 1in; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>Marketing Services Agreement</h1>
    <div class="subtitle">Effective Date: ${dateStr}</div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">Agency</div>
      <div class="party-name">Vanta Brand Scaling LLC</div>
    </div>
    <div>
      <div class="party-label">Client</div>
      <div class="party-name">${client.company || client.name}</div>
      ${client.company && client.name ? `<div class="party-sub">Attn: ${client.name}</div>` : ''}
      ${client.email ? `<div class="party-sub">${client.email}</div>` : ''}
    </div>
  </div>

  <p>This Marketing Services Agreement ("Agreement") is entered into as of ${dateStr} between <strong>Vanta Brand Scaling LLC</strong> ("Agency") and <strong>${client.company || client.name}</strong> ("Client").</p>

  <section>
    <h2>1. Services</h2>
    <p>Agency agrees to provide the following marketing services to Client:</p>
    <ul>
      ${services.map(s => `<li>${s}</li>`).join('\n      ')}
    </ul>
    ${opts.additionalNotes ? `<p><em>Additional scope of work: ${opts.additionalNotes}</em></p>` : ''}
  </section>

  <section>
    <h2>2. Term</h2>
    <p>This Agreement shall commence on ${dateStr} and continue on a <strong>${opts.contractDuration}</strong> basis unless earlier terminated in accordance with Section 7 of this Agreement.</p>
  </section>

  <section>
    <h2>3. Compensation</h2>
    ${compensation}
  </section>

  <section>
    <h2>4. Ownership of Work Product</h2>
    <p>Upon receipt of full payment for each deliverable, all creative work product produced exclusively for Client under this Agreement shall become the sole property of Client. Agency retains the right to display such work in its portfolio and promotional materials, with Client's prior written approval.</p>
  </section>

  <section>
    <h2>5. Confidentiality</h2>
    <p>Each party agrees to hold the other party's Confidential Information in strict confidence and shall not disclose it to any third party without prior written consent. "Confidential Information" includes business strategies, client lists, financial data, and proprietary methods. This obligation survives termination of this Agreement for a period of two (2) years.</p>
  </section>

  <section>
    <h2>6. Representations and Warranties</h2>
    <p>Each party represents that it has full authority to enter into this Agreement and that performance hereunder will not conflict with any other agreement. Client represents that it has obtained all necessary rights and permissions for any materials provided to Agency.</p>
  </section>

  <section>
    <h2>7. Termination</h2>
    <p>${termination}</p>
  </section>

  <section>
    <h2>8. Limitation of Liability</h2>
    <p>In no event shall either party be liable for any indirect, incidental, special, or consequential damages arising out of or related to this Agreement, even if advised of the possibility of such damages. Agency's aggregate liability shall not exceed the total fees paid by Client in the three (3) months immediately preceding the claim.</p>
  </section>

  <section>
    <h2>9. Indemnification</h2>
    <p>Each party agrees to indemnify, defend, and hold harmless the other party from and against any claims, damages, or expenses (including reasonable attorneys' fees) arising from that party's breach of this Agreement or negligent or wrongful acts.</p>
  </section>

  <section>
    <h2>10. Governing Law &amp; Dispute Resolution</h2>
    <p>This Agreement shall be governed by the laws of the State of Wyoming. Any dispute arising under this Agreement shall first be subject to good-faith negotiation. If unresolved within thirty (30) days, disputes shall be submitted to binding arbitration in Laramie County, Wyoming, under the rules of the American Arbitration Association.</p>
  </section>

  <section>
    <h2>11. Entire Agreement &amp; Amendments</h2>
    <p>This Agreement constitutes the entire agreement between the parties regarding its subject matter and supersedes all prior agreements and representations. Any modification must be in writing and signed by authorized representatives of both parties.</p>
  </section>

  <div class="signatures">
    <!--AGENCY_SIG_PLACEHOLDER-->
    <div class="sig-block">
      <strong>Vanta Brand Scaling LLC ("Agency")</strong>
      <div class="sig-placeholder"></div>
      <div class="sig-line">Authorized Signature</div>
      <div class="sig-line" style="margin-top:12px;">Printed Name &amp; Title</div>
      <div class="sig-date">Date</div>
    </div>
    <!--END_AGENCY_SIG_PLACEHOLDER-->
    <div class="sig-block">
      <div class="sign-here-label">✦ Signature required</div>
      <strong>${client.company || client.name} ("Client")</strong>
      <div class="sig-placeholder"></div>
      <div class="sig-line">Authorized Signature</div>
      <div class="sig-line" style="margin-top:12px;">${client.name ? client.name + ' — Printed Name' : 'Printed Name &amp; Title'}</div>
      <div class="sig-date">Date</div>
      <div class="sig-instructions">
        <strong>How to sign:</strong><br>
        1. Print this document (File → Print or Ctrl+P)<br>
        2. Sign above the signature line<br>
        3. Scan or photograph the signed page<br>
        4. Return to: <strong>Vanta Brand Scaling LLC</strong>
      </div>
    </div>
  </div>

  <div class="footer">Generated by Vanta Brand Scaling LLC via LITEHOUSE CRM · ${dateStr}</div>
</body>
</html>`;
}

// Injects the signature image + signer info into the Agency sig block of the contract HTML
function injectSignatureIntoHTML(html: string, sigDataUrl: string, signerName: string, dateStr: string): string {
  const replacement = `<!--AGENCY_SIG_PLACEHOLDER-->
    <div class="sig-block">
      <strong>Vanta Brand Scaling LLC ("Agency")</strong>
      <img src="${sigDataUrl}" class="sig-img" alt="Signature" />
      <div class="sig-line">${signerName || 'Authorized Signatory'}</div>
      <div class="sig-line" style="margin-top:12px;">Authorized Signatory · Vanta Brand Scaling LLC</div>
      <div class="sig-date">${dateStr}</div>
    </div>
    <!--END_AGENCY_SIG_PLACEHOLDER-->`;
  return html.replace(
    /<!--AGENCY_SIG_PLACEHOLDER-->[\s\S]*?<!--END_AGENCY_SIG_PLACEHOLDER-->/,
    replacement,
  );
}

function emptyPayment(): Omit<ClientPayment, 'id'> {
  return { description: '', amount: 0, dueDate: todayStr(), status: 'pending' };
}

// ─── BADGES ──────────────────────────────────────────────────────────────────

function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const cfg = CLIENT_STATUSES.find(s => s.key === status)!;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
      {cfg.label}
    </span>
  );
}

function PaymentStatusBadge({ payment }: { payment: ClientPayment }) {
  const status = effectivePaymentStatus(payment);
  const cfg = PAYMENT_STATUSES.find(s => s.key === status)!;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── CLIENT CARD ─────────────────────────────────────────────────────────────

function ClientCard({ client, onEdit, onDelete }: { client: Client; onEdit: () => void; onDelete: () => void }) {
  const paid = client.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const outstanding = client.payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
  const next = nextDuePayment(client);
  const hasOverdue = client.payments.some(p => effectivePaymentStatus(p) === 'overdue');

  return (
    <div
      className="caesar-card p-4 rounded-xl border transition-all duration-200 hover:border-[var(--border-strong)] flex flex-col gap-3"
      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: hasOverdue ? 'rgba(239,68,68,0.3)' : 'var(--border)' }}
    >
      {/* Header — company is primary */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
            {client.company || client.name}
          </h3>
          {client.company && client.name && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{client.name}</p>
          )}
        </div>
        <ClientStatusBadge status={client.status} />
      </div>

      {/* Services */}
      {client.services.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {client.services.map(s => (
            <span key={s} className="px-2 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Payment summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-card)' }}>
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Paid</div>
          <div className="text-sm font-semibold" style={{ color: '#10b981' }}>{fmtUSD(paid)}</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-card)' }}>
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Outstanding</div>
          <div className="text-sm font-semibold" style={{ color: outstanding > 0 ? (hasOverdue ? '#ef4444' : '#d97706') : 'var(--text-muted)' }}>
            {fmtUSD(outstanding)}
          </div>
        </div>
      </div>

      {/* Next due */}
      {next && (
        <div className="flex items-center gap-1.5 text-xs"
          style={{ color: effectivePaymentStatus(next) === 'overdue' ? '#ef4444' : 'var(--text-muted)' }}>
          {effectivePaymentStatus(next) === 'overdue' ? <AlertCircle size={11} /> : <Clock size={11} />}
          {effectivePaymentStatus(next) === 'overdue' ? 'Overdue: ' : 'Next due: '}
          {next.description} — {fmtUSD(next.amount)} on {formatDate(next.dueDate)}
        </div>
      )}

      {/* Billing cycle */}
      {client.billingDay && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Bell size={11} /> Bills on the {ordinal(client.billingDay)} · {fmtUSD(client.contractValue)}/mo
        </div>
      )}

      {/* Contact */}
      {(client.email || client.phone) && (
        <div className="flex items-center gap-3 flex-wrap">
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Mail size={11} /><span className="truncate max-w-[140px]">{client.email}</span>
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Phone size={11} />{client.phone}
            </a>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Edit">
            <Edit3 size={13} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-muted)' }} title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {client.payments.length} payment{client.payments.length !== 1 ? 's' : ''}
          {client.contractValue > 0 && ` · ${fmtUSD(client.contractValue)}/mo`}
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT ROW ─────────────────────────────────────────────────────────────

function PaymentRow({ payment, onMarkPaid, onDelete }: { payment: ClientPayment; onMarkPaid: () => void; onDelete: () => void }) {
  const effectiveStatus = effectivePaymentStatus(payment);
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: effectiveStatus === 'overdue' ? 'rgba(239,68,68,0.3)' : 'var(--border)' }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{payment.description || 'Payment'}</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Due {formatDate(payment.dueDate)}
          {payment.paidDate && ` · Paid ${formatDate(payment.paidDate)}`}
        </div>
      </div>
      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtUSD(payment.amount)}</div>
      <PaymentStatusBadge payment={payment} />
      {payment.status !== 'paid' && (
        <button onClick={onMarkPaid} className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: '#10b981' }} title="Mark as paid">
          <CheckCircle2 size={14} />
        </button>
      )}
      <button onClick={onDelete} className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
        style={{ color: 'var(--text-muted)' }} title="Delete">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── PROPS ───────────────────────────────────────────────────────────────────

interface Props {
  clients: Client[];
  setClients: (v: Client[] | ((p: Client[]) => Client[])) => void;
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export function RecruitmentTracker({ clients: rawClients, setClients }: Props) {
  // Normalize to handle any stale/malformed data from older versions
  const clients = (Array.isArray(rawClients) ? rawClients : []).map(normalizeClient);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [form, setForm] = useState<Omit<Client, 'id'>>(emptyClient());
  const [tab, setTab] = useState<'details' | 'payments' | 'notes' | 'contract'>('details');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<ClientStatus | 'all'>('all');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState<Omit<ClientPayment, 'id'>>(emptyPayment());
  const [showContractGenerator, setShowContractGenerator] = useState(false);
  const [contractForm, setContractForm] = useState<ContractOpts>({
    pricingModel: 'retainer',
    retainerAmount: 0,
    commissionRate: 10,
    commissionBasis: 'gross sales revenue',
    paymentTerms: 'Net 15',
    contractDuration: 'Month-to-month',
    additionalNotes: '',
  });

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const active = clients.filter(c => c.status === 'active').length;
    const allPayments = clients.flatMap(c => c.payments);
    const totalPaid = allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const totalOutstanding = allPayments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
    const overdueCount = allPayments.filter(p => effectivePaymentStatus(p) === 'overdue').length;
    const contracted = clients.filter(c => c.status === 'active').reduce((s, c) => s + c.contractValue, 0);
    return { active, totalPaid, totalOutstanding, overdueCount, contracted };
  }, [clients]);

  // ── Monthly billing reminders ──────────────────────────────────────────────

  const billingReminders = useMemo(() => {
    const today = new Date();
    const yr = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, '0');
    const thisMonth = `${yr}-${mo}`;
    const monthName = today.toLocaleString('default', { month: 'long' });

    return clients
      .filter(c => c.status === 'active' && c.contractValue > 0 && c.billingDay)
      .map(c => {
        const day = String(c.billingDay!).padStart(2, '0');
        const dueDate = `${thisMonth}-${day}`;
        const alreadyInvoiced = c.payments.some(p => p.dueDate.startsWith(thisMonth));
        const daysUntilDue = differenceInDays(new Date(dueDate), today);
        return { client: c, dueDate, alreadyInvoiced, daysUntilDue, monthName, yr };
      })
      .filter(r => !r.alreadyInvoiced)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }, [clients]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return clients.filter(c => {
      const matchSearch = !q
        || c.name.toLowerCase().includes(q)
        || c.company.toLowerCase().includes(q)
        || c.services.some(s => s.toLowerCase().includes(q));
      const matchStatus = filterStatus === 'all' || c.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [clients, searchQuery, filterStatus]);

  // ── Modal helpers ──────────────────────────────────────────────────────────

  function openAdd() {
    setEditingClient(null);
    setForm(emptyClient());
    setTab('details');
    setShowPaymentForm(false);
    setShowContractGenerator(false);
    setContractForm(f => ({ ...f, retainerAmount: 0 }));
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setForm({ ...client });
    setTab('details');
    setShowPaymentForm(false);
    setShowContractGenerator(false);
    setContractForm(f => ({
      ...f,
      retainerAmount: client.contractValue,
      pricingModel: client.contract?.pricingModel ?? 'retainer',
      commissionRate: client.contract?.commissionRate ?? 10,
      commissionBasis: client.contract?.commissionBasis ?? 'gross sales revenue',
      paymentTerms: client.contract?.paymentTerms ?? 'Net 15',
      contractDuration: client.contract?.contractDuration ?? 'Month-to-month',
      additionalNotes: client.contract?.additionalNotes ?? '',
    }));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingClient(null);
    setShowPaymentForm(false);
    setPaymentForm(emptyPayment());
    setShowContractGenerator(false);
  }

  function saveClient() {
    if (!form.name.trim() && !form.company.trim()) return;
    if (editingClient) {
      setClients(prev => prev.map(c => c.id === editingClient.id ? { ...form, id: editingClient.id } : c));
    } else {
      setClients(prev => [...prev, { ...form, id: generateId() }]);
    }
    closeModal();
  }

  function deleteClient(id: string) {
    if (!confirm('Delete this client?')) return;
    setClients(prev => prev.filter(c => c.id !== id));
  }

  // ── Invoice generation ─────────────────────────────────────────────────────

  function generateInvoice(client: Client, dueDate: string, monthName: string, yr: number) {
    const newPmt: ClientPayment = {
      id: generateId(),
      description: `${monthName} ${yr} retainer`,
      amount: client.contractValue,
      dueDate,
      status: 'pending',
    };
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, payments: [...c.payments, newPmt] } : c));
  }

  // ── Payment helpers (inside modal) ────────────────────────────────────────

  function addPayment() {
    if (!paymentForm.description.trim() || paymentForm.amount <= 0) return;
    setForm(f => ({ ...f, payments: [...f.payments, { ...paymentForm, id: generateId() }] }));
    setPaymentForm(emptyPayment());
    setShowPaymentForm(false);
  }

  function markPaymentPaid(pmtId: string) {
    setForm(f => ({
      ...f,
      payments: f.payments.map(p => p.id === pmtId ? { ...p, status: 'paid', paidDate: todayStr() } : p),
    }));
  }

  function deletePayment(pmtId: string) {
    setForm(f => ({ ...f, payments: f.payments.filter(p => p.id !== pmtId) }));
  }

  function toggleService(s: string) {
    setForm(f => ({
      ...f,
      services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s],
    }));
  }

  // ── Contract helpers ───────────────────────────────────────────────────────

  function handleGenerateContract() {
    const clientSnapshot = { ...form, id: editingClient?.id ?? '' } as Client;
    const html = generateContractHTML(clientSnapshot, contractForm);
    const contractInfo: ClientContractInfo = {
      type: 'generated',
      fileName: `${form.company || form.name || 'contract'}_agreement.html`,
      createdAt: todayStr(),
      pricingModel: contractForm.pricingModel,
      retainerAmount: contractForm.retainerAmount,
      commissionRate: contractForm.commissionRate,
      commissionBasis: contractForm.commissionBasis,
      paymentTerms: contractForm.paymentTerms,
      contractDuration: contractForm.contractDuration,
      additionalNotes: contractForm.additionalNotes,
    };
    setForm(f => ({ ...f, contract: contractInfo }));
    setShowContractGenerator(false);
    // Open preview in new tab
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }

  function handleUploadContract(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('File is larger than 5 MB. Please compress it or upload a smaller file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      const contractInfo: ClientContractInfo = {
        type: 'uploaded',
        fileName: file.name,
        fileData: base64,
        fileType: file.type,
        createdAt: todayStr(),
      };
      setForm(f => ({ ...f, contract: contractInfo }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handlePreviewContract() {
    if (!form.contract) return;
    if (form.contract.type === 'uploaded' && form.contract.fileData && form.contract.fileType) {
      const binary = atob(form.contract.fileData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: form.contract.fileType });
      window.open(URL.createObjectURL(blob), '_blank');
    } else if (form.contract.type === 'generated') {
      const clientSnapshot = { ...form, id: editingClient?.id ?? '' } as Client;
      const html = generateContractHTML(clientSnapshot, {
        pricingModel: form.contract.pricingModel ?? 'retainer',
        retainerAmount: form.contract.retainerAmount ?? form.contractValue,
        commissionRate: form.contract.commissionRate ?? 10,
        commissionBasis: form.contract.commissionBasis ?? '',
        paymentTerms: form.contract.paymentTerms ?? 'Net 15',
        contractDuration: form.contract.contractDuration ?? 'Month-to-month',
        additionalNotes: form.contract.additionalNotes ?? '',
      });
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); }
    }
  }

  function handleDownloadContract() {
    if (!form.contract) return;
    if (form.contract.type === 'uploaded' && form.contract.fileData && form.contract.fileType) {
      const binary = atob(form.contract.fileData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: form.contract.fileType });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = form.contract.fileName;
      a.click();
    } else if (form.contract.type === 'generated') {
      const clientSnapshot = { ...form, id: editingClient?.id ?? '' } as Client;
      const html = generateContractHTML(clientSnapshot, {
        pricingModel: form.contract.pricingModel ?? 'retainer',
        retainerAmount: form.contract.retainerAmount ?? form.contractValue,
        commissionRate: form.contract.commissionRate ?? 10,
        commissionBasis: form.contract.commissionBasis ?? '',
        paymentTerms: form.contract.paymentTerms ?? 'Net 15',
        contractDuration: form.contract.contractDuration ?? 'Month-to-month',
        additionalNotes: form.contract.additionalNotes ?? '',
      });
      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = form.contract.fileName;
      a.click();
    }
  }

  function handlePrintContract() {
    if (!form.contract || form.contract.type !== 'generated') return;
    const clientSnapshot = { ...form, id: editingClient?.id ?? '' } as Client;
    const html = generateContractHTML(clientSnapshot, {
      pricingModel: form.contract.pricingModel ?? 'retainer',
      retainerAmount: form.contract.retainerAmount ?? form.contractValue,
      commissionRate: form.contract.commissionRate ?? 10,
      commissionBasis: form.contract.commissionBasis ?? '',
      paymentTerms: form.contract.paymentTerms ?? 'Net 15',
      contractDuration: form.contract.contractDuration ?? 'Month-to-month',
      additionalNotes: form.contract.additionalNotes ?? '',
    });
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
  }

  async function handleSignContract(sigDataUrl: string, signerName: string) {
    if (!form.contract) return;
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const baseName = form.contract.fileName.replace(/\.[^.]+$/, '');

    if (form.contract.type === 'generated') {
      const clientSnapshot = { ...form, id: editingClient?.id ?? '' } as Client;
      const html = generateContractHTML(clientSnapshot, {
        pricingModel: form.contract.pricingModel ?? 'retainer',
        retainerAmount: form.contract.retainerAmount ?? form.contractValue,
        commissionRate: form.contract.commissionRate ?? 10,
        commissionBasis: form.contract.commissionBasis ?? '',
        paymentTerms: form.contract.paymentTerms ?? 'Net 15',
        contractDuration: form.contract.contractDuration ?? 'Month-to-month',
        additionalNotes: form.contract.additionalNotes ?? '',
      });
      const signedHtml = injectSignatureIntoHTML(html, sigDataUrl, signerName, dateStr);
      // Use a Blob URL — more popup-friendly than window.open('', '_blank')
      const htmlBlob = new Blob([signedHtml], { type: 'text/html;charset=utf-8' });
      const htmlUrl = URL.createObjectURL(htmlBlob);
      const win = window.open(htmlUrl, '_blank');
      if (win) {
        win.onload = () => { win.focus(); win.print(); };
      } else {
        // Popup blocked — fall back to direct download
        const a = document.createElement('a');
        a.href = htmlUrl;
        a.download = `${baseName}_SIGNED.html`;
        a.click();
      }
    } else if (form.contract.type === 'uploaded' && form.contract.fileData && form.contract.fileType?.includes('pdf')) {
      try {
        // Decode base64 to bytes
        const binary = atob(form.contract.fileData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        // Load PDF
        const pdfDoc = await PDFDocument.load(bytes);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        // Embed signature image (decode data URL directly — no fetch needed)
        const sigBase64 = sigDataUrl.split(',')[1];
        const sigBinary = atob(sigBase64);
        const sigBytes = new Uint8Array(sigBinary.length);
        for (let i = 0; i < sigBinary.length; i++) sigBytes[i] = sigBinary.charCodeAt(i);
        const sigImage = await pdfDoc.embedPng(sigBytes);
        const sigDims = sigImage.scale(Math.min(160 / sigImage.width, 56 / sigImage.height));

        // Signature block at bottom-left
        const margin = 60;
        const yBase = margin + 80;

        lastPage.drawImage(sigImage, {
          x: margin,
          y: yBase,
          width: sigDims.width,
          height: sigDims.height,
        });

        // Signature line
        lastPage.drawLine({
          start: { x: margin, y: yBase - 4 },
          end: { x: margin + 200, y: yBase - 4 },
          thickness: 0.5,
          color: rgb(0.2, 0.2, 0.2),
        });

        // Signer name text
        const font = await pdfDoc.embedFont('Helvetica' as Parameters<typeof pdfDoc.embedFont>[0]);
        lastPage.drawText(signerName, {
          x: margin, y: yBase - 16,
          size: 9, font, color: rgb(0.3, 0.3, 0.3),
        });
        lastPage.drawText(dateStr, {
          x: margin, y: yBase - 28,
          size: 8, font, color: rgb(0.5, 0.5, 0.5),
        });

        // Save + download — slice the ArrayBuffer to exact byte range (buffer may be oversized)
        const pdfBytes = await pdfDoc.save();
        const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
        const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${baseName}_SIGNED.pdf`;
        a.click();
      } catch (err) {
        console.error('PDF signing failed:', err);
        alert('Could not sign this PDF. Try downloading it and signing manually.');
      }
    } else {
      // Non-PDF upload — download as-is with SIGNED suffix
      handleDownloadContract();
    }
    setSignModalOpen(false);
  }

  const paymentsTotal = form.payments.reduce((s, p) => s + p.amount, 0);
  const paymentsPaid = form.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Building2 size={22} style={{ color: 'var(--text-muted)' }} />
            Clients
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Vanta Brand Scaling LLC · Client & payment tracker</p>
        </div>
        <button onClick={openAdd} className="caesar-btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Client
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active Clients',   value: String(stats.active),           icon: <Users size={16} />,        color: '#10b981' },
          { label: 'Monthly Revenue',  value: fmtUSD(stats.contracted),       icon: <Briefcase size={16} />,    color: 'var(--text-muted)' },
          { label: 'Paid to Date',     value: fmtUSD(stats.totalPaid),        icon: <CheckCircle2 size={16} />, color: '#10b981' },
          { label: 'Outstanding',      value: fmtUSD(stats.totalOutstanding), icon: <AlertCircle size={16} />,  color: stats.overdueCount > 0 ? '#ef4444' : '#d97706' },
        ].map(s => (
          <div key={s.label} className="caesar-card p-4 rounded-xl">
            <div className="flex items-center gap-2 mb-1" style={{ color: s.color }}>
              {s.icon}
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly billing reminders */}
      {billingReminders.length > 0 && (
        <div className="rounded-xl border p-4 space-y-3"
          style={{ backgroundColor: 'var(--bg-elevated)', borderColor: billingReminders.some(r => r.daysUntilDue < 0) ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)' }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            <Bell size={15} style={{ color: billingReminders.some(r => r.daysUntilDue < 0) ? '#ef4444' : '#d97706' }} />
            Billing Reminders
            <span className="ml-auto text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
              {billingReminders.length} invoice{billingReminders.length !== 1 ? 's' : ''} not yet generated this month
            </span>
          </div>
          <div className="space-y-2">
            {billingReminders.map(({ client, dueDate, daysUntilDue, monthName, yr }) => {
              const isOverdue = daysUntilDue < 0;
              const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 5;
              const color = isOverdue ? '#ef4444' : isDueSoon ? '#d97706' : 'var(--text-muted)';
              return (
                <div key={client.id} className="flex items-center gap-3 rounded-lg p-3"
                  style={{ backgroundColor: 'var(--bg-card)', border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.2)' : 'var(--border)'}` }}>
                  <div style={{ color }}>
                    {isOverdue ? <AlertCircle size={14} /> : <Clock size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {client.company || client.name}
                    </span>
                    <span className="text-xs ml-2" style={{ color }}>
                      {isOverdue
                        ? `Invoice overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''}`
                        : daysUntilDue === 0
                          ? 'Invoice due today'
                          : `Invoice due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`
                      }
                    </span>
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {fmtUSD(client.contractValue)}
                  </span>
                  <button
                    onClick={() => generateInvoice(client, dueDate, monthName, yr)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:border-[var(--border-strong)]"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    <RefreshCw size={11} /> Generate
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', ...CLIENT_STATUSES.map(s => s.key)] as (ClientStatus | 'all')[]).map(key => {
          const cfg = CLIENT_STATUSES.find(s => s.key === key);
          const count = key === 'all' ? clients.length : clients.filter(c => c.status === key).length;
          return (
            <button key={key} onClick={() => setFilterStatus(key)}
              className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
              style={{
                backgroundColor: filterStatus === key ? (cfg ? `${cfg.color}20` : 'var(--bg-elevated)') : 'transparent',
                borderColor: filterStatus === key ? (cfg ? `${cfg.color}40` : 'var(--border)') : 'var(--border)',
                color: filterStatus === key ? (cfg ? cfg.color : 'var(--text-primary)') : 'var(--text-muted)',
              }}>
              {key === 'all' ? 'All' : cfg!.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
        <input className="caesar-input pl-9 w-full" placeholder="Search by name, company, or service…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </div>

      {/* Client grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p>{clients.length === 0 ? 'No clients yet. Add your first client.' : 'No clients match your filters.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => (
            <ClientCard key={c.id} client={c} onEdit={() => openEdit(c)} onDelete={() => deleteClient(c.id)} />
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingClient ? `Edit · ${editingClient.company || editingClient.name}` : 'Add Client'}
        size="lg"
      >
        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b" style={{ borderColor: 'var(--border)' }}>
          {([
            { key: 'details',  label: 'Details',  icon: <Users size={13} /> },
            { key: 'payments', label: 'Payments', icon: <CreditCard size={13} /> },
            { key: 'notes',    label: 'Notes',    icon: <FileText size={13} /> },
            { key: 'contract', label: 'Contract', icon: <FileCheck size={13} /> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors"
              style={{
                borderColor: tab === t.key ? 'var(--text-primary)' : 'transparent',
                color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Details Tab ── */}
        {tab === 'details' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Company *</label>
                <input className="caesar-input w-full mt-1" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Business name" autoFocus />
              </div>
              <div>
                <label className="caesar-label">Contact Name</label>
                <input className="caesar-input w-full mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Primary contact" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Email</label>
                <input type="email" className="caesar-input w-full mt-1" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div>
                <label className="caesar-label">Phone</label>
                <input type="tel" className="caesar-input w-full mt-1" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 000-0000" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Status</label>
                <select className="caesar-select w-full mt-1" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ClientStatus }))}>
                  {CLIENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="caesar-label">Start Date</label>
                <input type="date" className="caesar-input w-full mt-1" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
            </div>

            {/* Services multi-select */}
            <div>
              <label className="caesar-label">Services</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SERVICES.map(s => {
                  const selected = form.services.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleService(s)}
                      className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                      style={{
                        backgroundColor: selected ? 'var(--bg-elevated)' : 'transparent',
                        borderColor: selected ? 'var(--border-strong)' : 'var(--border)',
                        color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="caesar-label">Monthly Contract Value ($)</label>
                <input type="number" min={0} className="caesar-input w-full mt-1"
                  value={form.contractValue || ''}
                  onChange={e => setForm(f => ({ ...f, contractValue: parseFloat(e.target.value) || 0 }))}
                  placeholder="0" />
              </div>
              <div>
                <label className="caesar-label">Invoice Day of Month</label>
                <select className="caesar-select w-full mt-1" value={form.billingDay ?? ''}
                  onChange={e => setForm(f => ({ ...f, billingDay: e.target.value ? parseInt(e.target.value) : undefined }))}>
                  <option value="">No recurring billing</option>
                  {BILLING_DAYS.map(d => <option key={d} value={d}>{ordinal(d)} of each month</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="caesar-label">End Date (optional)</label>
              <input type="date" className="caesar-input w-full mt-1" value={form.endDate ?? ''} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
        )}

        {/* ── Payments Tab ── */}
        {tab === 'payments' && (
          <div className="space-y-4">
            {form.payments.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total',     value: fmtUSD(paymentsTotal),                  color: 'var(--text-primary)' },
                  { label: 'Paid',      value: fmtUSD(paymentsPaid),                   color: '#10b981' },
                  { label: 'Remaining', value: fmtUSD(paymentsTotal - paymentsPaid),   color: paymentsTotal - paymentsPaid > 0 ? '#d97706' : 'var(--text-muted)' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-3 text-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                    <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {form.payments.length === 0 && !showPaymentForm && (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No payments yet.</p>
              )}
              {[...form.payments].sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map(p => (
                <PaymentRow key={p.id} payment={p} onMarkPaid={() => markPaymentPaid(p.id)} onDelete={() => deletePayment(p.id)} />
              ))}
            </div>

            {showPaymentForm ? (
              <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>New Payment</div>
                <div>
                  <label className="caesar-label">Description</label>
                  <input className="caesar-input w-full mt-1" value={paymentForm.description}
                    onChange={e => setPaymentForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. March retainer, Ad spend invoice…" autoFocus />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="caesar-label">Amount ($)</label>
                    <input type="number" min={0} className="caesar-input w-full mt-1"
                      value={paymentForm.amount || ''}
                      onChange={e => setPaymentForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="caesar-label">Due Date</label>
                    <input type="date" className="caesar-input w-full mt-1" value={paymentForm.dueDate}
                      onChange={e => setPaymentForm(f => ({ ...f, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="caesar-label">Status</label>
                  <select className="caesar-select w-full mt-1" value={paymentForm.status}
                    onChange={e => setPaymentForm(f => ({ ...f, status: e.target.value as PaymentStatus }))}>
                    {PAYMENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={addPayment} disabled={!paymentForm.description.trim() || paymentForm.amount <= 0}
                    className="caesar-btn-primary flex-1 disabled:opacity-50">Add Payment</button>
                  <button onClick={() => { setShowPaymentForm(false); setPaymentForm(emptyPayment()); }} className="caesar-btn-ghost">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowPaymentForm(true)}
                className="w-full py-2.5 rounded-lg border border-dashed text-xs flex items-center justify-center gap-1.5 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <Plus size={13} /> Add Payment
              </button>
            )}
          </div>
        )}

        {/* ── Notes Tab ── */}
        {tab === 'notes' && (
          <div>
            <label className="caesar-label">Client Notes</label>
            <textarea className="caesar-textarea w-full mt-1" rows={10}
              placeholder="Contract details, communication history, preferences, next steps…"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        )}

        {/* ── Contract Tab ── */}
        {tab === 'contract' && (
          <div className="space-y-4">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*,.doc,.docx,.pages"
              className="hidden"
              onChange={handleUploadContract}
            />

            {/* Existing contract */}
            {form.contract ? (
              <div className="rounded-xl border p-4 space-y-3"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'var(--bg-card)' }}>
                    {form.contract.type === 'generated'
                      ? <FileCheck size={18} style={{ color: '#10b981' }} />
                      : <FileText size={18} style={{ color: '#3b82f6' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {form.contract.fileName}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {form.contract.type === 'generated' ? 'Auto-generated' : 'Uploaded'} · {formatDate(form.contract.createdAt)}
                    </p>
                    {form.contract.type === 'generated' && (
                      <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--text-muted)' }}>
                        {form.contract.pricingModel === 'retainer'
                          ? `Retainer · $${(form.contract.retainerAmount ?? 0).toLocaleString()}/mo`
                          : `Commission · ${form.contract.commissionRate ?? 0}%`
                        }
                        {form.contract.paymentTerms && ` · ${form.contract.paymentTerms}`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button onClick={handlePreviewContract}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:border-[var(--border-strong)]"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    <Eye size={12} /> Preview
                  </button>
                  <button onClick={handleDownloadContract}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:border-[var(--border-strong)]"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    <Download size={12} /> Download
                  </button>
                  {form.contract.type === 'generated' && (
                    <button onClick={handlePrintContract}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:border-[var(--border-strong)]"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      <Printer size={12} /> Print / Save PDF
                    </button>
                  )}
                  <button onClick={() => setSignModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all hover:opacity-90"
                    style={{ backgroundColor: '#10b981', borderColor: '#10b981', color: '#fff' }}>
                    <PenLine size={12} /> Sign &amp; Download
                  </button>
                  <button onClick={() => setForm(f => ({ ...f, contract: undefined }))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ml-auto transition-all"
                    style={{ borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              !showContractGenerator && (
                <div className="rounded-xl border-2 border-dashed py-10 text-center space-y-4"
                  style={{ borderColor: 'var(--border)' }}>
                  <FileCheck size={36} className="mx-auto opacity-20" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No contract on file</p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => {
                        setContractForm(f => ({ ...f, retainerAmount: form.contractValue }));
                        setShowContractGenerator(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-medium transition-all hover:border-[var(--border-strong)]"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      <FilePlus size={13} /> Generate from Template
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-medium transition-all hover:border-[var(--border-strong)]"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                      <Upload size={13} /> Upload Contract
                    </button>
                  </div>
                </div>
              )
            )}

            {/* Contract Generator */}
            {showContractGenerator && !form.contract && (
              <div className="rounded-xl border p-4 space-y-4"
                style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Generate Contract</p>
                  <button onClick={() => setShowContractGenerator(false)} style={{ color: 'var(--text-muted)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Pricing model toggle */}
                <div>
                  <label className="caesar-label">Pricing Model</label>
                  <div className="flex gap-2 mt-1">
                    {(['retainer', 'commission'] as const).map(m => (
                      <button key={m} type="button"
                        onClick={() => setContractForm(f => ({ ...f, pricingModel: m }))}
                        className="flex-1 py-2 rounded-lg border text-xs font-medium capitalize transition-all"
                        style={{
                          backgroundColor: contractForm.pricingModel === m ? 'var(--bg-card)' : 'transparent',
                          borderColor: contractForm.pricingModel === m ? 'var(--border-strong)' : 'var(--border)',
                          color: contractForm.pricingModel === m ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}>
                        {m === 'retainer' ? 'Monthly Retainer' : 'Commission-Based'}
                      </button>
                    ))}
                  </div>
                </div>

                {contractForm.pricingModel === 'retainer' ? (
                  <div>
                    <label className="caesar-label">Monthly Retainer Amount ($)</label>
                    <input type="number" min={0} className="caesar-input w-full mt-1"
                      value={contractForm.retainerAmount || ''}
                      onChange={e => setContractForm(f => ({ ...f, retainerAmount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="caesar-label">Commission Rate (%)</label>
                      <input type="number" min={0} max={100} step={0.5} className="caesar-input w-full mt-1"
                        value={contractForm.commissionRate || ''}
                        onChange={e => setContractForm(f => ({ ...f, commissionRate: parseFloat(e.target.value) || 0 }))}
                        placeholder="10" />
                    </div>
                    <div>
                      <label className="caesar-label">Commission Based On</label>
                      <input className="caesar-input w-full mt-1"
                        value={contractForm.commissionBasis}
                        onChange={e => setContractForm(f => ({ ...f, commissionBasis: e.target.value }))}
                        placeholder="gross sales revenue" />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="caesar-label">Contract Duration</label>
                    <select className="caesar-select w-full mt-1" value={contractForm.contractDuration}
                      onChange={e => setContractForm(f => ({ ...f, contractDuration: e.target.value }))}>
                      {['Month-to-month', '3 months', '6 months', '1 year', '2 years'].map(d =>
                        <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="caesar-label">Payment Terms</label>
                    <select className="caesar-select w-full mt-1" value={contractForm.paymentTerms}
                      onChange={e => setContractForm(f => ({ ...f, paymentTerms: e.target.value }))}>
                      {['Due on Receipt', 'Net 7', 'Net 15', 'Net 30'].map(t =>
                        <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="caesar-label">Additional Scope Notes (optional)</label>
                  <textarea className="caesar-textarea w-full mt-1" rows={2}
                    placeholder="e.g. Includes up to 3 revisions per deliverable…"
                    value={contractForm.additionalNotes}
                    onChange={e => setContractForm(f => ({ ...f, additionalNotes: e.target.value }))} />
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={handleGenerateContract}
                    className="caesar-btn-primary flex-1 flex items-center justify-center gap-2">
                    <Eye size={13} /> Generate &amp; Preview
                  </button>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                    <Upload size={12} /> Upload Instead
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-4 mt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={saveClient} disabled={!form.name.trim() && !form.company.trim()}
            className="caesar-btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed">
            {editingClient ? 'Save Changes' : 'Add Client'}
          </button>
          <button onClick={closeModal} className="caesar-btn-ghost flex-1">Cancel</button>
        </div>
      </Modal>

      {signModalOpen && form.contract && (
        <ContractSignModal
          contractName={form.contract.fileName}
          onSign={handleSignContract}
          onClose={() => setSignModalOpen(false)}
        />
      )}
    </div>
  );
}

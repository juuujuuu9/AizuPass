import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatRelativeTime } from '@/lib/formatters';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  QrCode,
  Users,
  Search,
  Download,
  Mail,
  RotateCcw,
  Trash2,
  UserCheck,
  FolderArchive,
  Printer,
  ListFilter,
} from 'lucide-react';
import { toast } from 'sonner';
import Fuse from 'fuse.js';
import type { Attendee } from '@/types/attendee';
import { apiService } from '@/services/api';
import { generateQRCodeBase64 } from '@/lib/qr-client';
import JSZip from 'jszip';
import {
  attendeeQrPngFilename,
  dataUrlToUint8Array,
  MAX_QR_EXPORT_ATTENDEE_IDS,
} from '@/lib/bulk-qr-zip';
import { QRDisplay } from './QRDisplay';
import { ButtonSpinner } from '@/components/ui/ButtonSpinner';
import { ScanQrMark } from './ScanQrMark';
import { BadgePrintDialog } from './BadgePrintDialog';
import {
  attendeeNameKey,
  attendeeShortId,
  duplicateNameKeys,
} from '@/lib/attendee-disambig';

function formatNameLastFirst(attendee: Attendee): string {
  return `${attendee.lastName}, ${attendee.firstName}`;
}

function getInitials(attendee: Attendee): string {
  const f = attendee.firstName?.charAt(0) ?? '';
  const l = attendee.lastName?.charAt(0) ?? '';
  return (f + l).toUpperCase() || '?';
}

/** Guest list: filter by check-in status (search is applied first). */
type AttendeeStatusFilter = 'all' | 'checked-in' | 'not-checked-in';

function buildAttendeeCsvLines(rows: Attendee[], escapeCsvField: (v: string | number | null | undefined) => string): string {
  const headers = [
    'Attendee ID',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Company',
    'Dietary Restrictions',
    'Checked In',
    'Check-in Time',
    'Registration Date',
  ];
  return [
    headers.map(escapeCsvField).join(','),
    ...rows.map((a) =>
      [
        a.id,
        a.firstName,
        a.lastName,
        a.email,
        a.phone ?? '',
        a.company ?? '',
        a.dietaryRestrictions ?? '',
        a.checkedIn ? 'Yes' : 'No',
        a.checkedInAt ? new Date(a.checkedInAt).toLocaleString() : '',
        new Date(a.rsvpAt).toLocaleDateString(),
      ]
        .map(escapeCsvField)
        .join(',')
    ),
  ].join('\n');
}

interface AdminDashboardProps {
  attendees: Attendee[];
  /** When set, show Import CSV (event-scoped) when `canImportCsv`; bulk QR email uses event context. */
  eventId?: string;
  /** Organizers only; staff use attendees without CSV import. */
  canImportCsv?: boolean;
  /** Used in bulk QR email copy when resending. */
  eventName?: string;
  /** Desktop: show scanner CTA in the stats row (mobile uses header link in AdminPage). */
  showScannerCta?: boolean;
  /** Organizers can create events; staff should not see "Create event" empty-state CTAs. */
  canCreateEvent?: boolean;
  onRefresh: () => void;
}

export function AdminDashboard({
  attendees,
  eventId,
  eventName,
  showScannerCta = false,
  canCreateEvent = true,
  canImportCsv = true,
  onRefresh,
}: AdminDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(
    null
  );
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [sortDescending, setSortDescending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window === 'undefined') return 'comfortable';
    return (localStorage.getItem('table-density') as 'comfortable' | 'compact') || 'comfortable';
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResendingQR, setBulkResendingQR] = useState(false);
  const [bulkZippingQR, setBulkZippingQR] = useState(false);
  /** Mobile: attendee id for bottom-sheet details (null = closed). */
  const [mobileDetailId, setMobileDetailId] = useState<string | null>(null);
  const [badgePrintOpen, setBadgePrintOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AttendeeStatusFilter>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const duplicateNameKeySet = useMemo(
    () => duplicateNameKeys(attendees),
    [attendees]
  );

  /** Stable array identity when selection unchanged — avoids refetch loops in `BadgePrintDialog`. */
  const selectedAttendeeIdsForBulk = useMemo(
    () => Array.from(selectedIds),
    [selectedIds]
  );

  const fuse = useRef(
    new Fuse<Attendee>([], {
      keys: ['firstName', 'lastName', 'email', 'company', 'id'],
      threshold: 0.3,
    })
  ).current;
  useEffect(() => {
    fuse.setCollection(attendees);
  }, [attendees]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') onRefresh();
    }, 30000);
    return () => clearInterval(id);
  }, [onRefresh]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);

  useEffect(() => {
    localStorage.setItem('table-density', density);
  }, [density]);

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedAttendees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAttendees.map((a) => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} attendee(s)?`)) return;
    for (const id of selectedIds) {
      try {
        await apiService.deleteAttendee(id);
      } catch {
        toast.error(`Failed to delete attendee`);
      }
    }
    toast.success(`Deleted ${selectedIds.size} attendee(s)`);
    setSelectedIds(new Set());
    onRefresh();
  };

  // LO-3: Properly escape CSV fields with formula injection protection
  const escapeCsvField = (val: string | number | null | undefined): string => {
    if (val == null) return '""';
    const s = String(val);
    // Sanitize formula-triggering characters
    const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
    const firstChar = s.charAt(0);
    const sanitized = dangerousChars.includes(firstChar) ? `'` + s : s;
    // Escape quotes by doubling them
    return `"${sanitized.replace(/"/g, '""')}"`;
  };

  const handleBulkExport = () => {
    const toExport = sortedAttendees.filter((a) => selectedIds.has(a.id));
    if (toExport.length === 0) return;
    const csvContent = buildAttendeeCsvLines(toExport, escapeCsvField);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-attendees-selected-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${toExport.length} attendee(s)`);
  };

  const handleExportNoShows = () => {
    const noShows = attendees.filter((a) => !a.checkedIn);
    if (noShows.length === 0) {
      toast.info('Everyone has checked in — nothing to export.');
      return;
    }
    const csvContent = buildAttendeeCsvLines(noShows, escapeCsvField);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeEv = (eventName ?? 'event')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'event';
    a.download = `${safeEv}-no-shows-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${noShows.length} not checked in`);
  };

  const handleBulkQrZip = async () => {
    if (!eventId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (ids.length > MAX_QR_EXPORT_ATTENDEE_IDS) {
      toast.error(
        `Select at most ${MAX_QR_EXPORT_ATTENDEE_IDS} attendees for one ZIP`
      );
      return;
    }
    setBulkZippingQR(true);
    try {
      const items = await apiService.getQRExportPayloads(eventId, ids);
      if (items.length === 0) {
        toast.error('No QR data returned for the selection');
        return;
      }
      const zip = new JSZip();
      const used = new Set<string>();
      for (const item of items) {
        const dataUrl = await generateQRCodeBase64(item.qrPayload, {
          profile: 'print',
        });
        const bytes = dataUrlToUint8Array(dataUrl);
        let fname = attendeeQrPngFilename(item.firstName, item.lastName, item.attendeeId);
        if (used.has(fname)) {
          fname = fname.replace(/\.png$/, '') + `-${item.attendeeId.slice(0, 8)}.png`;
        }
        used.add(fname);
        zip.file(fname, bytes);
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeEv = (eventName ?? 'event')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'event';
      a.download = `${safeEv}-qr-codes-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ZIP with ${items.length} QR code(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to build ZIP');
    } finally {
      setBulkZippingQR(false);
    }
  };

  const handleBulkResendQR = async () => {
    if (!eventId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (
      !confirm(
        `Resend QR code emails to ${ids.length} selected attendee(s)?`
      )
    ) {
      return;
    }
    setBulkResendingQR(true);
    try {
      const result = await apiService.sendBulkQREmails({
        attendeeIds: ids,
        eventId,
        eventName: eventName?.trim() || undefined,
      });
      if (result.failed === 0) {
        toast.success(`Sent ${result.sent} QR email(s)`);
      } else {
        toast.warning(
          `Sent ${result.sent}, failed ${result.failed}. Check server logs for details.`
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to resend QR emails'
      );
    } finally {
      setBulkResendingQR(false);
    }
  };

  const searchFilteredAttendees = useMemo(() => {
    if (!searchTerm.trim()) return attendees;
    return fuse.search(searchTerm).map((r) => r.item);
  }, [attendees, searchTerm]);

  const statusFilteredAttendees = useMemo(() => {
    return searchFilteredAttendees.filter((a) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'checked-in') return a.checkedIn;
      return !a.checkedIn;
    });
  }, [searchFilteredAttendees, statusFilter]);

  const sortedAttendees = useMemo(() => {
    return [...statusFilteredAttendees].sort((a, b) => {
      const cmp = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' })
        || a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
      return sortDescending ? -cmp : cmp;
    });
  }, [statusFilteredAttendees, sortDescending]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(sortedAttendees.map((a) => a.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
    });
  }, [sortedAttendees]);

  const mobileDetailAttendee =
    mobileDetailId === null
      ? null
      : sortedAttendees.find((a) => a.id === mobileDetailId) ??
        attendees.find((a) => a.id === mobileDetailId) ??
        null;

  useEffect(() => {
    if (mobileDetailId !== null && !mobileDetailAttendee) {
      setMobileDetailId(null);
    }
  }, [mobileDetailId, mobileDetailAttendee]);

  const totalAttendees = attendees.length;
  const checkedInCount = attendees.filter((a) => a.checkedIn).length;
  const pendingCount = totalAttendees - checkedInCount;
  const checkInPercent =
    totalAttendees > 0
      ? Math.round((checkedInCount / totalAttendees) * 100)
      : 0;
  const donutRadius = 36;
  const donutCirc = 2 * Math.PI * donutRadius;
  const donutDashOffset =
    donutCirc - (checkInPercent / 100) * donutCirc;

  const handleDelete = async (id: string): Promise<boolean> => {
    if (!confirm('Are you sure you want to delete this attendee?')) return false;
    setDeletingId(id);
    try {
      await apiService.deleteAttendee(id);
      toast.success('Attendee deleted');
      onRefresh();
      return true;
    } catch {
      toast.error('Failed to delete attendee');
      return false;
    } finally {
      setDeletingId(null);
    }
  };

  const loadQRForAttendee = async (attendee: Attendee) => {
    const { qrPayload } = await apiService.getQRPayload(attendee.id);
    const url = await generateQRCodeBase64(qrPayload);
    setQrDataUrl(url);
  };

  const openQrForAttendee = async (attendee: Attendee) => {
    setMobileDetailId(null);
    setSelectedAttendee(attendee);
    await loadQRForAttendee(attendee);
    setShowQR(true);
  };

  const handleManualCheckIn = async (attendee: Attendee) => {
    if (attendee.checkedIn) return;
    if (!eventId) {
      toast.error('No event selected');
      return;
    }
    setCheckingInId(attendee.id);
    try {
      const result = await apiService.checkInAttendeeById(attendee.id, eventId);
      if (result.success) {
        toast.success(
          result.message || `${formatNameLastFirst(attendee)} checked in`
        );
        if (mobileDetailId === attendee.id) setMobileDetailId(null);
        onRefresh();
      } else if (result.alreadyCheckedIn) {
        toast.info(result.message || 'Already checked in');
        onRefresh();
      } else {
        toast.error(result.message || 'Check-in failed');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Check-in failed');
    } finally {
      setCheckingInId(null);
    }
  };

  const handleSendQREmail = async (attendee: Attendee) => {
    const name = formatNameLastFirst(attendee);
    if (
      !confirm(
        `Send a QR code email to this guest?\n\n${name}\n${attendee.email}\n\nThis will email them immediately.`
      )
    ) {
      return;
    }
    setSendingEmailId(attendee.id);
    try {
      const { qrPayload } = await apiService.getQRPayload(attendee.id);
      const dataUrl = await generateQRCodeBase64(qrPayload);
      await apiService.sendEmail(attendee.id, dataUrl);
      toast.success(`QR code sent to ${attendee.email}`);
    } catch {
      toast.error('Failed to send email');
    } finally {
      setSendingEmailId(null);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        {showScannerCta && (
          <a
            href={eventId ? `/?event=${encodeURIComponent(eventId)}` : '/'}
            aria-label="Open check-in scanner"
            className="hidden min-h-0 w-[12rem] shrink-0 rounded-xl border-0 bg-red-600 p-0 pb-4 text-sm font-medium text-white shadow-sm outline-none transition-colors hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:flex md:flex-col"
          >
            <span className="block min-h-0 w-full aspect-square flex-1 overflow-hidden">
              <ScanQrMark className="block h-full w-full min-h-0" />
            </span>
            <span className="mt-1 flex w-full shrink-0 items-center justify-center leading-none">
              Open Scanner
            </span>
          </a>
        )}
        <Card className="min-w-0 flex-1 md:hidden">
          <CardContent className="flex items-stretch justify-between gap-2 px-3">
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-center">
              <span className="text-3xl font-bold tabular-nums text-green-600 leading-none">
                {checkedInCount}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                checked in
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Check-in rate
              </span>
              <div className="relative flex size-44 items-center justify-center">
                <svg
                  className="size-full -rotate-90"
                  viewBox="0 0 100 100"
                  aria-hidden
                >
                  <circle
                    cx="50"
                    cy="50"
                    r={donutRadius}
                    fill="none"
                    className="stroke-muted"
                    strokeWidth="10"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={donutRadius}
                    fill="none"
                    className="stroke-blue-600 transition-[stroke-dashoffset] duration-300"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={donutCirc}
                    strokeDashoffset={donutDashOffset}
                  />
                </svg>
                <span className="absolute text-4xl font-bold tabular-nums text-blue-600 leading-none">
                  {checkInPercent}%
                </span>
              </div>
              <span className="text-sm tabular-nums text-muted-foreground">
                {checkedInCount} / {totalAttendees}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-center">
              <span className="text-3xl font-bold tabular-nums text-orange-600 leading-none">
                {pendingCount}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                pending
              </span>
            </div>
          </CardContent>
        </Card>
        <div className="hidden min-h-0 min-w-0 flex-1 grid-cols-3 gap-4 md:grid">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Check-in Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-5xl font-bold text-blue-600 leading-tight">
              {checkInPercent}%
            </div>
            {totalAttendees > 0 && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{
                    width: `${(checkedInCount / totalAttendees) * 100}%`,
                  }}
                />
              </div>
            )}
            {totalAttendees > 0 && (
              <p className="text-xs text-muted-foreground">
                {checkedInCount} of {totalAttendees} checked in
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Checked In</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold text-green-600 leading-tight">
              {checkedInCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Users className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold text-orange-600 leading-tight">
              {pendingCount}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>

      <Card className="min-w-0 max-w-full">
        <CardHeader className="flex min-w-0 flex-col gap-4">
          <div>
            <CardTitle className="text-2xl font-semibold">Attendee List</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {statusFilteredAttendees.length} of {attendees.length} attendees
              {searchTerm.trim() ? ' match search' : ''}
              {statusFilter !== 'all' ? (
                <span className="text-foreground/90">
                  {' · '}
                  {statusFilter === 'checked-in' ? 'Checked in only' : 'Not checked in only'}
                </span>
              ) : null}
            </CardDescription>
          </div>
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-2"
            role="group"
            aria-label="Filter by check-in status"
          >
            <span className="inline-flex items-center gap-1.5 pl-1 text-xs font-medium text-muted-foreground">
              <ListFilter className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Status
            </span>
            {(['all', 'checked-in', 'not-checked-in'] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={statusFilter === key}
                onClick={() => setStatusFilter(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
                }`}
              >
                {key === 'all' ? 'All' : key === 'checked-in' ? 'Checked in' : 'Not checked in'}
              </button>
            ))}
          </div>
          <div className="flex flex-row items-center gap-2 sm:gap-4 w-full">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                ref={searchInputRef}
                placeholder="Search attendees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 h-9 w-full"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[9px] font-medium text-muted-foreground">
                <span className="text-[10px]">⌘</span>K
              </kbd>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 sm:ml-auto">
              <Button
                onClick={handleExportNoShows}
                variant="outline"
                size="sm"
                disabled={attendees.length === 0 || pendingCount === 0}
                title={
                  pendingCount === 0
                    ? 'Everyone has checked in'
                    : 'Download CSV of everyone not checked in (full guest list)'
                }
              >
                <Download className="h-4 w-4 mr-1.5" />
                Export no-shows
              </Button>
              <Button onClick={onRefresh} variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Density:</span>
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDensity('comfortable')}
                  className={`px-2 py-1 text-xs font-medium ${
                    density === 'comfortable'
                      ? 'bg-muted'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  Comfortable
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={`px-2 py-1 text-xs font-medium border-l ${
                    density === 'compact'
                      ? 'bg-muted'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  Compact
                </button>
              </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          {sortedAttendees.length === 0 ? (
            attendees.length > 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
                <p className="text-sm font-medium text-foreground">No attendees match</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Try another search, choose <strong className="text-foreground">All</strong> under status, or widen your filters.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                >
                  Clear search and status filter
                </Button>
              </div>
            ) : !eventId && !canCreateEvent ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="mb-1 text-lg font-semibold text-foreground">Select an event</h3>
                <p className="mb-6 max-w-sm text-sm text-muted-foreground">
                  Choose an event above to manage attendees, or open your organization to see available events.
                </p>
                <a
                  href="/admin/organization"
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Organization
                </a>
              </div>
            ) : (
              <EmptyState
                onAddAttendee={() => {
                  window.location.href = eventId ? '/' : '/admin/events/new';
                }}
                onImportCSV={
                  eventId && canImportCsv
                    ? () => {
                        window.location.href = `/admin/events/import?event=${eventId}`;
                      }
                    : undefined
                }
                addButtonLabel={eventId ? 'Add Attendee' : 'Create Event'}
                addButtonRed={!eventId}
              />
            )
          ) : (
          <div className="min-w-0 space-y-2">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted">
                <span className="text-sm font-medium">
                  {selectedIds.size} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkExport}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
                {eventId && canImportCsv && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (selectedIds.size > MAX_QR_EXPORT_ATTENDEE_IDS) {
                          toast.error(
                            `Select at most ${MAX_QR_EXPORT_ATTENDEE_IDS} attendees for print badges`
                          );
                          return;
                        }
                        setBadgePrintOpen(true);
                      }}
                      disabled={
                        selectedIds.size === 0 ||
                        selectedIds.size > MAX_QR_EXPORT_ATTENDEE_IDS
                      }
                      title={
                        selectedIds.size > MAX_QR_EXPORT_ATTENDEE_IDS
                          ? `Select at most ${MAX_QR_EXPORT_ATTENDEE_IDS} guests for one print run.`
                          : 'Print-ready badges (name + id under QR) for selected guests. Organizers only.'
                      }
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      Print badges
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleBulkQrZip()}
                      disabled={bulkZippingQR}
                      title="PNG QR codes for selected guests (does not rotate existing valid codes). Organizers only."
                    >
                      {bulkZippingQR ? (
                        <ButtonSpinner className="h-4 w-4 mr-1" />
                      ) : (
                        <FolderArchive className="h-4 w-4 mr-1" />
                      )}
                      QR ZIP
                    </Button>
                  </>
                )}
                {eventId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkResendQR}
                    disabled={bulkResendingQR}
                  >
                    {bulkResendingQR ? (
                      <ButtonSpinner className="h-4 w-4 mr-1" />
                    ) : (
                      <Mail className="h-4 w-4 mr-1" />
                    )}
                    Resend QR codes
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            )}
          <div className="md:hidden max-w-full min-w-0 space-y-2">
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 -mr-2 text-muted-foreground"
                onClick={() => setSortDescending((d) => !d)}
              >
                Name
                {sortDescending ? (
                  <ArrowDown className="ml-1 h-4 w-4" />
                ) : (
                  <ArrowUp className="ml-1 h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="max-h-[min(400px,55dvh)] space-y-2 overflow-y-auto pr-0.5">
              {sortedAttendees.map((attendee) => (
                <div
                  key={attendee.id}
                  className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm"
                >
                  <div className="flex gap-2 p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(attendee.id)}
                      onChange={() => toggleSelect(attendee.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2.5 shrink-0 rounded border-input"
                      aria-label={`Select ${formatNameLastFirst(attendee)}`}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 rounded-md text-left outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setMobileDetailId(attendee.id)}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-medium text-white"
                          aria-hidden
                        >
                          {getInitials(attendee)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-foreground">
                              {formatNameLastFirst(attendee)}
                              {duplicateNameKeySet.has(attendeeNameKey(attendee)) ? (
                                <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                                  {attendeeShortId(attendee.id)}
                                </span>
                              ) : null}
                            </span>
                            <StatusBadge
                              status={attendee.checkedIn ? 'checked-in' : 'pending'}
                              pendingLabel="Not Yet"
                              className="shrink-0"
                            />
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            {attendee.email}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                  <div className="border-t border-border px-3 py-2.5">
                    <Button
                      className={
                        attendee.checkedIn ? 'w-full text-muted-foreground' : 'w-full'
                      }
                      variant="outline"
                      size="default"
                      onClick={() => handleManualCheckIn(attendee)}
                      disabled={attendee.checkedIn || checkingInId === attendee.id}
                    >
                      {checkingInId === attendee.id ? (
                        <>
                          <ButtonSpinner className="mr-2 h-4 w-4" />
                          Checking in…
                        </>
                      ) : attendee.checkedIn ? (
                        'Checked in'
                      ) : (
                        <>
                          <UserCheck className="mr-2 h-4 w-4" />
                          Check in
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative hidden h-[400px] max-w-full min-w-0 overflow-x-auto overflow-y-auto md:block">
            <Table className="min-w-[700px] w-full">
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-card">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === sortedAttendees.length && sortedAttendees.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-input"
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2 h-8 font-semibold"
                      onClick={() => setSortDescending((d) => !d)}
                    >
                      Name
                      {sortDescending ? (
                        <ArrowDown className="ml-1 h-4 w-4" />
                      ) : (
                        <ArrowUp className="ml-1 h-4 w-4" />
                      )}
                    </Button>
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAttendees.map((attendee) => (
                  <TableRow
                    key={attendee.id}
                    className="group"
                  >
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(attendee.id)}
                        onChange={() => toggleSelect(attendee.id)}
                        className="rounded border-input"
                        aria-label={`Select ${formatNameLastFirst(attendee)}`}
                      />
                    </TableCell>
                    <TableCell className={`font-medium py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
                            {getInitials(attendee)}
                          </div>
                          <span>{formatNameLastFirst(attendee)}</span>
                        </div>
                        {duplicateNameKeySet.has(attendeeNameKey(attendee)) ? (
                          <span className="pl-12 font-mono text-xs font-normal text-muted-foreground">
                            {attendeeShortId(attendee.id)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>{attendee.email}</TableCell>
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>{attendee.company || '-'}</TableCell>
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>
                      <StatusBadge
                        status={attendee.checkedIn ? 'checked-in' : 'pending'}
                        pendingLabel="Not Yet"
                      />
                    </TableCell>
                    <TableCell className={`text-sm text-slate-500 dark:text-slate-400 py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>
                      {attendee.checkedIn && attendee.checkedInAt
                        ? formatRelativeTime(attendee.checkedInAt)
                        : '—'}
                    </TableCell>
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className={
                            attendee.checkedIn ? 'text-muted-foreground' : undefined
                          }
                          onClick={() => handleManualCheckIn(attendee)}
                          disabled={
                            attendee.checkedIn || checkingInId === attendee.id
                          }
                          title={
                            attendee.checkedIn
                              ? 'Already checked in'
                              : 'Check in without scanning QR'
                          }
                          aria-label={
                            attendee.checkedIn
                              ? `${formatNameLastFirst(attendee)} is already checked in`
                              : `Check in ${formatNameLastFirst(attendee)}`
                          }
                        >
                          {checkingInId === attendee.id ? (
                            <ButtonSpinner className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openQrForAttendee(attendee)}
                          aria-label={`Show QR code for ${formatNameLastFirst(attendee)}`}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleSendQREmail(attendee)}
                          disabled={sendingEmailId === attendee.id}
                          aria-label={`Email QR code to ${attendee.email}`}
                        >
                          {sendingEmailId === attendee.id ? (
                            <ButtonSpinner className="h-4 w-4" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(attendee.id)}
                          disabled={deletingId === attendee.id}
                        >
                          {deletingId === attendee.id ? (
                            <ButtonSpinner className="h-4 w-4 text-red-600" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-red-600" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={mobileDetailId !== null}
        onOpenChange={(open) => {
          if (!open) setMobileDetailId(null);
        }}
      >
        <SheetContent>
          {mobileDetailAttendee && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3 pr-2 text-left">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-medium text-white">
                    {getInitials(mobileDetailAttendee)}
                  </div>
                  <span className="min-w-0 leading-tight">
                    {formatNameLastFirst(mobileDetailAttendee)}
                    {duplicateNameKeySet.has(attendeeNameKey(mobileDetailAttendee)) ? (
                      <span className="mt-0.5 block font-mono text-xs font-normal text-muted-foreground">
                        {attendeeShortId(mobileDetailAttendee.id)}
                      </span>
                    ) : null}
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Contact and check-in details for{' '}
                  {formatNameLastFirst(mobileDetailAttendee)}.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-3 text-left text-foreground">
                <StatusBadge
                  status={
                    mobileDetailAttendee.checkedIn ? 'checked-in' : 'pending'
                  }
                  pendingLabel="Not Yet"
                  className="w-fit"
                />
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Email
                    </dt>
                    <dd className="break-all">{mobileDetailAttendee.email}</dd>
                  </div>
                  {mobileDetailAttendee.phone ? (
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Phone
                      </dt>
                      <dd>{mobileDetailAttendee.phone}</dd>
                    </div>
                  ) : null}
                  {mobileDetailAttendee.company ? (
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Company
                      </dt>
                      <dd>{mobileDetailAttendee.company}</dd>
                    </div>
                  ) : null}
                  {mobileDetailAttendee.dietaryRestrictions ? (
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Dietary
                      </dt>
                      <dd>{mobileDetailAttendee.dietaryRestrictions}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Registered
                    </dt>
                    <dd>
                      {new Date(mobileDetailAttendee.rsvpAt).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Check-in
                    </dt>
                    <dd className="text-muted-foreground">
                      {mobileDetailAttendee.checkedIn &&
                      mobileDetailAttendee.checkedInAt
                        ? formatRelativeTime(mobileDetailAttendee.checkedInAt)
                        : '—'}
                    </dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  ID: {mobileDetailAttendee.id}
                </p>
              </div>
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <Button
                  className={
                    mobileDetailAttendee.checkedIn
                      ? 'w-full text-muted-foreground'
                      : 'w-full'
                  }
                  variant="outline"
                  size="lg"
                  onClick={() => handleManualCheckIn(mobileDetailAttendee)}
                  disabled={
                    mobileDetailAttendee.checkedIn ||
                    checkingInId === mobileDetailAttendee.id
                  }
                >
                  {checkingInId === mobileDetailAttendee.id ? (
                    <>
                      <ButtonSpinner className="mr-2 h-5 w-5" />
                      Checking in…
                    </>
                  ) : mobileDetailAttendee.checkedIn ? (
                    'Checked in'
                  ) : (
                    <>
                      <UserCheck className="mr-2 h-5 w-5" />
                      Check in
                    </>
                  )}
                </Button>
                <div className="flex w-full gap-1">
                  <Button
                    variant="ghost"
                    className="h-11 min-w-0 flex-1 basis-0 px-0"
                    onClick={() => openQrForAttendee(mobileDetailAttendee)}
                    aria-label={`Show QR code for ${formatNameLastFirst(mobileDetailAttendee)}`}
                  >
                    <QrCode className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 min-w-0 flex-1 basis-0 px-0"
                    onClick={() => handleSendQREmail(mobileDetailAttendee)}
                    disabled={sendingEmailId === mobileDetailAttendee.id}
                    aria-label={`Email QR code to ${mobileDetailAttendee.email}`}
                  >
                    {sendingEmailId === mobileDetailAttendee.id ? (
                      <ButtonSpinner className="h-5 w-5" />
                    ) : (
                      <Mail className="h-5 w-5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 min-w-0 flex-1 basis-0 px-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={async () => {
                      const ok = await handleDelete(mobileDetailAttendee.id);
                      if (ok) setMobileDetailId(null);
                    }}
                    disabled={deletingId === mobileDetailAttendee.id}
                    aria-label={`Delete ${formatNameLastFirst(mobileDetailAttendee)}`}
                  >
                    {deletingId === mobileDetailAttendee.id ? (
                      <ButtonSpinner className="h-5 w-5" />
                    ) : (
                      <Trash2 className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {eventId && canImportCsv ? (
        <BadgePrintDialog
          open={badgePrintOpen}
          onOpenChange={setBadgePrintOpen}
          eventId={eventId}
          eventName={eventName}
          attendeeIds={selectedAttendeeIdsForBulk}
        />
      ) : null}

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>QR Code</DialogTitle>
            <DialogDescription>
              QR code for {selectedAttendee && formatNameLastFirst(selectedAttendee)}
            </DialogDescription>
          </DialogHeader>
          {selectedAttendee && (
            <div className="space-y-4">
              <QRDisplay
                qrDataUrl={qrDataUrl}
                attendeeName={formatNameLastFirst(selectedAttendee)}
              />
              <div className="text-center text-sm text-slate-600 border-t pt-4">
                <p>{selectedAttendee.email}</p>
                <p className="text-xs text-slate-400 mt-1">ID: {selectedAttendee.id}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

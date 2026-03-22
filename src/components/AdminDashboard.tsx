import { useState, useRef, useEffect } from 'react';
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
  Loader2,
  QrCode,
  Users,
  Search,
  Download,
  Mail,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import Fuse from 'fuse.js';
import type { Attendee } from '@/types/attendee';
import { apiService } from '@/services/api';
import { generateQRCodeBase64 } from '@/lib/qr-client';
import { QRDisplay } from './QRDisplay';
import { ScanQrMark } from './ScanQrMark';

function formatNameLastFirst(attendee: Attendee): string {
  return `${attendee.lastName}, ${attendee.firstName}`;
}

function getInitials(attendee: Attendee): string {
  const f = attendee.firstName?.charAt(0) ?? '';
  const l = attendee.lastName?.charAt(0) ?? '';
  return (f + l).toUpperCase() || '?';
}

interface AdminDashboardProps {
  attendees: Attendee[];
  /** When set, show Import CSV (event-scoped) and bulk QR email actions. */
  eventId?: string;
  /** Used in bulk QR email copy when resending. */
  eventName?: string;
  /** Desktop: show scanner CTA in the stats row (mobile uses header link in AdminPage). */
  showScannerCta?: boolean;
  onRefresh: () => void;
}

export function AdminDashboard({
  attendees,
  eventId,
  eventName,
  showScannerCta = false,
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
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window === 'undefined') return 'comfortable';
    return (localStorage.getItem('table-density') as 'comfortable' | 'compact') || 'comfortable';
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResendingQR, setBulkResendingQR] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fuse = useRef(
    new Fuse<Attendee>([], {
      keys: ['firstName', 'lastName', 'email', 'company'],
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

  const handleBulkExport = () => {
    const toExport = sortedAttendees.filter((a) => selectedIds.has(a.id));
    if (toExport.length === 0) return;
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Dietary Restrictions', 'Checked In', 'Check-in Time', 'Registration Date'];
    const csvContent = [
      headers.join(','),
      ...toExport.map((a) =>
        [a.firstName, a.lastName, a.email, a.phone ?? '', a.company ?? '', a.dietaryRestrictions ?? '', a.checkedIn ? 'Yes' : 'No', a.checkedInAt ? new Date(a.checkedInAt).toLocaleString() : '', new Date(a.rsvpAt).toLocaleDateString()]
          .map((f) => `"${f}"`)
          .join(',')
      ),
    ].join('\n');
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

  const filteredAttendees = searchTerm.trim()
    ? fuse.search(searchTerm).map((r) => r.item)
    : attendees;

  const sortedAttendees = [...filteredAttendees].sort((a, b) => {
    const cmp = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' })
      || a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
    return sortDescending ? -cmp : cmp;
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this attendee?')) return;
    setDeletingId(id);
    try {
      await apiService.deleteAttendee(id);
      toast.success('Attendee deleted');
      onRefresh();
    } catch {
      toast.error('Failed to delete attendee');
    } finally {
      setDeletingId(null);
    }
  };

  const loadQRForAttendee = async (attendee: Attendee) => {
    const { qrPayload } = await apiService.getQRPayload(attendee.id);
    const url = await generateQRCodeBase64(qrPayload);
    setQrDataUrl(url);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
        {showScannerCta && (
          <a
            href="/"
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
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Check-in Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-5xl font-bold text-blue-600 leading-tight">
              {attendees.length > 0
                ? Math.round(
                    (attendees.filter((a) => a.checkedIn).length /
                      attendees.length) *
                      100
                  )
                : 0}
              %
            </div>
            {attendees.length > 0 && (
              <div className="w-full overflow-hidden rounded-full bg-muted h-2">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{
                    width: `${(attendees.filter((a) => a.checkedIn).length / attendees.length) * 100}%`,
                  }}
                />
              </div>
            )}
            {attendees.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {attendees.filter((a) => a.checkedIn).length} of {attendees.length} checked in
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
              {attendees.filter((a) => a.checkedIn).length}
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
              {attendees.filter((a) => !a.checkedIn).length}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div>
            <CardTitle className="text-2xl font-semibold">Attendee List</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {filteredAttendees.length} of {attendees.length} attendees
            </CardDescription>
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
            <div className="flex items-center gap-4 shrink-0 sm:ml-auto">
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
        <CardContent>
          {sortedAttendees.length === 0 ? (
            <EmptyState
              onAddAttendee={() => {
                window.location.href = eventId ? '/' : '/admin/events/new';
              }}
              onImportCSV={eventId ? () => { window.location.href = `/admin/events/import?event=${eventId}`; } : undefined}
              addButtonLabel={eventId ? 'Add Attendee' : 'Create Event'}
              addButtonRed={!eventId}
            />
          ) : (
          <div className="space-y-2">
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
                {eventId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkResendQR}
                    disabled={bulkResendingQR}
                  >
                    {bulkResendingQR ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
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
          <div className="overflow-auto h-[400px] w-full min-w-0 relative">
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
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
                          {getInitials(attendee)}
                        </div>
                        {formatNameLastFirst(attendee)}
                      </div>
                    </TableCell>
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>{attendee.email}</TableCell>
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>{attendee.company || '-'}</TableCell>
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>
                      <StatusBadge status={attendee.checkedIn ? 'checked-in' : 'pending'} />
                    </TableCell>
                    <TableCell className={`text-sm text-slate-500 dark:text-slate-400 py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>
                      {attendee.checkedIn && attendee.checkedInAt
                        ? formatRelativeTime(attendee.checkedInAt)
                        : '—'}
                    </TableCell>
                    <TableCell className={`py-1 ${density === 'comfortable' ? 'sm:py-3' : ''}`}>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            setSelectedAttendee(attendee);
                            await loadQRForAttendee(attendee);
                            setShowQR(true);
                          }}
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
                            <Loader2 className="h-4 w-4 animate-spin" />
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
                            <Loader2 className="h-4 w-4 text-red-600 animate-spin" />
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

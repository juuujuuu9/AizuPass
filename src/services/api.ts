import type { Attendee, RSVPFormData, CheckInResult } from '@/types/attendee';
import type { OfflineCacheData } from '@/lib/offline';

class ApiService {
  private async fetchWithError(url: string, options?: RequestInit) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        return {
          ok: false as const,
          status: response.status,
          message: body.error || 'Already registered',
        };
      }
      const msg =
        body.error || (response.status === 404 ? 'Not found' : `HTTP ${response.status}`);
      const err = new Error(msg) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    const text = await response.text();
    const data = text
      ? (() => {
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        })()
      : null;
    return { ok: true as const, data };
  }

  async getAllAttendees(eventId?: string): Promise<Attendee[]> {
    const url = eventId ? `/api/attendees?eventId=${encodeURIComponent(eventId)}` : '/api/attendees';
    const res = await this.fetchWithError(url);
    return (res as { ok: true; data: Attendee[] }).data ?? [];
  }

  async searchAttendees(eventId?: string, q?: string): Promise<(Attendee & { eventName?: string })[]> {
    const params = new URLSearchParams();
    if (eventId) params.set('eventId', eventId);
    if (q?.trim()) params.set('q', q.trim());
    const url = `/api/attendees?${params.toString()}`;
    const res = await this.fetchWithError(url);
    return (res as { ok: true; data: (Attendee & { eventName?: string })[] }).data ?? [];
  }

  async getEvents(): Promise<{ id: string; name: string; slug: string }[]> {
    const res = await this.fetchWithError('/api/events');
    return (res as { ok: true; data: { id: string; name: string; slug: string }[] }).data ?? [];
  }

  async getEvent(id: string): Promise<{ id: string; name: string; slug: string } | null> {
    try {
      const res = await this.fetchWithError(`/api/events/${id}`);
      return (res as { ok: true; data: { id: string; name: string; slug: string } }).data ?? null;
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }

  async createAttendee(
    data: RSVPFormData
  ): Promise<Attendee | { ok: false; status: number; message: string }> {
    const res = await this.fetchWithError('/api/attendees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if ('ok' in res && res.ok) return (res as { ok: true; data: Attendee }).data;
    return res as { ok: false; status: number; message: string };
  }

  async deleteAttendee(id: string): Promise<void> {
    await this.fetchWithError('/api/attendees', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
  }

  private async postCheckIn(body: Record<string, unknown>): Promise<CheckInResult> {
    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return data as CheckInResult;
    }
    if (res.status === 409) {
      return {
        success: false,
        alreadyCheckedIn: true,
        attendee: data.attendee,
        event: data.event,
        message: data.message || data.error || 'Already checked in',
      };
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  async checkInAttendeeById(attendeeId: string): Promise<CheckInResult> {
    return this.postCheckIn({ attendeeId });
  }

  async checkInAttendee(qrData: string): Promise<CheckInResult> {
    return this.postCheckIn({ qrData });
  }

  async sendEmail(attendeeId: string, qrCodeBase64: string): Promise<void> {
    await this.fetchWithError('/api/send-email', {
      method: 'POST',
      body: JSON.stringify({ attendeeId, qrCodeBase64 }),
    });
  }

  async sendBulkQREmails(params: {
    attendeeIds: string[];
    eventId: string;
    fromName?: string;
    eventName?: string;
  }): Promise<{
    success: boolean;
    sent: number;
    failed: number;
    total: number;
    errors?: { attendeeId: string; error: string }[];
  }> {
    const res = await this.fetchWithError('/api/attendees/send-bulk-qr', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return (res as {
      ok: true;
      data: {
        success: boolean;
        sent: number;
        failed: number;
        total: number;
        errors?: { attendeeId: string; error: string }[];
      };
    }).data;
  }

  async getQRPayload(attendeeId: string): Promise<{ qrPayload: string; expiresAt: string }> {
    const res = await this.fetchWithError('/api/attendees/refresh-qr', {
      method: 'POST',
      body: JSON.stringify({ id: attendeeId }),
    });
    return (res as { ok: true; data: { qrPayload: string; expiresAt: string } }).data;
  }

  async importAttendeesCSV(
    eventId: string,
    file: File
  ): Promise<{
    imported: number;
    updated: number;
    deleted: number;
    skipped: number;
    skippedDuplicates: number;
    skippedEmptyRows: number;
    skippedMalformedRows: number;
    warnings: Array<{ row?: number; type: string; message: string }>;
  }> {
    const formData = new FormData();
    formData.set('eventId', eventId);
    formData.set('file', file);
    const res = await fetch('/api/attendees/import', {
      method: 'POST',
      body: formData,
      // Do not set Content-Type; browser sets multipart/form-data with boundary
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return {
      imported: data.imported ?? 0,
      updated: data.updated ?? 0,
      deleted: data.deleted ?? 0,
      skipped: data.skipped ?? 0,
      skippedDuplicates: data.skippedDuplicates ?? 0,
      skippedEmptyRows: data.skippedEmptyRows ?? 0,
      skippedMalformedRows: data.skippedMalformedRows ?? 0,
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    };
  }

  async getOfflineCache(eventId?: string): Promise<OfflineCacheData> {
    const url = eventId
      ? `/api/attendees/offline-cache?eventId=${encodeURIComponent(eventId)}`
      : '/api/attendees/offline-cache';
    const res = await this.fetchWithError(url);
    return (res as { ok: true; data: OfflineCacheData }).data;
  }

  async getEmailStatus(): Promise<{ configured: boolean; link: string }> {
    const res = await fetch('/api/send-email');
    const data = await res.json().catch(() => ({
      configured: false,
      link: 'https://resend.com/api-keys',
    }));
    return {
      configured: Boolean(data?.configured),
      link: data?.link || 'https://resend.com/api-keys',
    };
  }
}

export const apiService = new ApiService();

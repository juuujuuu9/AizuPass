/** Structured audit log for check-in attempts (JSON lines to console). */
export type CheckInOutcome =
  | 'success'
  | 'invalid_format'
  | 'not_found'
  | 'already_checked_in'
  | 'rate_limited'
  | 'replay_attempt'
  | 'invalid_or_expired'
  | 'wrong_scanner_event'
  | 'error'
  | 'demo_success'
  | 'demo_already'
  | 'demo_invalid';

export function logCheckInAttempt(params: {
  ip: string;
  outcome: CheckInOutcome;
  attendeeId?: string | null;
  eventId?: string | null;
  entryId?: string | null;
  timestamp?: Date;
}): void {
  const { ip, outcome, attendeeId = null, eventId = null, timestamp = new Date() } = params;
  const line = JSON.stringify({
    type: 'check_in_attempt',
    timestamp: timestamp.toISOString(),
    ip,
    outcome,
    attendeeId,
    eventId,
  });
  console.log(line);
}

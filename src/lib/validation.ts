import { z } from 'zod';

// Email validation with stricter rules than basic regex
const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email format')
  .max(255, 'Email is too long')
  .transform((email) => email.toLowerCase().trim());

// Name validation - allows letters (including Unicode), spaces, hyphens, apostrophes
// ME-5/ME-9: Uses Unicode-aware validation to support international characters (é, ñ, ü, CJK, Arabic, Cyrillic, etc.)
// Note: Using a permissive approach that accepts any non-digit, non-special characters as letters
const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name is too long')
  .regex(
    // Accepts letters from any alphabet, spaces, hyphens, apostrophes, periods
    // Rejects digits and most special characters
    /^[^0-9!@#$%^&*()_=+\[\]{}|;:",<>?/\\]+$/,
    'Name can only contain letters, spaces, hyphens, apostrophes, and periods'
  )
  .transform((name) => name.trim());

// Phone validation - flexible format
const phoneSchema = z
  .string()
  .max(50, 'Phone number is too long')
  .regex(
    /^[\d\s\-\+\(\)\.]*$/,
    'Phone can only contain numbers, spaces, hyphens, plus, parentheses, and dots'
  )
  .optional()
  .nullable()
  .transform((phone) => phone?.trim() || null);

// Company validation
const companySchema = z
  .string()
  .max(255, 'Company name is too long')
  .optional()
  .nullable()
  .transform((company) => company?.trim() || null);

// Dietary restrictions validation
const dietarySchema = z
  .string()
  .max(1000, 'Dietary restrictions description is too long')
  .optional()
  .nullable()
  .transform((dietary) => dietary?.trim() || null);

// UUID validation
const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

// RSVP form validation schema
export const rsvpFormSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  company: companySchema,
  dietaryRestrictions: dietarySchema,
  eventId: uuidSchema.optional(),
});

// Check-in validation schema
export const checkInSchema = z.object({
  qrData: z.string().min(1, 'QR data is required').max(500, 'QR data is too long'),
  /** Must match the event encoded in the QR (or the attendee's event for manual check-in). */
  scannerEventId: uuidSchema,
  scannerDeviceId: z.string().max(255).optional().nullable(),
});

// Manual check-in by ID schema
export const manualCheckInSchema = z.object({
  attendeeId: uuidSchema,
  scannerEventId: uuidSchema,
  scannerDeviceId: z.string().max(255).optional().nullable(),
});

// Attendee creation schema (for admin/API creation - eventId is required)
export const attendeeCreationSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  company: companySchema,
  dietaryRestrictions: dietarySchema,
  eventId: uuidSchema,
  status: z.string().optional(),
});

// Event creation schema
export const eventCreationSchema = z.object({
  name: z.string().min(1, 'Event name is required').max(255, 'Event name is too long').transform((s) => s.trim()),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug is too long')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .transform((s) => s.trim()),
  micrositeUrl: z.string().max(500, 'URL is too long').optional().nullable(),
});

// Profile update schema
export const profileUpdateSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
});

export const onboardingCommsSchema = z.object({
  emailProductUpdates: z.boolean(),
  emailMarketing: z.boolean(),
});

// Organization creation schema
export const organizationCreationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(255, 'Organization name is too long').transform((s) => s.trim()),
});

// Invitation creation schema
export const invitationCreationSchema = z.object({
  email: emailSchema,
});

// Invitation acceptance schema
export const invitationAcceptSchema = z.object({
  token: z.string().min(1, 'Invite token is required').max(255, 'Token is too long'),
});

// Staff preference update schema (for last selected event)
export const staffPreferenceSchema = z.object({
  eventId: z.string().uuid('Invalid event ID').nullable().optional(),
});

// Generic request validation helper
export function validateRequestBody<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errorMessage = result.error.errors.map((e) => e.message).join(', ');
  return { success: false, error: errorMessage };
}

// Type exports
export type RSVPFormData = z.infer<typeof rsvpFormSchema>;
export type CheckInData = z.infer<typeof checkInSchema>;
export type ManualCheckInData = z.infer<typeof manualCheckInSchema>;
export type AttendeeCreationData = z.infer<typeof attendeeCreationSchema>;
export type EventCreationData = z.infer<typeof eventCreationSchema>;
export type ProfileUpdateData = z.infer<typeof profileUpdateSchema>;
export type OrganizationCreationData = z.infer<typeof organizationCreationSchema>;
export type InvitationCreationData = z.infer<typeof invitationCreationSchema>;
export type InvitationAcceptData = z.infer<typeof invitationAcceptSchema>;
export type StaffPreferenceData = z.infer<typeof staffPreferenceSchema>;
export type OnboardingCommsData = z.infer<typeof onboardingCommsSchema>;

// Validation helper functions
export function validateRSVPForm(data: unknown): { success: true; data: RSVPFormData } | { success: false; errors: string[] } {
  const result = rsvpFormSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.errors.map((e) => e.message) };
}

export function validateCheckIn(data: unknown): { success: true; data: CheckInData } | { success: false; errors: string[] } {
  const result = checkInSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.errors.map((e) => e.message) };
}

export function validateManualCheckIn(data: unknown): { success: true; data: ManualCheckInData } | { success: false; errors: string[] } {
  const result = manualCheckInSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.errors.map((e) => e.message) };
}

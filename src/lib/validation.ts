import { z } from 'zod';

// Email validation with stricter rules than basic regex
const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email format')
  .max(255, 'Email is too long')
  .transform((email) => email.toLowerCase().trim());

// Name validation - allows Unicode letters (all languages), spaces, hyphens, apostrophes
// ME-5/ME-9: Changed from [a-zA-Z] to \p{L} to support international characters (é, ñ, ü, CJK, Arabic, Cyrillic, etc.)
const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name is too long')
  .regex(
    /^[\p{L}\s\-\'\.]+$/u,
    'Name can only contain letters, spaces, hyphens, and apostrophes'
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


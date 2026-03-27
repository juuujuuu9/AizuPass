import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import type { Attendee, RSVPFormData } from '@/types/attendee';
import { apiService } from '@/services/api';
import { generateQRCodeBase64 } from '@/lib/qr-client';
import { QRDisplay } from './QRDisplay';

/**
 * ME-11: Type guard to validate API response matches Attendee type.
 * Prevents runtime errors from unexpected API response shapes.
 */
function isAttendeeResponse(obj: unknown): obj is Attendee & { qrPayload?: string } {
  if (typeof obj !== 'object' || obj === null) return false;
  const a = obj as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.firstName === 'string' &&
    typeof a.lastName === 'string' &&
    typeof a.email === 'string' &&
    (a.qrPayload === undefined || typeof a.qrPayload === 'string')
  );
}

interface RSVPFormProps {
  onSuccess?: () => void;
}

export function RSVPForm({ onSuccess }: RSVPFormProps) {
  const [formData, setFormData] = useState<RSVPFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    dietaryRestrictions: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [generatedQR, setGeneratedQR] = useState<string>('');
  const [newAttendee, setNewAttendee] = useState<Attendee | null>(null);
  const [emailStatus, setEmailStatus] = useState<{
    configured: boolean;
    link: string;
  } | null>(null);

  useEffect(() => {
    if (showPreview) {
      apiService
        .getEmailStatus()
        .then(setEmailStatus)
        .catch(() =>
          setEmailStatus({ configured: false, link: 'https://resend.com/api-keys' })
        );
    }
  }, [showPreview]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await apiService.createAttendee(formData);

      if ('ok' in result && !result.ok) {
        toast.info(result.message);
        setLoading(false);
        return;
      }

      // ME-11: Validate response shape instead of unsafe type assertion
      if (!isAttendeeResponse(result)) {
        console.error('Invalid attendee response:', result);
        toast.error('Registration succeeded but received invalid data. Please refresh.');
        setLoading(false);
        return;
      }
      const attendee = result;
      setNewAttendee(attendee);

      const qrPayload = attendee.qrPayload ?? (await apiService.getQRPayload(attendee.id)).qrPayload;
      const qrCodeDataUrl = await generateQRCodeBase64(qrPayload);
      setGeneratedQR(qrCodeDataUrl);

      try {
        await apiService.sendEmail(attendee.id, qrCodeDataUrl);
        toast.success(
          "Registration successful! We've sent your QR code to your email — scan it at check-in."
        );
      } catch {
        toast.success('Registration successful! Save your QR code below.');
        toast.error('Email could not be sent.');
      }

      setShowPreview(true);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        company: '',
        dietaryRestrictions: '',
      });
      onSuccess?.();
    } catch {
      toast.error('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Event Registration</CardTitle>
          <CardDescription>
            Fill out the form below to register for the event
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                required
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) =>
                  setFormData({ ...formData, company: e.target.value })
                }
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="dietaryRestrictions">Dietary Restrictions</Label>
              <Input
                id="dietaryRestrictions"
                value={formData.dietaryRestrictions}
                onChange={(e) =>
                  setFormData({ ...formData, dietaryRestrictions: e.target.value })
                }
                placeholder="e.g., Vegetarian, Vegan, Gluten-free"
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Registering...' : 'Register'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registration Successful!</DialogTitle>
            <DialogDescription>
              We've sent your unique QR code to your email. Scan it at
              check-in — or save / resend from here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {newAttendee && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Registration Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600">Name</p>
                    <p className="font-medium">
                      {newAttendee.firstName} {newAttendee.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600">Email</p>
                    <p className="font-medium">{newAttendee.email}</p>
                  </div>
                  {newAttendee.company && (
                    <div>
                      <p className="text-slate-600">Company</p>
                      <p className="font-medium">{newAttendee.company}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-600">Registration Date</p>
                    <p className="font-medium">
                      {new Date(newAttendee.rsvpAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {generatedQR && (
              <div className="text-center">
                <QRDisplay
                  qrDataUrl={generatedQR}
                  attendeeName={newAttendee ? `${newAttendee.firstName} ${newAttendee.lastName}` : undefined}
                />
                <div className="mt-6">
                  <Button
                    onClick={async () => {
                      if (newAttendee) {
                        try {
                          await apiService.sendEmail(
                            newAttendee.id,
                            generatedQR
                          );
                          toast.success('Email sent successfully!');
                        } catch {
                          toast.error('Failed to send email');
                        }
                      }
                    }}
                    variant="outline"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Send QR Code to Email
                  </Button>
                </div>
                {emailStatus && !emailStatus.configured && (
                  <p className="text-sm text-amber-700 mt-2">
                    Email not configured. Add{' '}
                    <code className="bg-slate-200 px-1 rounded">
                      RESEND_API_KEY
                    </code>{' '}
                    in .env —{' '}
                    <a
                      href={emailStatus.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Get Resend API key
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

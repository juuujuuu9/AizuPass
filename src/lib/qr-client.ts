import QRCode from 'qrcode';
import { QR_GENERATION, QR_PRINT } from '../config/qr';

export type QRRenderProfile = 'screen' | 'print';

interface QRCodeOptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  color?: {
    dark?: string;
    light?: string;
  };
  /** `screen` = QR_GENERATION (default); `print` = QR_PRINT for badges / physical output. */
  profile?: QRRenderProfile;
}

/**
 * Generate a QR code as a base64 data URL.
 * Isomorphic (server + client). All call sites should use this
 * rather than calling QRCode.toDataURL directly.
 */
export async function generateQRCodeBase64(
  payload: string,
  options: QRCodeOptions = {}
): Promise<string> {
  const { profile, ...rest } = options;
  const base =
    profile === 'print'
      ? {
          width: QR_PRINT.width,
          margin: QR_PRINT.margin,
          errorCorrectionLevel: QR_PRINT.errorCorrectionLevel,
          color: QR_PRINT.color,
        }
      : {
          width: QR_GENERATION.width,
          margin: QR_GENERATION.margin,
          errorCorrectionLevel: QR_GENERATION.errorCorrectionLevel,
          color: QR_GENERATION.color,
        };
  return QRCode.toDataURL(payload, {
    width: rest.width ?? base.width,
    margin: rest.margin ?? base.margin,
    errorCorrectionLevel: rest.errorCorrectionLevel ?? base.errorCorrectionLevel,
    color: rest.color ?? base.color,
    type: 'image/png',
  });
}

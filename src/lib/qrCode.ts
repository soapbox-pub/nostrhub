import QRCode from 'qrcode';

/**
 * Generate a QR code as a PNG data URL.
 *
 * Uses high-contrast dark-on-white modules and error correction level `M`
 * so the code scans reliably regardless of the app's light/dark theme.
 */
export async function generateQR(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0a0a0a',
      light: '#ffffff',
    },
  });
}

import { Resend } from 'resend';

// Lazy initialization of Resend client to avoid crashing when RESEND_API_KEY is not set
let resendClient: Resend | null = null;

export function getResendClient(): Resend | null {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      resendClient = new Resend(apiKey);
    }
  }
  return resendClient;
}

export interface UserInviteData {
  email: string;
  firstName: string;
  lastName: string;
  roleName?: string;
  storeNames?: string;
  inviteToken?: string;
  inviteLink?: string;
  temporaryPassword?: string;
  organizationName?: string;
}

export interface SendUserInviteOptions {
  to: string;
  data: UserInviteData;
}

/**
 * Sends a secure, personalized invitation email with invite link to new employees using Resend.
 */
export async function sendUserInviteEmailToEmployee(options: SendUserInviteOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  const resend = getResendClient();
  const { to, data } = options;

  const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Συνεργάτη';
  const appUrl = process.env.APP_URL || 'https://ais-dev-whgodmemmilp4vacr23lio-628114198839.europe-west2.run.app';
  const inviteToken = data.inviteToken || `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const inviteLink = data.inviteLink || `${appUrl}?action=accept_invite&token=${inviteToken}&email=${encodeURIComponent(to)}`;
  const tempPassword = data.temporaryPassword || 'ShiftLedger2026!';
  const orgName = data.organizationName || 'Πρακτορείο ΟΠΑΠ';

  const subject = `Πρόσκληση Εγγραφής στο ShiftLedger - ${orgName}`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background-color: #4f46e5; color: white; font-weight: 800; font-size: 20px; padding: 12px 24px; border-radius: 12px; letter-spacing: 0.05em;">ShiftLedger</div>
        <h2 style="color: #ffffff; margin-top: 16px; font-size: 22px;">Πρόσκληση Νέου Υπαλλήλου</h2>
      </div>

      <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Γεια σας <strong>${fullName}</strong>,</p>
      <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">
        Έχετε προσκληθεί να συνδεθείτε στην πλατφόρμα <strong>ShiftLedger</strong> για τη διαχείριση και τον ταμειακό έλεγχο των καταστημάτων της <strong>${orgName}</strong>.
      </p>

      <div style="background-color: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 12px; margin: 24px 0;">
        <p style="margin: 0 0 10px 0; font-weight: 700; color: #94a3b8; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em;">Στοιχεία Λογαριασμού & Πρόσβασης</p>
        <p style="margin: 4px 0; color: #ffffff; font-size: 14px;"><strong>Email:</strong> ${to}</p>
        <p style="margin: 4px 0; color: #ffffff; font-size: 14px;"><strong>Ρόλος:</strong> ${data.roleName || 'Υπάλληλος'}</p>
        ${data.storeNames ? `<p style="margin: 4px 0; color: #ffffff; font-size: 14px;"><strong>Καταστήματα:</strong> ${data.storeNames}</p>` : ''}
        <p style="margin: 8px 0 0 0; color: #e2e8f0; font-size: 14px;">
          <strong>Προσωρινός Κωδικός:</strong> <code style="background: #0f172a; padding: 3px 8px; border-radius: 6px; color: #818cf8; font-family: monospace;">${tempPassword}</code>
        </p>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${inviteLink}" style="background-color: #4f46e5; color: white; text-decoration: none; font-weight: 700; padding: 14px 28px; border-radius: 12px; display: inline-block; font-size: 15px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);">
          Αποδοχή Πρόσκλησης & Είσοδος
        </a>
      </div>

      <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
        Ο προσωπικός σύνδεσμος πρόσκλησης είναι ασφαλής και μοναδικός για τον λογαριασμό σας.
      </p>
    </div>
  `;

  const textContent = `
Γεια σας ${fullName},

Έχετε προσκληθεί στο σύστημα ShiftLedger (${orgName}).

Σύνδεσμος Πρόσκλησης: ${inviteLink}
Email: ${to}
Προσωρινός Κωδικός: ${tempPassword}
  `;

  const senderEmail = process.env.EMAIL_FROM && process.env.EMAIL_FROM !== 'no-reply@shiftledger.gr'
    ? process.env.EMAIL_FROM
    : 'onboarding@resend.dev';

  if (!resend) {
    console.warn('[Resend Email Service] RESEND_API_KEY is not configured. Invitation logged to console:');
    console.log({ to, subject, inviteLink, textContent });
    return {
      success: true,
      id: 'mock_console_logged',
    };
  }

  try {
    const response = await resend.emails.send({
      from: `ShiftLedger System <${senderEmail}>`,
      to,
      subject,
      html: htmlContent,
      text: textContent,
    });

    if (response.error) {
      console.error('[Resend Error]', response.error);
      return { success: false, error: response.error.message };
    }

    return { success: true, id: response.data?.id };
  } catch (err: any) {
    console.error('[Resend Exception]', err);
    return { success: false, error: err?.message || 'Failed to send invite email via Resend' };
  }
}

export interface ShiftSummaryData {
  storeName: string;
  shiftType: string; // e.g. "Πρωινή" / "Απογευματινή" / "MORNING" / "EVENING"
  date?: string;
  closedByName?: string;
  countedCash: number;
  expectedCash: number;
  discrepancy: number;
  opapNetSales?: number;
  vltsNet?: number;
  fnbSales?: number;
  cardPayments?: number;
  expensesPaidCash?: number;
  notes?: string;
}

export interface SendShiftSummaryOptions {
  to: string | string[];
  data: ShiftSummaryData;
}

/**
 * Sends a detailed shift summary email to store managers using Resend.
 */
export async function sendShiftSummaryEmailToManagers(options: SendShiftSummaryOptions): Promise<{ success: boolean; id?: string; error?: string }> {
  const resend = getResendClient();
  const { to, data } = options;
  const recipientList = Array.isArray(to) ? to : [to];

  const formattedDiscrepancy = (data.discrepancy >= 0 ? '+' : '') + Number(data.discrepancy || 0).toFixed(2) + ' €';
  const discColor = data.discrepancy === 0 ? '#10b981' : Math.abs(data.discrepancy) <= 10 ? '#f59e0b' : '#ef4444';
  const shiftTitle = data.shiftType === 'MORNING' ? 'Πρωινή Βάρδια' : data.shiftType === 'EVENING' ? 'Απογευματινή Βάρδια' : data.shiftType;
  const formattedDate = data.date || new Date().toLocaleDateString('el-GR');

  const subject = `[ShiftLedger] Αναφορά Βάρδιας - ${data.storeName} (${shiftTitle}) [${formattedDiscrepancy}]`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; max-width: 600px; margin: 0 auto;">
      <div style="border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px;">
        <span style="font-size: 11px; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.05em;">ShiftLedger System</span>
        <h2 style="color: #ffffff; margin: 6px 0 0 0; font-size: 22px;">Αναφορά Κλεισίματος Βάρδιας</h2>
        <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0 0;">${data.storeName} &bull; ${shiftTitle} &bull; ${formattedDate}</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
        <div style="background-color: #1e293b; padding: 16px; border-radius: 12px; border: 1px solid #334155;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 600;">Καταμετρηθέντα Μετρητά</p>
          <p style="margin: 6px 0 0 0; color: #ffffff; font-size: 20px; font-weight: 800;">${Number(data.countedCash || 0).toFixed(2)} €</p>
        </div>
        <div style="background-color: #1e293b; padding: 16px; border-radius: 12px; border: 1px solid #334155;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; font-weight: 600;">Απόκλιση Ταμείου</p>
          <p style="margin: 6px 0 0 0; color: ${discColor}; font-size: 20px; font-weight: 800;">${formattedDiscrepancy}</p>
        </div>
      </div>

      <div style="background-color: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
        <p style="margin: 0 0 12px 0; font-weight: 700; color: #cbd5e1; font-size: 13px; border-bottom: 1px dashed #334155; padding-bottom: 8px;">
          Οικονομικό Συνοπτικό Πλάνο
        </p>
        <table style="width: 100%; font-size: 13px; color: #e2e8f0; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Υπεύθυνος Βάρδιας:</td>
            <td style="text-align: right; font-weight: 600;">${data.closedByName || 'Υπάλληλος'}</td>
          </tr>
          ${data.opapNetSales !== undefined ? `
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Πωλήσεις ΟΠΑΠ (Net):</td>
            <td style="text-align: right; font-weight: 600;">${Number(data.opapNetSales).toFixed(2)} €</td>
          </tr>` : ''}
          ${data.vltsNet !== undefined ? `
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">PLAY / VLTs Net:</td>
            <td style="text-align: right; font-weight: 600;">${Number(data.vltsNet).toFixed(2)} €</td>
          </tr>` : ''}
          ${data.fnbSales !== undefined ? `
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">FnB Πωλήσεις:</td>
            <td style="text-align: right; font-weight: 600;">${Number(data.fnbSales).toFixed(2)} €</td>
          </tr>` : ''}
          ${data.cardPayments !== undefined ? `
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Πληρωμές Καρτών (POS):</td>
            <td style="text-align: right; font-weight: 600;">${Number(data.cardPayments).toFixed(2)} €</td>
          </tr>` : ''}
          ${data.expensesPaidCash !== undefined ? `
          <tr>
            <td style="padding: 6px 0; color: #94a3b8;">Έξοδα Ταμείου:</td>
            <td style="text-align: right; font-weight: 600;">${Number(data.expensesPaidCash).toFixed(2)} €</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 6px 0; color: #94a3b8; font-weight: 600;">Αναμενόμενο Υπόλοιπο:</td>
            <td style="text-align: right; font-weight: 700; color: #818cf8;">${Number(data.expectedCash || 0).toFixed(2)} €</td>
          </tr>
        </table>
      </div>

      ${data.notes ? `
      <div style="background-color: #1e293b; border: 1px solid #334155; padding: 14px; border-radius: 12px; font-size: 12px; color: #cbd5e1; margin-bottom: 20px;">
        <strong style="color: #94a3b8;">Σημειώσεις Βάρδιας:</strong> ${data.notes}
      </div>` : ''}

      <p style="font-size: 11px; color: #64748b; text-align: center; margin: 0;">
        Αυτό το μήνυμα στάλθηκε αυτόματα από την πλατφόρμα ShiftLedger.
      </p>
    </div>
  `;

  const textContent = `
Αναφορά Κλεισίματος Βάρδιας
Κατάστημα: ${data.storeName}
Τύπος: ${shiftTitle}
Ημερομηνία: ${formattedDate}
Υπεύθυνος: ${data.closedByName || 'Υπάλληλος'}

Καταμετρηθέντα Μετρητά: ${Number(data.countedCash || 0).toFixed(2)} €
Αναμενόμενα Μετρητά: ${Number(data.expectedCash || 0).toFixed(2)} €
Απόκλιση: ${formattedDiscrepancy}
  `;

  const senderEmail = process.env.EMAIL_FROM && process.env.EMAIL_FROM !== 'no-reply@shiftledger.gr'
    ? process.env.EMAIL_FROM
    : 'onboarding@resend.dev';

  if (!resend) {
    console.warn('[Resend Email Service] RESEND_API_KEY is not configured. Email logged to console:');
    console.log({ to: recipientList, subject, textContent });
    return {
      success: true,
      id: 'mock_console_logged',
    };
  }

  try {
    const response = await resend.emails.send({
      from: `ShiftLedger System <${senderEmail}>`,
      to: recipientList,
      subject,
      html: htmlContent,
      text: textContent,
    });

    if (response.error) {
      console.error('[Resend Error]', response.error);
      return { success: false, error: response.error.message };
    }

    return { success: true, id: response.data?.id };
  } catch (err: any) {
    console.error('[Resend Exception]', err);
    return { success: false, error: err?.message || 'Failed to send email via Resend' };
  }
}

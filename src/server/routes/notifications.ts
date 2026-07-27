import { Router, Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

const sendEmailSchema = z.object({
  type: z.enum(['INVITE_USER', 'PASSWORD_RESET', 'SHIFT_CLOSING_SUMMARY']),
  to: z.string().email(),
  recipientName: z.string().optional(),
  payload: z.record(z.string(), z.any()),
});

// Helper function to send email via external provider (Resend/SendGrid) or log formatted HTML
async function sendSystemEmail(to: string, subject: string, htmlContent: string, textContent: string) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'no-reply@shiftledger.gr';

  if (resendApiKey) {
    try {
      const sender = process.env.EMAIL_FROM && process.env.EMAIL_FROM !== 'no-reply@shiftledger.gr'
        ? `ShiftLedger System <${process.env.EMAIL_FROM}>`
        : 'ShiftLedger <onboarding@resend.dev>';

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: sender,
          to: [to],
          subject,
          html: htmlContent,
          text: textContent,
        }),
      });
      if (response.ok) {
        console.log(`[Email Service - Resend] Email successfully sent to ${to}`);
        return { success: true, provider: 'resend' };
      }
    } catch (e: any) {
      console.warn('[Email Service - Resend Error]', e?.message || e);
    }
  }

  if (sendgridApiKey) {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sendgridApiKey}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail, name: 'ShiftLedger System' },
          subject,
          content: [
            { type: 'text/plain', value: textContent },
            { type: 'text/html', value: htmlContent },
          ],
        }),
      });
      if (response.ok) {
        console.log(`[Email Service - SendGrid] Email successfully sent to ${to}`);
        return { success: true, provider: 'sendgrid' };
      }
    } catch (e: any) {
      console.warn('[Email Service - SendGrid Error]', e?.message || e);
    }
  }

  // Fallback mode for development / preview environments (Firestore trigger simulation)
  console.log(`[Email Service - Firebase Trigger / Simulated Dispatch]
==================================================
To: ${to}
Subject: ${subject}
Provider Mode: Firebase Extension Trigger / Simulated SMTP
--------------------------------------------------
${textContent}
==================================================`);

  return { success: true, provider: 'firebase_extension_simulated' };
}

// POST /api/v1/notifications/email - Send system notification email
router.post('/email', async (req: Request, res: Response) => {
  try {
    const parse = sendEmailSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Μη έγκυρα στοιχεία αποστολής email', details: parse.error.format() });
    }

    const { type, to, recipientName, payload } = parse.data;
    let subject = 'Ειδοποίηση Συστήματος ShiftLedger';
    let htmlContent = '';
    let textContent = '';

    const appUrl = process.env.APP_URL || 'https://ais-dev-whgodmemmilp4vacr23lio-628114198839.europe-west2.run.app';

    if (type === 'INVITE_USER') {
      const name = recipientName || `${payload.first_name || ''} ${payload.last_name || ''}`.trim() || 'Συνεργάτη';
      subject = `Πρόσκληση Εγγραφής στο ShiftLedger - ${payload.organization_name || 'Πρακτορείο ΟΠΑΠ'}`;
      textContent = `Γεια σας ${name},\n\nΈχετε προσκληθεί στο σύστημα ShiftLedger για το κατάστημα ${payload.store_name || ''}.\n\nΜπορείτε να συνδεθείτε στη διεύθυνση: ${appUrl}\n\nΠροσωρινός Κωδικός: ${payload.temporary_password || 'ShiftLedger2026!'}\n\nΜε εκτίμηση,\nΗ ομάδα ShiftLedger`;
      
      htmlContent = `
        <div style="font-family: system-ui, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background-color: #4f46e5; color: white; font-weight: 800; font-size: 20px; padding: 12px 20px; border-radius: 12px;">ShiftLedger</div>
            <h2 style="color: #ffffff; margin-top: 16px;">Πρόσκληση στο Σύστημα</h2>
          </div>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Γεια σας <strong>${name}</strong>,</p>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Έχετε προσκληθεί να αποκτήσετε πρόσβαση στην πλατφόρμα ShiftLedger για τη διαχείριση και τον ταμειακό έλεγχο του καταστήματος <strong>${payload.store_name || 'ΟΠΑΠ'}</strong>.</p>
          <div style="background-color: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 12px; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-weight: 600; color: #94a3b8; text-transform: uppercase; font-size: 11px;">Στοιχεία Πρόσβασης</p>
            <p style="margin: 4px 0; color: #ffffff;"><strong>Email:</strong> ${to}</p>
            <p style="margin: 4px 0; color: #ffffff;"><strong>Ρόλος:</strong> ${payload.role_name || payload.role_code || 'Υπάλληλος'}</p>
            <p style="margin: 4px 0; color: #e2e8f0;"><strong>Προσωρινός Κωδικός:</strong> <code style="background: #0f172a; padding: 2px 8px; border-radius: 4px; color: #818cf8;">${payload.temporary_password || 'ShiftLedger2026!'}</code></p>
          </div>
          <div style="text-align: center; margin-top: 32px;">
            <a href="${appUrl}" style="background-color: #4f46e5; color: white; text-decoration: none; font-weight: 700; padding: 14px 28px; border-radius: 12px; display: inline-block;">Είσοδος στην Εφαρμογή</a>
          </div>
        </div>
      `;
    } else if (type === 'PASSWORD_RESET') {
      subject = 'Επαναφορά Κωδικού Πρόσβασης - ShiftLedger';
      textContent = `Γεια σας,\n\nΛάβαμε αίτημα για επαναφορά του κωδικού πρόσβασής σας στο ShiftLedger.\n\nΑκολουθήστε τον παρακάτω σύνδεσμο για να ορίσετε νέο κωδικό:\n${appUrl}?action=reset_password&email=${encodeURIComponent(to)}\n\nΑν δεν ζητήσατε εσείς την επαναφορά, παρακαλούμε αγνοήστε αυτό το μήνυμα.`;
      
      htmlContent = `
        <div style="font-family: system-ui, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background-color: #4f46e5; color: white; font-weight: 800; font-size: 20px; padding: 12px 20px; border-radius: 12px;">ShiftLedger</div>
            <h2 style="color: #ffffff; margin-top: 16px;">Επαναφορά Κωδικού Πρόσβασης</h2>
          </div>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Γεια σας,</p>
          <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6;">Λάβαμε αίτημα επαναφοράς κωδικού πρόσβασης για τον λογαριασμό <strong>${to}</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}?action=reset_password&email=${encodeURIComponent(to)}" style="background-color: #0284c7; color: white; text-decoration: none; font-weight: 700; padding: 14px 28px; border-radius: 12px; display: inline-block;">Ορισμός Νέου Κωδικού</a>
          </div>
          <p style="color: #64748b; font-size: 13px;">Αν δεν υποβάλατε εσείς αυτό το αίτημα, ο λογαριασμός σας παραμένει ασφαλής.</p>
        </div>
      `;
    } else if (type === 'SHIFT_CLOSING_SUMMARY') {
      const storeName = payload.store_name || 'Πρακτορείο ΟΠΑΠ';
      const shiftType = payload.shift_type || 'Βάρδια';
      const discrepancy = Number(payload.discrepancy || 0);
      const discrepancyFormatted = (discrepancy >= 0 ? '+' : '') + discrepancy.toFixed(2) + ' €';
      const discColor = discrepancy === 0 ? '#10b981' : Math.abs(discrepancy) <= 10 ? '#f59e0b' : '#ef4444';

      subject = `Αναφορά Κλεισίματος Βάρδιας ${shiftType} - ${storeName} [${discrepancyFormatted}]`;
      textContent = `Αναφορά Κλεισίματος Βάρδιας\nΚατάστημα: ${storeName}\nΤύπος: ${shiftType}\nΥπεύθυνος: ${payload.closed_by_user_name || 'Υπάλληλος'}\n\nΜετρητά Ταμείου: ${payload.counted_cash || 0} €\nΑναμενόμενα Μετρητά: ${payload.expected_cash || 0} €\nΑπόκλιση: ${discrepancyFormatted}\n\nΠωλήσεις ΟΠΑΠ (Καθαρά): ${payload.opap_net_sales || 0} €\nPLAY / VLTs Net: ${payload.vlts_net || 0} €\nFnB Πωλήσεις: ${payload.fnb_sales || 0} €`;

      htmlContent = `
        <div style="font-family: system-ui, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; max-width: 600px; margin: 0 auto;">
          <div style="border-bottom: 1px solid #334155; pb-16px; margin-bottom: 20px;">
            <span style="font-size: 12px; font-weight: 700; color: #818cf8; text-transform: uppercase;">Σύστημα ShiftLedger</span>
            <h2 style="color: #ffffff; margin: 6px 0 0 0;">Αναφορά Κλεισίματος Βάρδιας</h2>
            <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Κατάστημα: ${storeName} | ${shiftType}</p>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div style="background-color: #1e293b; padding: 16px; border-radius: 12px; border: 1px solid #334155;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px; text-transform: uppercase;">Καταμετρηθέντα Μετρητά</p>
              <p style="margin: 6px 0 0 0; color: #ffffff; font-size: 20px; font-weight: 800;">${Number(payload.counted_cash || 0).toFixed(2)} €</p>
            </div>
            <div style="background-color: #1e293b; padding: 16px; border-radius: 12px; border: 1px solid #334155;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px; text-transform: uppercase;">Απόκλιση Ταμείου</p>
              <p style="margin: 6px 0 0 0; color: ${discColor}; font-size: 20px; font-weight: 800;">${discrepancyFormatted}</p>
            </div>
          </div>

          <div style="background-color: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 12px;">
            <p style="margin: 0 0 12px 0; font-weight: 700; color: #cbd5e1; font-size: 13px;">Οικονομικό Συνοπτικό Πλάνο</p>
            <table style="width: 100%; font-size: 13px; color: #e2e8f0;">
              <tr><td style="padding: 4px 0; color: #94a3b8;">Πωλήσεις ΟΠΑΠ (Net):</td><td style="text-align: right; font-weight: 600;">${Number(payload.opap_net_sales || 0).toFixed(2)} €</td></tr>
              <tr><td style="padding: 4px 0; color: #94a3b8;">VLTs / PLAY Net:</td><td style="text-align: right; font-weight: 600;">${Number(payload.vlts_net || 0).toFixed(2)} €</td></tr>
              <tr><td style="padding: 4px 0; color: #94a3b8;">FnB (Καφέ/Αναψυκτικά):</td><td style="text-align: right; font-weight: 600;">${Number(payload.fnb_sales || 0).toFixed(2)} €</td></tr>
              <tr><td style="padding: 4px 0; color: #94a3b8;">Πληρωμές Καρτών (POS):</td><td style="text-align: right; font-weight: 600;">${Number(payload.card_payments || 0).toFixed(2)} €</td></tr>
              <tr><td style="padding: 4px 0; color: #94a3b8;">Έξοδα Ταμείου:</td><td style="text-align: right; font-weight: 600;">${Number(payload.expenses_paid_cash || 0).toFixed(2)} €</td></tr>
            </table>
          </div>

          <div style="text-align: center; margin-top: 28px;">
            <a href="${appUrl}" style="background-color: #4f46e5; color: white; text-decoration: none; font-weight: 700; padding: 12px 24px; border-radius: 10px; display: inline-block; font-size: 13px;">Προβολή στο ShiftLedger</a>
          </div>
        </div>
      `;
    }

    const result = await sendSystemEmail(to, subject, htmlContent, textContent);
    return res.json({
      status: 'sent',
      to,
      type,
      subject,
      provider: result.provider,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Σφάλμα επεξεργασίας αποστολής email: ' + err.message });
  }
});

export default router;

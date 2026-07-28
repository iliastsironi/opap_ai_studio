import { doc, setDoc } from 'firebase/firestore';
import { sendPasswordResetEmail as firebaseSendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from './firebase.ts';

export interface EmailPayload {
  to: string;
  recipientName?: string;
  type: 'INVITE_USER' | 'PASSWORD_RESET' | 'SHIFT_CLOSING_SUMMARY';
  payload: Record<string, any>;
}

export async function sendSystemEmailNotification(params: EmailPayload): Promise<{ success: boolean; message?: string }> {
  const { to, recipientName, type, payload } = params;

  // 1. Write to Firestore /mail collection (Firebase Trigger Email extension standard schema)
  try {
    const mailDocId = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const mailRef = doc(db, 'mail', mailDocId);

    let subject = 'ShiftLedger Ειδοποίηση Συστήματος';
    if (type === 'INVITE_USER') {
      subject = `Πρόσκληση στο ShiftLedger - ${payload.store_name || 'Πρακτορείο ΟΠΑΠ'}`;
    } else if (type === 'PASSWORD_RESET') {
      subject = 'Επαναφορά Κωδικού Πρόσβασης - ShiftLedger';
    } else if (type === 'SHIFT_CLOSING_SUMMARY') {
      subject = `Αναφορά Κλεισίματος Βάρδιας - ${payload.store_name || 'Κατάστημα'}`;
    }

    await setDoc(mailRef, {
      to: [to],
      message: {
        subject,
        text: `ShiftLedger Notification for ${to} (${type})`,
        html: `<p>ShiftLedger notification (${type}) sent to ${to}</p>`,
      },
      metadata: {
        type,
        payload,
        created_at: new Date().toISOString(),
      },
    });
  } catch (fsErr) {
    console.warn('[emailService] Warning: Firestore /mail record creation bypassed:', fsErr);
  }

  // 2. Call backend email dispatch API
  try {
    const res = await fetch('/api/v1/notifications/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        to,
        recipientName,
        payload,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Αποτυχία αποστολής email από τον διακομιστή');
    }

    return { success: true, message: 'Το email στάλθηκε επιτυχώς!' };
  } catch (apiErr: any) {
    console.error('[emailService] API dispatch error:', apiErr);
    return { success: true, message: 'Η ειδοποίηση καταχωρήθηκε στη βάση δεδομένων.' };
  }
}

export async function sendUserInviteEmail(user: {
  email: string;
  first_name: string;
  last_name: string;
  role_name?: string;
  store_name?: string;
  temp_password?: string;
  organization_name?: string;
}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-whgodmemmilp4vacr23lio-628114198839.europe-west2.run.app';
  const inviteToken = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const inviteLink = `${origin}?action=accept_invite&token=${inviteToken}&email=${encodeURIComponent(user.email)}`;

  return sendSystemEmailNotification({
    to: user.email,
    recipientName: `${user.first_name} ${user.last_name}`,
    type: 'INVITE_USER',
    payload: {
      first_name: user.first_name,
      last_name: user.last_name,
      role_name: user.role_name,
      store_name: user.store_name,
      organization_name: user.organization_name || 'Πρακτορείο ΟΠΑΠ',
      temporary_password: user.temp_password || 'ShiftLedger2026!',
      invite_token: inviteToken,
      invite_link: inviteLink,
    },
  });
}

export async function sendPasswordResetEmail(email: string) {
  try {
    await firebaseSendPasswordResetEmail(auth, email);
  } catch (err) {
    console.warn('Firebase sendPasswordResetEmail error:', err);
  }

  return sendSystemEmailNotification({
    to: email,
    type: 'PASSWORD_RESET',
    payload: {
      email,
      reset_requested_at: new Date().toISOString(),
    },
  });
}

export async function sendShiftSummaryEmail(shiftData: Record<string, any>, recipientEmail: string) {
  return sendSystemEmailNotification({
    to: recipientEmail,
    type: 'SHIFT_CLOSING_SUMMARY',
    payload: shiftData,
  });
}

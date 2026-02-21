import { apiFetch } from './apiFetch';

export interface SendEmailPayload {
    formType: string; // 'feature_request' | 'contact_us'
    userEmail: string;
    subject: string;
    messageBody: string;
    name?: string;
}

export async function sendEmail(payload: SendEmailPayload): Promise<{ success: boolean }> {
    const res = await apiFetch('/api/v1/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            form_type: payload.formType,
            user_email: payload.userEmail,
            subject: payload.subject,
            message_body: payload.messageBody,
            name: payload.name,
        }),
    });
    if (!res.ok) throw new Error('Failed to send email');
    return res.json();
}

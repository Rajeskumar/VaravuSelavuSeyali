import { fetchWithAuth } from './api';

export interface SendEmailPayload {
  formType: string; // 'feature_request' | 'contact_us'
  userEmail: string;
  subject: string;
  messageBody: string;
  name?: string;
}

export const sendEmail = async (payload: SendEmailPayload): Promise<{ success: boolean }> => {
  const response = await fetchWithAuth('/api/v1/email/send', {
    method: 'POST',
    body: JSON.stringify({
      form_type: payload.formType,
      user_email: payload.userEmail,
      subject: payload.subject,
      message_body: payload.messageBody,
      name: payload.name,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || 'Failed to send email');
  }

  return response.json();
};

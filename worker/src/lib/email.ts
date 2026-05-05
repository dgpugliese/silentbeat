// Email vendor wrapper. Resend in production; console.log in development.
// Switching vendors later (Postmark, etc.) means changing this file only.

import type { Env } from '../index';

export interface EmailOpts {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(env: Env, opts: EmailOpts): Promise<void> {
  if (!env.RESEND_API_KEY || env.ENVIRONMENT === 'development') {
    console.log('[email-dev]', opts.to, '|', opts.subject);
    if (opts.text) console.log(opts.text);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`email send failed ${r.status}: ${body}`);
  }
}

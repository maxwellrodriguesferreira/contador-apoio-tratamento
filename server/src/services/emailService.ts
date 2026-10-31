import nodemailer from 'nodemailer';

export interface EmailSendResult {
  success: boolean;
  provider: 'smtp' | 'resend' | 'none';
  error?: string;
}

export class EmailService {
  /**
   * Verifica se há algum provedor de e-mail configurado no ambiente (.env)
   */
  static isConfigured(): boolean {
    const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    const hasResend = Boolean(process.env.RESEND_API_KEY);
    return hasSmtp || hasResend;
  }

  /**
   * Dispara e-mail com código de recuperação de senha
   */
  static async sendPasswordResetEmail(
    toEmail: string,
    userName: string,
    code: string
  ): Promise<EmailSendResult> {
    const cleanEmail = toEmail.trim().toLowerCase();

    // 1. Envio via SMTP (Gmail, Hostinger, Outlook, SES, etc.)
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        const port = Number(process.env.SMTP_PORT) || 587;
        const secure = process.env.SMTP_SECURE === 'true' || port === 465;

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port,
          secure,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || '',
          },
        });

        const fromAddress =
          process.env.SMTP_FROM ||
          process.env.EMAIL_FROM ||
          `"Apoio ao Tratamento" <${process.env.SMTP_USER}>`;

        await transporter.sendMail({
          from: fromAddress,
          to: cleanEmail,
          subject: 'Código de Recuperação de Senha — Apoio ao Tratamento',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <h2 style="color: #0f766e; text-align: center; margin-bottom: 8px;">Recuperação de Acesso</h2>
              <p style="color: #475569; font-size: 14px;">Olá, <strong>${userName}</strong>!</p>
              <p style="color: #475569; font-size: 14px; line-height: 1.5;">
                Recebemos uma solicitação de redefinição de senha para a sua conta no sistema <strong>Apoio ao Tratamento</strong>.
              </p>
              <div style="background-color: #f0fdfa; border: 2px dashed #0f766e; padding: 18px; text-align: center; border-radius: 10px; margin: 24px 0;">
                <span style="font-size: 34px; font-weight: bold; letter-spacing: 6px; color: #0f766e; font-family: monospace;">${code}</span>
              </div>
              <p style="font-size: 12px; color: #64748b; line-height: 1.4;">
                Este código possui validade de <strong>15 minutos</strong>. Se você não realizou esta solicitação, desconsidere este e-mail. Sua senha permanecerá inalterada.
              </p>
            </div>
          `,
        });

        console.log(`✉️ [SMTP] E-mail com código de recuperação enviado com sucesso para ${cleanEmail}`);
        return { success: true, provider: 'smtp' };
      } catch (smtpErr: unknown) {
        const errorMsg = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
        console.error('❌ [SMTP] Falha ao enviar e-mail via SMTP:', errorMsg);
        return { success: false, provider: 'smtp', error: errorMsg };
      }
    }

    // 2. Envio via API do Resend
    if (process.env.RESEND_API_KEY) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'Apoio ao Tratamento <nao-responda@drogaria.com.br>',
            to: cleanEmail,
            subject: 'Código de Recuperação de Senha — Apoio ao Tratamento',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #0f766e; text-align: center; margin-bottom: 8px;">Recuperação de Acesso</h2>
                <p style="color: #475569; font-size: 14px;">Olá, <strong>${userName}</strong>!</p>
                <p style="color: #475569; font-size: 14px; line-height: 1.5;">
                  Recebemos uma solicitação de redefinição de senha para a sua conta no sistema <strong>Apoio ao Tratamento</strong>.
                </p>
                <div style="background-color: #f0fdfa; border: 2px dashed #0f766e; padding: 18px; text-align: center; border-radius: 10px; margin: 24px 0;">
                  <span style="font-size: 34px; font-weight: bold; letter-spacing: 6px; color: #0f766e; font-family: monospace;">${code}</span>
                </div>
                <p style="font-size: 12px; color: #64748b; line-height: 1.4;">
                  Este código possui validade de <strong>15 minutos</strong>. Se você não realizou esta solicitação, desconsidere este e-mail. Sua senha permanecerá inalterada.
                </p>
              </div>
            `,
          }),
        });

        if (res.ok) {
          console.log(`✉️ [Resend] E-mail com código enviado com sucesso para ${cleanEmail}`);
          return { success: true, provider: 'resend' };
        } else {
          const errText = await res.text();
          console.error(`❌ [Resend] Falha na API (${res.status}): ${errText}`);
          return { success: false, provider: 'resend', error: errText };
        }
      } catch (resendErr: unknown) {
        const errorMsg = resendErr instanceof Error ? resendErr.message : String(resendErr);
        console.error('❌ [Resend] Erro ao conectar na API:', errorMsg);
        return { success: false, provider: 'resend', error: errorMsg };
      }
    }

    // 3. Nenhum provedor configurado
    return {
      success: false,
      provider: 'none',
      error: 'Nenhum servidor SMTP ou chave de API de e-mail (Resend) configurada no ambiente.',
    };
  }
}

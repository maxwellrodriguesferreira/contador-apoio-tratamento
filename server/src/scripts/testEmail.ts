import nodemailer from 'nodemailer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregamento de variáveis de ambiente (.env)
if (typeof process.loadEnvFile === 'function') {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const p of envCandidates) {
    if (fs.existsSync(p)) {
      try {
        process.loadEnvFile(p);
        break;
      } catch {
        // Ignora se já estiver carregado
      }
    }
  }
}

async function run() {
  console.log('--- Teste de Configuração SMTP ---');
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const from = process.env.SMTP_FROM || `"Apoio ao Tratamento" <${user}>`;

  console.log(`Host:   ${host || '(não definido)'}`);
  console.log(`Porta:  ${port}`);
  console.log(`Secure: ${secure}`);
  console.log(`User:   ${user || '(não definido)'}`);
  console.log(`Pass:   ${pass ? '******** (definida)' : '(não definida)'}`);
  console.log(`From:   ${from}`);

  if (!host || !user || !pass) {
    console.error('\n❌ Erro: As variáveis SMTP_HOST, SMTP_USER e SMTP_PASS precisam estar preenchidas no .env.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  try {
    console.log('\n⏳ Conectando e autenticando no servidor SMTP...');
    await transporter.verify();
    console.log('✅ Autenticação SMTP bem-sucedida!');

    const targetEmail = process.argv[2] || user;
    console.log(`\n⏳ Enviando e-mail de teste para ${targetEmail}...`);

    const info = await transporter.sendMail({
      from,
      to: targetEmail,
      subject: 'Teste de Envio SMTP — Apoio ao Tratamento',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f766e; text-align: center; margin-bottom: 8px;">Teste de Configuração SMTP</h2>
          <p style="color: #475569; font-size: 14px;">Olá!</p>
          <p style="color: #475569; font-size: 14px; line-height: 1.5;">
            Se você recebeu este e-mail, a integração SMTP com o Google (Gmail) está funcionando perfeitamente no sistema <strong>Apoio ao Tratamento</strong>.
          </p>
          <div style="background-color: #f0fdfa; border: 1px solid #0f766e; padding: 12px; text-align: center; border-radius: 8px; margin: 16px 0; color: #0f766e; font-weight: bold;">
            SMTP Operacional ✅
          </div>
          <p style="font-size: 12px; color: #64748b;">Enviado em: ${new Date().toLocaleString('pt-BR')}</p>
        </div>
      `,
    });

    console.log(`✅ E-mail de teste enviado com sucesso! Message ID: ${info.messageId}`);
    process.exit(0);
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Falha no envio via SMTP:`, errorMsg);
    process.exit(1);
  }
}

run();


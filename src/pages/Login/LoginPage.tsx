import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../contexts/ToastContext';
import { AuthChallengeError, AuthService } from '../../services/auth/authService';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { login, completeNewPassword } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isNewPasswordRequired, setIsNewPasswordRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Estados do Modal de Recuperação de Senha
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'EMAIL' | 'CODE_AND_PASSWORD'>('EMAIL');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [emailSent, setEmailSent] = useState<boolean | null>(null);
  const [contingencyCode, setContingencyCode] = useState<string | null>(null);

  const [showAboutModal, setShowAboutModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      if (isNewPasswordRequired) {
        if (!fullName.trim()) {
          throw new Error('Informe seu nome completo para o cadastro.');
        }
        if (newPassword.length < 8) {
          throw new Error('A nova senha deve possuir no mínimo 8 caracteres.');
        }
        if (newPassword !== confirmNewPassword) {
          throw new Error('A confirmação de senha não confere.');
        }
        await completeNewPassword(newPassword, email, fullName);
        onLoginSuccess();
      } else {
        await login(email, password);
        onLoginSuccess();
      }
    } catch (err: unknown) {
      if (err instanceof AuthChallengeError && err.step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setIsNewPasswordRequired(true);
        setPassword('');
        setErrorMessage('');
        if (!fullName) {
          const suggested = email.split('@')[0].replace(/[._-]/g, ' ');
          const formatted = suggested.replace(/\b\w/g, (c) => c.toUpperCase());
          setFullName(formatted);
        }
        showToast(
          'Primeiro acesso detectado. Por favor, cadastre uma nova senha definitiva.',
          'info',
          'Nova Senha Requerida'
        );
      } else {
        const msg = err instanceof Error ? err.message : 'E-mail ou senha inválidos.';
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenForgotPassword = () => {
    if (email.trim() && !forgotEmail) {
      setForgotEmail(email.trim());
    }
    setForgotStep('EMAIL');
    setResetCode('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setForgotError('');
    setEmailSent(null);
    setContingencyCode(null);
    setShowForgotPasswordModal(true);
  };

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');

    if (!forgotEmail.trim()) {
      setForgotError('Por favor, informe seu e-mail cadastrado.');
      return;
    }

    setIsForgotLoading(true);
    try {
      const res = await AuthService.requestPasswordReset(forgotEmail);
      setEmailSent(res.emailSent ?? null);
      setContingencyCode(res.contingencyCode ?? null);
      if (res.contingencyCode) {
        setResetCode(res.contingencyCode);
      }
      setForgotStep('CODE_AND_PASSWORD');
      showToast(
        res.message || 'Código gerado com sucesso!',
        res.emailSent === false ? 'info' : 'success',
        res.emailSent === false ? 'Aviso de Envio' : 'Código Enviado'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao solicitar código de recuperação.';
      setForgotError(msg);
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');

    if (!resetCode.trim()) {
      setForgotError('Informe o código de verificação recebido.');
      return;
    }

    if (resetNewPassword.length < 8) {
      setForgotError('A nova senha deve possuir pelo menos 8 caracteres.');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setForgotError('A confirmação de senha não confere com a nova senha digitada.');
      return;
    }

    setIsForgotLoading(true);
    try {
      const res = await AuthService.resetPasswordWithCode(
        forgotEmail,
        resetCode,
        resetNewPassword
      );
      showToast(
        res.message || 'Senha redefinida com sucesso! Você já pode entrar.',
        'success',
        'Senha Atualizada'
      );
      setEmail(forgotEmail);
      setPassword('');
      setShowForgotPasswordModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao redefinir a senha.';
      setForgotError(msg);
    } finally {
      setIsForgotLoading(false);
    }
  };


  const handleBackToLogin = () => {
    setIsNewPasswordRequired(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background Decorativo */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      {/* Botão Sobre no Cabeçalho Superior */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <button
          type="button"
          onClick={() => setShowAboutModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container-lowest/90 backdrop-blur-md border border-outline-variant/50 text-xs font-semibold text-on-surface hover:text-primary hover:border-primary/50 shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
          title="Conheça o sistema e suas funcionalidades"
        >
          <span className="material-symbols-outlined text-[18px] text-primary">info</span>
          Sobre
        </button>
      </div>

      <div className="max-w-md w-full bg-surface-container-lowest rounded-2xl shadow-modal border border-outline-variant/40 p-8 z-10 animate-in fade-in zoom-in-95 duration-300">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-on-primary shadow-md mb-4">
            <span className="material-symbols-outlined text-[32px]">
              {isNewPasswordRequired ? 'lock_reset' : 'health_and_safety'}
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">
            {isNewPasswordRequired ? 'Definir Nova Senha' : 'Apoio ao Tratamento'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1.5 font-medium">
            {isNewPasswordRequired
              ? 'Primeiro acesso: cadastre seu nome e sua senha definitiva para continuar'
              : 'Gestão e acompanhamento de Apoios ao Tratamento'}
          </p>
        </div>

        {/* Mensagem de Erro */}
        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2.5 text-rose-700 text-sm font-medium animate-in fade-in">
            <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Aviso de Primeiro Acesso */}
        {isNewPasswordRequired && (
          <div className="mb-6 p-3.5 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary font-medium flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[20px]">info</span>
            <span>
              Sua conta requer a criação de uma senha segura e definitiva no primeiro login.
            </span>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="E-mail"
            type="email"
            placeholder="seu.email@drogaria.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isNewPasswordRequired}
            required
            icon="mail"
            autoComplete="email"
          />

          {!isNewPasswordRequired ? (
            <div className="flex flex-col gap-1">
              <Input
                label="Senha"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                icon="lock"
                autoComplete="current-password"
                showPasswordToggle
              />
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={handleOpenForgotPassword}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
            </div>
          ) : (
            <>
              <Input
                label="Nome Completo"
                placeholder="Seu nome completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                icon="person"
                autoComplete="name"
              />
              <Input
                label="Nova Senha"
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                icon="lock"
                autoComplete="new-password"
                showPasswordToggle
              />
              <Input
                label="Confirmar Nova Senha"
                type="password"
                placeholder="Repita a nova senha"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
                icon="lock_reset"
                autoComplete="new-password"
                showPasswordToggle
              />
            </>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            loadingText={isNewPasswordRequired ? 'Salvando Nova Senha...' : 'Autenticando...'}
            className="w-full mt-2"
            icon={isNewPasswordRequired ? 'check_circle' : 'login'}
          >
            {isNewPasswordRequired ? 'Definir Senha e Entrar' : 'Entrar'}
          </Button>

          {isNewPasswordRequired && (
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleBackToLogin}
              className="w-full mt-1"
              icon="arrow_back"
            >
              Voltar ao Login
            </Button>
          )}
        </form>

        {/* Rodapé Informativo */}
        <div className="mt-6 pt-4 border-t border-outline-variant/30 flex items-center justify-between text-xs text-on-surface-variant">
          <div className="flex flex-col">
            <span className="font-medium text-[11px] text-outline">v1.0 • Produção</span>
            <span className="text-[10px] text-on-surface-variant/80 font-medium">CRF-SP: 86426</span>
          </div>
        </div>
      </div>

      {/* Rodapé da Página de Login com Autoria */}
      <footer className="mt-6 text-center text-xs text-on-surface-variant z-10 animate-in fade-in max-w-md px-4">
        <p className="text-[11px] text-outline">
          Aplicação desenvolvida pelo Desenvolvedor de Software e Farmacêutico:
        </p>
        <p className="text-xs font-semibold text-on-surface mt-0.5">
          Maxwell Rodrigues Ferreira <span className="text-primary font-bold">(CRF-SP: 86426)</span>
        </p>
      </footer>

      {/* Modal Esqueci Minha Senha / Recuperar Acesso */}
      <Modal
        isOpen={showForgotPasswordModal}
        onClose={() => {
          if (!isForgotLoading) setShowForgotPasswordModal(false);
        }}
        title="Recuperação de Senha"
        subtitle={
          forgotStep === 'EMAIL'
            ? 'Informe seu e-mail cadastrado para obter o código de segurança'
            : `Confirmação de código e redefinição para ${forgotEmail}`
        }
        maxWidth="md"
        footer={
          forgotStep === 'EMAIL' ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setShowForgotPasswordModal(false)}
                disabled={isForgotLoading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="form-forgot-request"
                variant="primary"
                size="md"
                isLoading={isForgotLoading}
                loadingText="Gerando código..."
                icon="arrow_forward"
              >
                Continuar
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setForgotStep('EMAIL');
                  setForgotError('');
                }}
                disabled={isForgotLoading}
                icon="arrow_back"
              >
                Voltar
              </Button>
              <Button
                type="submit"
                form="form-forgot-reset"
                variant="primary"
                size="md"
                isLoading={isForgotLoading}
                loadingText="Salvando nova senha..."
                icon="lock_reset"
              >
                Redefinir Senha
              </Button>
            </>
          )
        }
      >
        <div className="space-y-4">
          {/* Mensagem de Erro no Modal */}
          {forgotError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-700 text-xs font-medium animate-in fade-in">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
              <span>{forgotError}</span>
            </div>
          )}

          {forgotStep === 'EMAIL' ? (
            <form id="form-forgot-request" onSubmit={handleRequestResetCode} className="flex flex-col gap-4">
              <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/30 flex items-start gap-3">
                <span className="material-symbols-outlined text-[22px] text-primary shrink-0 mt-0.5">
                  mark_email_read
                </span>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Informe o seu e-mail cadastrado no sistema. Um código de segurança com validade de 15 minutos será gerado para que você crie sua nova senha.
                </p>
              </div>

              <Input
                label="E-mail Cadastrado"
                type="email"
                placeholder="seu.email@drogaria.com.br"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                icon="mail"
                autoComplete="email"
                autoFocus
              />
            </form>
          ) : (
            <form id="form-forgot-reset" onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-4">
              {/* Card com Instrução e Dica para Farmácia */}
              {emailSent === false || contingencyCode ? (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2 animate-in fade-in">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-400">
                    <span className="material-symbols-outlined text-[18px]">info</span>
                    <span>Servidor de e-mail (SMTP) não configurado</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Esta instalação opera sem servidor de envio de e-mails conectado no arquivo <code>.env</code>. Para você não ficar bloqueado, seu código de segurança é:
                  </p>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-lowest border border-amber-500/25">
                    <span className="font-mono font-bold text-lg tracking-widest text-primary">
                      {contingencyCode || resetCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const codeToCopy = contingencyCode || resetCode;
                        if (codeToCopy) {
                          navigator.clipboard?.writeText(codeToCopy);
                          showToast('Código copiado para a área de transferência!', 'info');
                        }
                      }}
                      className="text-[11px] text-primary font-bold hover:underline flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                      Copiar Código
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex flex-col gap-1.5 animate-in fade-in">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary">
                    <span className="material-symbols-outlined text-[18px]">mark_email_read</span>
                    <span>Código enviado para: {forgotEmail}</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Verifique sua caixa de entrada e pasta de spam. Insira o código de 6 dígitos recebido por e-mail para cadastrar sua nova senha.
                  </p>
                </div>
              )}

              <Input
                label="Código de Verificação (PIN)"
                placeholder="Ex: 123456 ou Código de Atendente"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                required
                icon="key"
                autoFocus
              />

              <Input
                label="Nova Senha"
                type="password"
                placeholder="Mínimo de 8 caracteres"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                required
                icon="lock"
                autoComplete="new-password"
                showPasswordToggle
              />

              <Input
                label="Confirmar Nova Senha"
                type="password"
                placeholder="Repita a nova senha"
                value={resetConfirmPassword}
                onChange={(e) => setResetConfirmPassword(e.target.value)}
                required
                icon="lock_reset"
                autoComplete="new-password"
                showPasswordToggle
              />

              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-outline">Não recebeu o código?</span>
                <button
                  type="button"
                  onClick={handleRequestResetCode}
                  disabled={isForgotLoading}
                  className="font-semibold text-primary hover:underline disabled:opacity-50"
                >
                  Gerar novo código
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>


      {/* Modal Sobre a Aplicação */}
      <Modal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        title="Sobre o Apoio ao Tratamento"
        subtitle="Registro de Apoios ao Tratamento para Pós-Venda e Gestão Clínica"
        maxWidth="2xl"
        footer={
          <Button variant="primary" size="md" onClick={() => setShowAboutModal(false)}>
            Entendi, fechar
          </Button>
        }
      >
        <div className="space-y-4 text-on-surface">
          {/* Introdução com Foco no Pós-Venda */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-xs mt-0.5">
              <span className="material-symbols-outlined text-[20px]">health_and_safety</span>
            </div>
            <div>
              <h4 className="font-bold text-xs sm:text-sm text-on-surface">
                Registro de Apoios ao Tratamento &amp; Pós-Venda Farmacêutico
              </h4>
              <p className="text-[11px] sm:text-xs text-on-surface-variant mt-1 leading-relaxed">
                A <strong className="text-on-surface font-semibold">principal funcionalidade do sistema</strong> é registrar e contabilizar a quantidade de <strong className="text-primary font-semibold">Apoios ao Tratamento</strong> realizados pela equipe no balcão. Esses registros são essenciais para alimentar o fluxo de <strong className="text-on-surface font-semibold">pós-venda</strong> da farmácia, viabilizando o acompanhamento contínuo dos pacientes, o reforço à adesão terapêutica e a fidelização de clientes.
              </p>
            </div>
          </div>

          {/* Grid Resumido de Funcionalidades */}
          <div>
            <h5 className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-primary">apps</span>
              Funcionalidades Principais
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* 1. Apoio ao Tratamento */}
              <div className="p-2.5 rounded-lg bg-surface-container-low border border-primary/30 bg-primary/5 flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-md bg-primary text-on-primary flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <span className="material-symbols-outlined text-[17px]">health_and_safety</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h6 className="font-bold text-xs text-on-surface leading-tight">Apoio ao Tratamento</h6>
                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded font-bold bg-primary/20 text-primary">Foco Principal</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Contabilização da volumetria de apoios para abastecer o contato de pós-venda e assegurar a adesão do paciente.
                  </p>
                </div>
              </div>

              {/* 2. Atendimento Na Rotina */}
              <div className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-md bg-secondary/15 text-secondary flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[17px]">assignment_turned_in</span>
                </div>
                <div className="min-w-0">
                  <h6 className="font-bold text-xs text-on-surface leading-tight">Atendimento Na Rotina</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Controle rápido de orientações e serviços de balcão sem meta obrigatória.
                  </p>
                </div>
              </div>

              {/* 3. Metas & Ritmo Operacional */}
              <div className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[17px]">track_changes</span>
                </div>
                <div className="min-w-0">
                  <h6 className="font-bold text-xs text-on-surface leading-tight">Metas &amp; Desempenho</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Metas diárias e mensais para a loja e equipe, com projeções em tempo real.
                  </p>
                </div>
              </div>

              {/* 4. Painel Executivo */}
              <div className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[17px]">monitoring</span>
                </div>
                <div className="min-w-0">
                  <h6 className="font-bold text-xs text-on-surface leading-tight">Painel em Tempo Real</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Totalizadores de atendimentos, evolução do ritmo e ranking da equipe.
                  </p>
                </div>
              </div>

              {/* 5. Inteligência Artificial */}
              <div className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[17px]">smart_toy</span>
                </div>
                <div className="min-w-0">
                  <h6 className="font-bold text-xs text-on-surface leading-tight">Inteligência Artificial</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Diagnósticos operacionais e pareceres clínicos via Google Gemini.
                  </p>
                </div>
              </div>

              {/* 6. Histórico & Auditoria */}
              <div className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[17px]">security</span>
                </div>
                <div className="min-w-0">
                  <h6 className="font-bold text-xs text-on-surface leading-tight">Segurança &amp; Auditoria</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Histórico imutável de alterações, controle de concorrência e lixeira segura.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Perfis de Acesso Diretos */}
          <div className="p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/30">
            <h5 className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px] text-primary">badge</span>
              Perfis de Acesso
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">admin_panel_settings</span>
                <div>
                  <strong className="text-primary block text-xs">Administrador</strong>
                  <span className="text-[11px] text-on-surface-variant leading-tight block">
                    Gestão total da loja, metas, atendentes, relatórios, auditoria e IA.
                  </span>
                </div>
              </div>
              <div className="p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/20 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-secondary shrink-0 mt-0.5">person</span>
                <div>
                  <strong className="text-secondary block text-xs">Atendente Farmacêutico</strong>
                  <span className="text-[11px] text-on-surface-variant leading-tight block">
                    Lançamento rápido de atendimentos e consulta ao seu desempenho diário.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Autoria e Responsabilidade Técnica */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-primary/10 via-surface-container-low to-surface-container-low border border-primary/25 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[18px]">medical_services</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-xs text-on-surface">Responsabilidade Técnica:</span>
                <strong className="text-xs text-primary font-semibold">Maxwell Rodrigues Ferreira</strong>
                <span className="text-[10px] bg-primary/15 text-primary font-bold px-1.5 py-0.2 rounded-full">
                  CRF-SP: 86426
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-0.5 leading-tight">
                Desenvolvedor de Software e Farmacêutico. Concebido para a prática clínica e rotina de drogaria.
              </p>
            </div>
          </div>

          {/* Rodapé Técnico */}
          <div className="flex items-center justify-between text-[11px] text-outline pt-1 border-t border-outline-variant/20">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Cloudflare D1 (SQLite Edge)
            </span>
            <span>Versão 1.0.0</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

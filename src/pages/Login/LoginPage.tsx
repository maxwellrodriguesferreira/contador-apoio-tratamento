import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../contexts/ToastContext';
import { AuthChallengeError } from '../../services/auth/authService';

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
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
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

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setShowForgotPasswordModal(false);
    showToast(
      'Se o e-mail estiver cadastrado no Amazon Cognito, as instruções de recuperação foram enviadas.',
      'info',
      'Recuperação de Senha'
    );
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
              />
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(true)}
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

        {/* Rodapé com Botão Sobre */}
        <div className="mt-6 pt-4 border-t border-outline-variant/30 flex items-center justify-between text-xs text-on-surface-variant">
          <div className="flex flex-col">
            <span className="font-medium text-[11px] text-outline">v1.0 • Produção</span>
            <span className="text-[10px] text-on-surface-variant/80 font-medium">CRF-SP: 86426</span>
          </div>
          <button
            type="button"
            onClick={() => setShowAboutModal(true)}
            className="inline-flex items-center gap-1.5 font-semibold text-primary hover:text-primary-hover hover:underline transition-colors py-1 px-2.5 rounded-lg hover:bg-primary/5"
          >
            <span className="material-symbols-outlined text-[16px]">info</span>
            Sobre
          </button>
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

      {/* Modal Esqueci Minha Senha */}
      {showForgotPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-surface/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface-container-lowest rounded-2xl shadow-modal max-w-sm w-full p-6 border border-outline-variant/40">
            <h3 className="font-bold text-lg text-on-surface mb-2">Recuperar Senha</h3>
            <p className="text-xs text-on-surface-variant mb-4">
              Informe seu e-mail cadastrado no Amazon Cognito para receber o link de redefinição de acesso.
            </p>
            <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
              <Input
                label="E-mail"
                type="email"
                placeholder="seu.email@drogaria.com.br"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                icon="mail"
              />
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForgotPasswordModal(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Enviar Instruções
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sobre a Aplicação */}
      <Modal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
        title="Sobre o Apoio ao Tratamento"
        subtitle="Sistema de Gestão Farmacêutica, Metas Clínicas e Inteligência Artificial"
        maxWidth="2xl"
        footer={
          <Button variant="primary" size="md" onClick={() => setShowAboutModal(false)}>
            Entendi, fechar
          </Button>
        }
      >
        <div className="space-y-6 text-on-surface">
          {/* Introdução / Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[24px]">verified</span>
            </div>
            <div>
              <h4 className="font-bold text-sm text-on-surface">
                Plataforma de Fidelização e Cuidado Farmacêutico
              </h4>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                Desenvolvido para drogarias e redes farmacêuticas registrarem, gerenciarem e
                acompanharem a adesão de pacientes a tratamentos contínuos de saúde, potencializando
                o engajamento da equipe e a fidelização de clientes.
              </p>
            </div>
          </div>

          {/* Grid de Funcionalidades */}
          <div>
            <h5 className="text-xs font-bold text-outline uppercase tracking-wider mb-3">
              Resumo das Funcionalidades
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Funcionalidade 1 */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex gap-3 hover:border-primary/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">add_task</span>
                </div>
                <div>
                  <h6 className="font-bold text-xs text-on-surface">Registro Ágil de Apoios</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Lançamento de apoios ao tratamento por data, quantidade e atendente responsável com
                    validação estrita e controle de versão.
                  </p>
                </div>
              </div>

              {/* Funcionalidade 2 */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex gap-3 hover:border-primary/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">badge</span>
                </div>
                <div>
                  <h6 className="font-bold text-xs text-on-surface">Equipe de Atendentes</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Cadastro com código de identificação único, controle de ativação/inativação e
                    rastreabilidade individualizada de performance.
                  </p>
                </div>
              </div>

              {/* Funcionalidade 3 */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex gap-3 hover:border-primary/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">ads_click</span>
                </div>
                <div>
                  <h6 className="font-bold text-xs text-on-surface">Metas Operacionais Inteligentes</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Configuração de metas diárias e mensais para a loja e por atendente, com cálculo
                    automático de % de atingimento e projeções.
                  </p>
                </div>
              </div>

              {/* Funcionalidade 4 */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex gap-3 hover:border-primary/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">monitoring</span>
                </div>
                <div>
                  <h6 className="font-bold text-xs text-on-surface">Dashboard em Tempo Real</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Visão unificada dos indicadores do dia e do mês, comparativos com metas,
                    distribuição por atendente e rankings.
                  </p>
                </div>
              </div>

              {/* Funcionalidade 5 */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex gap-3 hover:border-primary/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                </div>
                <div>
                  <h6 className="font-bold text-xs text-on-surface">Inteligência Artificial (Gemini)</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Relatórios executivos e clínicos gerados automaticamente por IA, identificando
                    padrões, gargalos e orientações para a equipe.
                  </p>
                </div>
              </div>

              {/* Funcionalidade 6 */}
              <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 flex gap-3 hover:border-primary/30 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">history_edu</span>
                </div>
                <div>
                  <h6 className="font-bold text-xs text-on-surface">Auditoria & Rastreabilidade</h6>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                    Registro detalhado de todas as alterações (criação, edição, exclusão e restauração),
                    com valores anteriores e identificação do autor.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Perfis de Acesso & Segurança */}
          <div className="p-4 rounded-xl bg-surface-container-low/70 border border-outline-variant/30">
            <h5 className="text-xs font-bold text-on-surface flex items-center gap-2 mb-2.5">
              <span className="material-symbols-outlined text-[18px] text-primary">security</span>
              Níveis de Acesso & Segurança (RBAC)
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30">
                <div className="font-bold text-primary flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                  Administrador
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Acesso total: gestão de usuários, cadastro de atendentes, definição de metas, relatórios
                  de auditoria, análises com IA e configurações do sistema.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30">
                <div className="font-bold text-secondary flex items-center gap-1.5 mb-1">
                  <span className="material-symbols-outlined text-[16px]">person</span>
                  Atendente Farmacêutico
                </div>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Acesso operacional focado: consulta às suas metas diárias e mensais, acompanhamento
                  do seu desempenho e registro rápido de apoios.
                </p>
              </div>
            </div>
          </div>

          {/* Autoria e Responsabilidade Técnica */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 via-surface-container-low to-surface-container-low border border-primary/25 flex items-start gap-3.5 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[22px]">medical_services</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h5 className="font-bold text-xs text-on-surface">Desenvolvimento &amp; Responsabilidade Técnica</h5>
                <span className="text-[10px] bg-primary/15 text-primary font-bold px-2 py-0.5 rounded-full">
                  CRF-SP: 86426
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                Aplicação desenvolvida pelo Desenvolvedor de Software e Farmacêutico:{' '}
                <strong className="text-on-surface font-semibold">Maxwell Rodrigues Ferreira</strong>. Concebida com engenharia de software de ponta e profundo alinhamento à rotina clínica e operacional farmacêutica.
              </p>
            </div>
          </div>

          {/* Rodapé Técnico */}
          <div className="flex items-center justify-between text-[11px] text-outline pt-1 border-t border-outline-variant/20">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Banco de Dados: Cloudflare D1 (SQLite Edge)
            </span>
            <span>Versão 1.0.0 • Sistema Seguro</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};

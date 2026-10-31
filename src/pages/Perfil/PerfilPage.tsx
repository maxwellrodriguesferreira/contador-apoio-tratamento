import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AuthService } from '../../services/auth/authService';
import { formatDateTimeBR } from '../../utils/calculations';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Badge } from '../../components/common/Badge';
import { useToast } from '../../contexts/ToastContext';

export const PerfilPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (newPassword.length < 8) {
      showToast('A nova senha deve ter no mínimo 8 caracteres.', 'warning');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('A confirmação da nova senha não confere.', 'warning');
      return;
    }

    setIsChangingPassword(true);
    try {
      await AuthService.changePassword(user, newPassword);
      showToast('Senha alterada com sucesso no Cloudflare D1.', 'success', 'Segurança Atualizada');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar senha.';
      showToast(msg, 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Meu Perfil</h1>
        <p className="text-xs text-on-surface-variant mt-1">
          Informações da sua credencial de acesso e segurança de conta
        </p>
      </div>

      {/* Cartão de Informações Pessoais */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-subtle p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-on-primary font-bold text-2xl shadow-md">
            {user.name.charAt(0)}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-on-surface">{user.name}</h2>
              <Badge variant={user.role === 'ADMIN' ? 'primary' : 'secondary'}>
                {user.role}
              </Badge>
            </div>
            <span className="text-xs text-on-surface-variant mt-0.5">{user.email}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-container-low rounded-xl text-xs">
          <div>
            <span className="text-outline block">Identificador Único (ID)</span>
            <span className="font-mono font-semibold text-on-surface">{user.authUserId || user.id}</span>
          </div>
          <div>
            <span className="text-outline block">Status da Conta</span>
            <span className="font-semibold text-emerald-700">Ativa e Autenticada</span>
          </div>
          <div>
            <span className="text-outline block">Data de Criação do Usuário</span>
            <span className="font-semibold text-on-surface">{formatDateTimeBR(user.createdAt)}</span>
          </div>
          <div>
            <span className="text-outline block">Último Acesso Registrado</span>
            <span className="font-semibold text-on-surface">
              {user.lastLoginAt ? formatDateTimeBR(user.lastLoginAt) : 'Sessão atual'}
            </span>
          </div>
        </div>
      </div>

      {/* Cartão de Alteração de Senha */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-subtle p-6 sm:p-8 flex flex-col gap-5">
        <div className="flex items-center gap-3 border-b border-outline-variant/20 pb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">lock_reset</span>
          </div>
          <div>
            <h3 className="font-bold text-base text-on-surface">Alterar Senha de Acesso</h3>
            <p className="text-xs text-on-surface-variant">
              Atualize sua senha de acesso de forma segura e criptografada
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <Input
            label="Senha Atual"
            type="password"
            placeholder="••••••••••••"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            icon="lock"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nova Senha"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              icon="key"
            />
            <Input
              label="Confirmar Nova Senha"
              type="password"
              placeholder="Repita a nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              icon="key"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isChangingPassword}
              loadingText="Atualizando senha..."
              icon="save"
            >
              Atualizar Senha
            </Button>
          </div>
        </form>
      </div>

      {/* Informações da Aplicação e Responsabilidade Técnica */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-subtle p-6 sm:p-8 flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-outline-variant/20 pb-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">verified</span>
          </div>
          <div>
            <h3 className="font-bold text-base text-on-surface">Sobre a Plataforma</h3>
            <p className="text-xs text-on-surface-variant">
              Autoria, desenvolvimento e responsabilidade técnica
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-low text-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold text-base shadow-sm shrink-0">
              <span className="material-symbols-outlined text-[22px]">medical_services</span>
            </div>
            <div>
              <span className="text-[11px] text-outline block font-medium">Desenvolvido por:</span>
              <span className="text-sm font-bold text-on-surface block">Maxwell Rodrigues Ferreira</span>
              <span className="text-xs text-primary font-medium">
                Desenvolvedor de Software e Farmacêutico
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="px-3 py-1 rounded-full bg-primary/15 text-primary font-bold text-xs border border-primary/25">
              CRF-SP: 86426
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AuthService } from '../../services/auth/authService';
import { AttendantService } from '../../services/attendants/attendantService';
import { UserProfile, UserRole, Attendant } from '../../types';
import { formatDateTimeBR } from '../../utils/calculations';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { useToast } from '../../contexts/ToastContext';
import { CloudSyncService } from '../../services/api/cloudSyncService';

export const UsuariosPage: React.FC = () => {
  const { user: currentUser, isAdmin, refreshUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal Criar / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('ATENDENTE');
  const [attendantId, setAttendantId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Modal Exclusão
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal Redefinir Senha
  const [resetUser, setResetUser] = useState<UserProfile | null>(null);
  const [resetMode, setResetMode] = useState<'email' | 'manual'>('email');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const loadData = useCallback(() => {
    setUsers(AuthService.getAllUsers());
    setAttendants(AttendantService.getAll());
  }, []);

  useEffect(() => {
    loadData();
    // Garante busca de dados frescos diretamente do Cloudflare D1
    CloudSyncService.syncAllFromCloud();
    const unsubscribe = CloudSyncService.subscribe(loadData);
    return unsubscribe;
  }, [loadData]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setRole('ATENDENTE');
    setAttendantId('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setAttendantId(user.attendantId || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isAdmin) return;

    setIsSaving(true);
    try {
      if (editingUser) {
        await AuthService.updateUser(currentUser, editingUser.id, {
          name,
          role,
          attendantId: role === 'ATENDENTE' ? attendantId || undefined : undefined,
        });
        showToast('Usuário atualizado com sucesso.', 'success');
      } else {
        await AuthService.createUser(currentUser, {
          name,
          email,
          role,
          attendantId: role === 'ATENDENTE' ? attendantId || undefined : undefined,
        });
        showToast('Usuário criado com sucesso no banco de dados.', 'success', 'Usuário Criado');
      }
      setIsModalOpen(false);
      refreshUser();
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar usuário.';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (targetUser: UserProfile) => {
    if (!currentUser || !isAdmin) return;
    try {
      await AuthService.toggleUserStatus(currentUser, targetUser.id);
      showToast(
        `Usuário ${targetUser.name} foi ${targetUser.active ? 'desativado' : 'reativado'}.`,
        'info'
      );
      refreshUser();
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar status.';
      showToast(msg, 'error');
    }
  };

  const handleDeleteUser = async () => {
    if (!currentUser || !isAdmin || !deletingUser) return;
    setIsDeleting(true);
    try {
      await AuthService.deleteUser(currentUser, deletingUser.id);
      showToast(`Usuário ${deletingUser.name} excluído com sucesso do banco de dados.`, 'success');
      setDeletingUser(null);
      refreshUser();
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir usuário.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenResetPassword = (user: UserProfile) => {
    setResetUser(user);
    setResetMode('email');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    let pass = '';
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
    setConfirmNewPassword(pass);
    navigator.clipboard?.writeText(pass);
    showToast('Senha segura gerada e copiada para a área de transferência!', 'info');
  };

  const handleConfirmResetPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser || !isAdmin || !resetUser) return;

    if (resetMode === 'manual') {
      if (newPassword.length < 8) {
        showToast('A nova senha deve possuir pelo menos 8 caracteres.', 'warning');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        showToast('A confirmação de senha não coincide com a nova senha digitada.', 'error');
        return;
      }
    }

    setIsResettingPassword(true);
    try {
      const res = AuthService.resetUserPassword(
        currentUser,
        resetUser.id,
        resetMode === 'manual' ? { newPassword } : undefined
      );
      showToast(res.message, 'success', 'Senha Redefinida');
      setResetUser(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao redefinir senha do usuário.';
      showToast(msg, 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center text-error mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-2">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-on-surface-variant max-w-md">
          A gestão de usuários, senhas e permissões do sistema é restrita exclusivamente a administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Usuários do Sistema</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Gestão de identidades via Amazon Cognito, controle de senhas, permissões RBAC e vínculos
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleOpenCreate} icon="person_add">
          Novo Usuário
        </Button>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
        <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/40">
          <div className="max-w-xs w-full">
            <Input
              placeholder="Buscar por nome, e-mail ou perfil..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon="search"
            />
          </div>
          <span className="text-xs text-outline font-semibold">
            {filteredUsers.length} usuário(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
              <tr>
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">E-mail</th>
                <th className="px-5 py-3">Perfil RBAC</th>
                <th className="px-5 py-3">Vínculo Atendente</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Último Acesso</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center">
                      <span className="material-symbols-outlined text-4xl text-outline mb-2">
                        person_off
                      </span>
                      <p className="font-semibold text-xs text-on-surface">Nenhum usuário encontrado</p>
                      <p className="text-[11px] text-outline mt-0.5">
                        {searchTerm
                          ? 'Tente buscar por outro termo ou limpe o campo de busca.'
                          : 'Clique em "Novo Usuário" para realizar o primeiro cadastro.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrentLogged = currentUser?.id === u.id;
                  const linkedAttendant = attendants.find((a) => a.id === u.attendantId);

                  return (
                    <tr key={u.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-on-surface">{u.name}</span>
                          {isCurrentLogged && (
                            <span className="px-1.5 py-0.2 rounded bg-primary-fixed text-primary text-[10px] font-bold">
                              Você
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-on-surface-variant">{u.email}</td>
                      <td className="px-5 py-3">
                        {u.role === 'ADMIN' ? (
                          <Badge variant="primary" icon="shield_person">
                            ADMIN
                          </Badge>
                        ) : (
                          <Badge variant="secondary" icon="person">
                            ATENDENTE
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-outline">
                        {linkedAttendant ? `${linkedAttendant.name} (${linkedAttendant.code})` : '-'}
                      </td>
                      <td className="px-5 py-3">
                        {u.active ? (
                          <Badge variant="success" icon="check">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="neutral" icon="block">
                            Desativado
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-outline text-[11px]">
                        {u.lastLoginAt ? formatDateTimeBR(u.lastLoginAt) : 'Nunca acessou'}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão Editar */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(u)}
                            icon="edit"
                            title="Editar usuário"
                          >
                            Editar
                          </Button>

                          {/* Botão Redefinir Senha */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenResetPassword(u)}
                            icon="lock_reset"
                            title="Redefinir senha de acesso"
                          >
                            Senha
                          </Button>

                          {/* Botão Desativar / Ativar */}
                          <Button
                            variant={u.active ? 'ghost' : 'outline'}
                            size="sm"
                            disabled={isCurrentLogged}
                            onClick={() => handleToggleStatus(u)}
                            icon={u.active ? 'toggle_on' : 'toggle_off'}
                            title={
                              isCurrentLogged
                                ? 'Você não pode desativar seu próprio usuário'
                                : u.active
                                ? 'Desativar acesso'
                                : 'Reativar acesso'
                            }
                          >
                            {u.active ? 'Desativar' : 'Ativar'}
                          </Button>

                          {/* Botão Excluir */}
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isCurrentLogged}
                            onClick={() => setDeletingUser(u)}
                            icon="delete"
                            title={
                              isCurrentLogged
                                ? 'Você não pode excluir seu próprio usuário'
                                : 'Excluir usuário do sistema'
                            }
                          >
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar / Editar Usuário */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingUser ? 'Editar Usuário' : 'Novo Usuário do Sistema (Convite Cognito)'}
          subtitle="O usuário receberá as credenciais e definirá sua senha no primeiro acesso seguro."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={isSaving}
                loadingText="Salvando..."
              >
                {editingUser ? 'Salvar Alterações' : 'Criar e Convidar'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSave} className="flex flex-col gap-4 text-xs">
            <Input
              label="Nome Completo"
              placeholder="Ex.: Carlos Eduardo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              icon="person"
            />

            <Input
              label="E-mail Corporativo"
              type="email"
              placeholder="nome@drogaria.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!editingUser}
              required
              icon="mail"
              helperText={editingUser ? 'O e-mail principal do Cognito não pode ser alterado.' : undefined}
            />

            <Select
              label="Perfil de Acesso (RBAC)"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              options={[
                { value: 'ATENDENTE', label: 'ATENDENTE (Acesso somente leitura ao Dashboard)' },
                { value: 'ADMIN', label: 'ADMIN (Acesso total, gestão e lançamentos)' },
              ]}
              required
            />

            {role === 'ATENDENTE' && (
              <Select
                label="Vincular ao Cadastro de Atendente"
                value={attendantId}
                onChange={(e) => setAttendantId(e.target.value)}
                options={[
                  { value: '', label: 'Sem vínculo específico (Apenas atendente geral)' },
                  ...attendants.map((a) => ({
                    value: a.id,
                    label: `${a.name} (Cód. ${a.code})`,
                  })),
                ]}
                helperText="Permite que o atendente visualize seus próprios indicadores caso a opção esteja habilitada."
              />
            )}
          </form>
        </Modal>
      )}

      {/* Modal Redefinir Senha */}
      {resetUser && (
        <Modal
          isOpen={!!resetUser}
          onClose={() => setResetUser(null)}
          title="Redefinir Senha de Acesso"
          subtitle={`Usuário: ${resetUser.name} (${resetUser.email})`}
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetUser(null)}
                disabled={isResettingPassword}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmResetPassword}
                isLoading={isResettingPassword}
                loadingText="Processando..."
              >
                {resetMode === 'email' ? 'Enviar Link de Recuperação' : 'Salvar Nova Senha'}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 text-xs">
            {/* Opções de Redefinição */}
            <div className="flex rounded-lg bg-surface-container-low p-1 border border-outline-variant/30">
              <button
                type="button"
                className={`flex-1 py-2 px-3 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  resetMode === 'email'
                    ? 'bg-surface shadow-sm text-primary font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                onClick={() => setResetMode('email')}
              >
                <span className="material-symbols-outlined text-[18px]">mail</span>
                Instruções por E-mail
              </button>
              <button
                type="button"
                className={`flex-1 py-2 px-3 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  resetMode === 'manual'
                    ? 'bg-surface shadow-sm text-primary font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                onClick={() => setResetMode('manual')}
              >
                <span className="material-symbols-outlined text-[18px]">key</span>
                Definir Nova Senha
              </button>
            </div>

            {resetMode === 'email' ? (
              <div className="p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/30 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-primary font-bold">
                  <span className="material-symbols-outlined text-[20px]">mark_email_read</span>
                  <span>Envio de Link de Recuperação Cognito</span>
                </div>
                <p className="text-on-surface-variant leading-relaxed">
                  Um e-mail será enviado para <strong className="text-on-surface font-semibold">{resetUser.email}</strong> com instruções seguras para redefinição de senha.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant font-medium">Defina uma nova senha para o usuário:</span>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    className="text-primary hover:underline text-[11px] font-bold flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
                    Gerar e Copiar Senha
                  </button>
                </div>

                <Input
                  label="Nova Senha"
                  type="password"
                  placeholder="Mínimo de 8 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  icon="lock"
                  required
                />

                <Input
                  label="Confirmar Nova Senha"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  icon="lock"
                  required
                />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Diálogo de Confirmação de Exclusão */}
      <ConfirmDialog
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={handleDeleteUser}
        title="Excluir Usuário do Sistema"
        variant="destructive"
        isLoading={isDeleting}
        confirmLabel="Sim, Excluir Usuário"
        cancelLabel="Cancelar"
        description={
          <div className="flex flex-col gap-2">
            <p>
              Tem certeza que deseja excluir permanentemente o usuário{' '}
              <strong className="text-on-surface font-semibold">{deletingUser?.name}</strong> (
              <span className="text-primary font-mono">{deletingUser?.email}</span>)?
            </p>
            <p className="text-xs text-outline">
              Esta ação revogará imediatamente o acesso ao sistema e removerá o cadastro.
            </p>
          </div>
        }
      />
    </div>
  );
};

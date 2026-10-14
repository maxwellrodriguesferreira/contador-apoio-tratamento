import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AttendantService } from '../../services/attendants/attendantService';
import { Attendant } from '../../types';
import { formatDateTimeBR } from '../../utils/calculations';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { useToast } from '../../contexts/ToastContext';
import { CloudSyncService } from '../../services/api/cloudSyncService';

export const AtendentesPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAttendant, setEditingAttendant] = useState<Attendant | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [active, setActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Modal de Exclusão
  const [deletingAttendant, setDeletingAttendant] = useState<Attendant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadAttendants = useCallback(() => {
    setAttendants(AttendantService.getAll());
  }, []);

  useEffect(() => {
    loadAttendants();
    CloudSyncService.syncAllFromCloud();
    const unsubscribe = CloudSyncService.subscribe(loadAttendants);
    return unsubscribe;
  }, [loadAttendants]);

  const handleOpenCreate = () => {
    setEditingAttendant(null);
    setName('');
    const nextCode = String(attendants.length + 1).padStart(3, '0');
    setCode(nextCode);
    setActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (attendant: Attendant) => {
    setEditingAttendant(attendant);
    setName(attendant.name);
    setCode(attendant.code);
    setActive(attendant.active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;

    setIsSaving(true);
    try {
      if (editingAttendant) {
        const updated = AttendantService.update(user, editingAttendant.id, {
          name,
          code,
          active,
        });
        await CloudSyncService.syncAttendant(updated);
        showToast('Atendente atualizado com sucesso.', 'success');
      } else {
        const created = AttendantService.create(user, {
          name,
          code,
          active,
        });
        await CloudSyncService.syncAttendant(created);
        showToast('Atendente cadastrado com sucesso.', 'success');
      }
      setIsModalOpen(false);
      loadAttendants();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar atendente.';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (attendant: Attendant) => {
    if (!user || !isAdmin) return;
    try {
      const updated = AttendantService.toggleStatus(user, attendant.id);
      await CloudSyncService.syncAttendant(updated);
      showToast(
        `Atendente ${attendant.name} foi ${attendant.active ? 'desativado' : 'reativado'}.`,
        'info'
      );
      loadAttendants();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar status.';
      showToast(msg, 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || !isAdmin || !deletingAttendant) return;
    setIsDeleting(true);
    try {
      AttendantService.delete(user, deletingAttendant.id);
      await CloudSyncService.deleteAttendant(deletingAttendant.id);
      showToast(`Atendente ${deletingAttendant.name} excluído com sucesso do banco de dados.`, 'info', 'Exclusão Concluída');
      setDeletingAttendant(null);
      loadAttendants();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir atendente.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredAttendants = attendants.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center text-error mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-2">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-on-surface-variant max-w-md">
          A gestão e cadastro de atendentes é restrita aos administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Atendentes Farmacêuticos</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Gestão dos profissionais elegíveis para atribuição de Apoios ao Tratamento
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleOpenCreate} icon="person_add">
          Novo Atendente
        </Button>
      </div>

      {/* Tabela de Atendentes */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
        <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/40">
          <div className="max-w-xs w-full">
            <Input
              placeholder="Buscar atendente por nome ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon="search"
            />
          </div>
          <span className="text-xs text-outline font-semibold">
            {filteredAttendants.length} atendente(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
              <tr>
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Nome Completo</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Cadastrado Em</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
              {filteredAttendants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center">
                      <span className="material-symbols-outlined text-[28px] text-outline mb-1">
                        person_off
                      </span>
                      <p className="font-semibold text-xs text-on-surface">Nenhum atendente encontrado</p>
                      <p className="text-[11px] text-outline mt-0.5">
                        Clique em "Novo Atendente" para realizar o primeiro cadastro.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAttendants.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="px-5 py-3 font-mono font-bold text-primary">{a.code}</td>
                    <td className="px-5 py-3 font-bold text-sm text-on-surface">{a.name}</td>
                    <td className="px-5 py-3">
                      {a.active ? (
                        <Badge variant="success" icon="check">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="neutral" icon="block">
                          Inativo
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-outline text-[11px]">
                      {formatDateTimeBR(a.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Botão 1: Editar */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(a)}
                          icon="edit"
                          title="Editar atendente"
                        >
                          Editar
                        </Button>

                        {/* Botão 2: Desativar / Ativar */}
                        <Button
                          variant={a.active ? 'ghost' : 'outline'}
                          size="sm"
                          onClick={() => handleToggleStatus(a)}
                          icon={a.active ? 'toggle_on' : 'toggle_off'}
                          title={a.active ? 'Desativar atendente' : 'Reativar atendente'}
                        >
                          {a.active ? 'Desativar' : 'Ativar'}
                        </Button>

                        {/* Botão 3: Excluir */}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeletingAttendant(a)}
                          icon="delete"
                          title="Excluir atendente"
                        >
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar / Editar Atendente */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingAttendant ? 'Editar Atendente' : 'Novo Atendente'}
          subtitle="Atendentes ativos aparecem na lista de seleção para novos lançamentos de apoio."
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
                Salvar Atendente
              </Button>
            </>
          }
        >
          <form onSubmit={handleSave} className="flex flex-col gap-4 text-xs">
            <Input
              label="Nome do Atendente"
              placeholder="Ex.: João Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              icon="person"
            />

            <Input
              label="Código Identificador"
              placeholder="Ex.: 001"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              icon="pin"
            />

            <div className="flex items-center gap-2 p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 mt-1">
              <input
                type="checkbox"
                id="activeCheckbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <label htmlFor="activeCheckbox" className="text-xs font-semibold text-on-surface cursor-pointer">
                Atendente Ativo para Novos Lançamentos
              </label>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal de Confirmação de Exclusão de Atendente */}
      {deletingAttendant && (
        <ConfirmDialog
          isOpen={!!deletingAttendant}
          onClose={() => setDeletingAttendant(null)}
          onConfirm={handleConfirmDelete}
          title="Excluir Atendente?"
          variant="destructive"
          confirmLabel="Excluir Atendente"
          isLoading={isDeleting}
          description={
            <div className="flex flex-col gap-2">
              <p>
                <strong>Nome:</strong> {deletingAttendant.name}
              </p>
              <p>
                <strong>Código:</strong> {deletingAttendant.code}
              </p>
              <p className="mt-2 text-rose-700 font-medium">
                Tem certeza que deseja remover este cadastro de atendente? Caso ele possua lançamentos históricos de apoio, recomenda-se apenas <strong>Desativar</strong> para preservar a rastreabilidade da drogaria.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
};

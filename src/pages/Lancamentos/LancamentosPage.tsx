import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SupportService } from '../../services/supports/supportService';
import { AttendantService } from '../../services/attendants/attendantService';
import { TreatmentSupport, Attendant } from '../../types';
import { formatDateBR, formatDateTimeBR } from '../../utils/calculations';
import { exportSupportsToExcel, exportSupportsToCSV } from '../../utils/export';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Pagination } from '../../components/common/Pagination';
import { Badge } from '../../components/common/Badge';
import { useToast } from '../../contexts/ToastContext';
import { CloudSyncService } from '../../services/api/cloudSyncService';

export const LancamentosPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [supports, setSupports] = useState<TreatmentSupport[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);

  // Filtros
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAttendantId, setSelectedAttendantId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DELETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modais de Ação
  const [viewingSupport, setViewingSupport] = useState<TreatmentSupport | null>(null);
  const [editingSupport, setEditingSupport] = useState<TreatmentSupport | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editDate, setEditDate] = useState<string>('');
  const [editAttendantId, setEditAttendantId] = useState<string>('');
  const [editObservation, setEditObservation] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deletingSupport, setDeletingSupport] = useState<TreatmentSupport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [restoringSupport, setRestoringSupport] = useState<TreatmentSupport | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const loadData = useCallback(() => {
    const list = SupportService.getAll(true);
    const atts = AttendantService.getAll();
    setSupports(list);
    setAttendants(atts);
  }, []);

  useEffect(() => {
    loadData();
    CloudSyncService.syncAllFromCloud();
    const unsubscribe = CloudSyncService.subscribe(loadData);
    return unsubscribe;
  }, [loadData]);

  const attendantsMap = useMemo(() => {
    const map = new Map<string, Attendant>();
    attendants.forEach((a) => map.set(a.id, a));
    return map;
  }, [attendants]);

  // Filtragem
  const filteredSupports = useMemo(() => {
    return supports.filter((s) => {
      if (statusFilter === 'ACTIVE' && s.deletedAt) return false;
      if (statusFilter === 'DELETED' && !s.deletedAt) return false;

      if (startDate && s.date < startDate) return false;
      if (endDate && s.date > endDate) return false;

      if (selectedAttendantId && s.attendantId !== selectedAttendantId) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const att = attendantsMap.get(s.attendantId);
        const matchAttName = att?.name.toLowerCase().includes(query);
        const matchAttCode = att?.code.toLowerCase().includes(query);
        const matchObs = s.observation?.toLowerCase().includes(query);
        const matchCreatedBy = s.createdBy.toLowerCase().includes(query);
        if (!matchAttName && !matchAttCode && !matchObs && !matchCreatedBy) return false;
      }

      return true;
    });
  }, [supports, statusFilter, startDate, endDate, selectedAttendantId, searchQuery, attendantsMap]);

  // Paginação dos dados filtrados
  const totalItems = filteredSupports.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedSupports = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSupports.slice(start, start + pageSize);
  }, [filteredSupports, currentPage, pageSize]);

  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedAttendantId('');
    setStatusFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Abrir Edição
  const handleOpenEdit = (support: TreatmentSupport) => {
    setEditingSupport(support);
    setEditQuantity(support.quantity);
    setEditDate(support.date);
    setEditAttendantId(support.attendantId);
    setEditObservation(support.observation || '');
  };

  // Salvar Edição
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingSupport) return;
    setIsSavingEdit(true);
    try {
      SupportService.update(user, editingSupport.id, {
        date: editDate,
        attendantId: editAttendantId,
        quantity: editQuantity,
        observation: editObservation,
        expectedVersion: editingSupport.version,
      });

      showToast('✓ Apoio atualizado com sucesso.', 'success', 'Edição Salva');
      setEditingSupport(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar apoio.';
      showToast(msg, 'error', 'Erro de Concorrência/Validação');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Confirmar Exclusão (Soft Delete)
  const handleConfirmDelete = async () => {
    if (!user || !deletingSupport) return;
    setIsDeleting(true);
    try {
      SupportService.delete(user, deletingSupport.id);
      showToast('✓ Apoio excluído com sucesso.', 'info', 'Soft Delete Realizado');
      setDeletingSupport(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir apoio.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirmar Restauração
  const handleConfirmRestore = async () => {
    if (!user || !restoringSupport) return;
    setIsRestoring(true);
    try {
      SupportService.restore(user, restoringSupport.id);
      showToast('✓ Apoio restaurado com sucesso.', 'success', 'Registro Reabilitado');
      setRestoringSupport(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao restaurar apoio.';
      showToast(msg, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center text-error mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-2">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-on-surface-variant max-w-md">
          A listagem e gestão detalhada de lançamentos é exclusiva para administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Lançamentos de Apoio</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Histórico completo, auditoria de alterações, exportação e gestão de registros
          </p>
        </div>

        {/* Botões de Exportação */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportSupportsToCSV(filteredSupports, attendantsMap)}
            icon="description"
          >
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportSupportsToExcel(filteredSupports, attendantsMap)}
            icon="table_view"
          >
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Input
            label="Data Inicial"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setCurrentPage(1);
            }}
          />
          <Input
            label="Data Final"
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setCurrentPage(1);
            }}
          />
          <Select
            label="Atendente"
            value={selectedAttendantId}
            onChange={(e) => {
              setSelectedAttendantId(e.target.value);
              setCurrentPage(1);
            }}
            options={[
              { value: '', label: 'Todos os Atendentes' },
              ...attendants.map((a) => ({
                value: a.id,
                label: `${a.name} (Cód. ${a.code})`,
              })),
            ]}
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'DELETED');
              setCurrentPage(1);
            }}
            options={[
              { value: 'ALL', label: 'Todos os Status' },
              { value: 'ACTIVE', label: 'Somente Ativos' },
              { value: 'DELETED', label: 'Somente Excluídos (Soft Delete)' },
            ]}
          />
          <Input
            label="Busca Textual"
            placeholder="Atendente, observação..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            icon="search"
          />
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-outline-variant/20">
          <span className="text-xs font-semibold text-on-surface-variant">
            {filteredSupports.length} registro(s) encontrado(s)
          </span>
          <Button variant="ghost" size="sm" onClick={handleClearFilters} icon="filter_alt_off">
            Limpar Filtros
          </Button>
        </div>
      </div>

      {/* Tabela de Lançamentos */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Atendente</th>
                <th className="px-4 py-3 text-right">Qtd</th>
                <th className="px-4 py-3">Observação</th>
                <th className="px-4 py-3">Criado Por</th>
                <th className="px-4 py-3">Criado Em</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
              {paginatedSupports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center">
                      <span className="material-symbols-outlined text-[32px] text-outline mb-2">
                        search_off
                      </span>
                      <p className="font-semibold text-sm">Nenhum lançamento encontrado</p>
                      <p className="text-xs text-outline mt-1">Ajuste os filtros ou registre um novo apoio.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedSupports.map((s) => {
                  const attendant = attendantsMap.get(s.attendantId);
                  const isDeleted = !!s.deletedAt;

                  return (
                    <tr
                      key={s.id}
                      className={`hover:bg-surface-container-low/50 transition-colors ${
                        isDeleted ? 'bg-rose-50/40 opacity-75' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{formatDateBR(s.date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-on-surface">{attendant?.name || 'Desconhecido'}</span>
                          <span className="text-[10px] text-outline">Cód. {attendant?.code || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-sm text-primary">
                        {s.quantity}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-on-surface-variant" title={s.observation}>
                        {s.observation || '-'}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-outline whitespace-nowrap">{s.createdBy}</td>
                      <td className="px-4 py-3 text-[11px] text-outline whitespace-nowrap">
                        {formatDateTimeBR(s.createdAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isDeleted ? (
                          <Badge variant="error" icon="delete">
                            Excluído
                          </Badge>
                        ) : (
                          <Badge variant="success" icon="check_circle">
                            Ativo
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Visualizar */}
                          <button
                            onClick={() => setViewingSupport(s)}
                            className="p-1 rounded text-outline hover:text-primary hover:bg-surface-container transition-colors"
                            title="Visualizar detalhes"
                          >
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                          </button>

                          {!isDeleted ? (
                            <>
                              {/* Editar */}
                              <button
                                onClick={() => handleOpenEdit(s)}
                                className="p-1 rounded text-outline hover:text-amber-600 hover:bg-surface-container transition-colors"
                                title="Editar registro"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                              {/* Excluir */}
                              <button
                                onClick={() => setDeletingSupport(s)}
                                className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors"
                                title="Excluir apoio (Soft delete)"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </>
                          ) : (
                            /* Restaurar */
                            <button
                              onClick={() => setRestoringSupport(s)}
                              className="p-1 rounded text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 transition-colors font-semibold flex items-center gap-0.5 text-[11px]"
                              title="Restaurar registro excluído"
                            >
                              <span className="material-symbols-outlined text-[18px]">restore_from_trash</span>
                              <span>Restaurar</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Modal Visualizar Apoio */}
      {viewingSupport && (
        <Modal
          isOpen={!!viewingSupport}
          onClose={() => setViewingSupport(null)}
          title="Detalhes do Lançamento"
          subtitle={`Registro ID: ${viewingSupport.id}`}
        >
          <div className="flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-container-low rounded-lg">
              <div>
                <span className="text-outline block">Data do Apoio</span>
                <strong className="text-sm text-on-surface">{formatDateBR(viewingSupport.date)}</strong>
              </div>
              <div>
                <span className="text-outline block">Quantidade</span>
                <strong className="text-base text-primary font-bold">{viewingSupport.quantity}</strong>
              </div>
              <div>
                <span className="text-outline block">Atendente</span>
                <strong className="text-sm text-on-surface">
                  {attendantsMap.get(viewingSupport.attendantId)?.name} (Cód.{' '}
                  {attendantsMap.get(viewingSupport.attendantId)?.code})
                </strong>
              </div>
              <div>
                <span className="text-outline block">Versão do Registro</span>
                <strong className="text-sm text-on-surface">v{viewingSupport.version}</strong>
              </div>
            </div>

            <div>
              <span className="text-outline block mb-1">Observação Clínica/Operacional:</span>
              <p className="p-3 bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-on-surface">
                {viewingSupport.observation || 'Nenhuma observação informada.'}
              </p>
            </div>

            <div className="border-t border-outline-variant/30 pt-3 flex flex-col gap-1 text-[11px] text-outline">
              <p>Criado por: {viewingSupport.createdBy} em {formatDateTimeBR(viewingSupport.createdAt)}</p>
              {viewingSupport.updatedBy && (
                <p>Última atualização por: {viewingSupport.updatedBy} em {formatDateTimeBR(viewingSupport.updatedAt)}</p>
              )}
              {viewingSupport.deletedAt && (
                <p className="text-error font-semibold">
                  Excluído por: {viewingSupport.deletedBy} em {formatDateTimeBR(viewingSupport.deletedAt)}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Editar Apoio com Cálculo da Diferença (Regra 25) */}
      {editingSupport && (
        <Modal
          isOpen={!!editingSupport}
          onClose={() => setEditingSupport(null)}
          title="Editar Apoio ao Tratamento"
          subtitle="Ajuste os valores do registro. Os indicadores do Dashboard serão recalculados."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setEditingSupport(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveEdit}
                isLoading={isSavingEdit}
                loadingText="Salvando..."
              >
                Salvar Alterações
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveEdit} className="flex flex-col gap-4 text-xs">
            {/* Box com Cálculo Visual da Diferença (Regra 25) */}
            <div className="p-4 bg-primary-fixed rounded-xl border border-primary/20 flex items-center justify-between text-on-primary-fixed">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wider text-primary/80 font-bold">Quantidade Atual</span>
                <span className="text-xl font-extrabold text-primary">{editingSupport.quantity}</span>
              </div>
              <span className="material-symbols-outlined text-[20px] text-primary">arrow_forward</span>
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wider text-primary/80 font-bold">Nova Quantidade</span>
                <span className="text-xl font-extrabold text-primary">{editQuantity}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[11px] uppercase tracking-wider text-primary/80 font-bold">Diferença</span>
                <span
                  className={`text-xl font-extrabold ${
                    editQuantity - editingSupport.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {editQuantity - editingSupport.quantity >= 0
                    ? `+${editQuantity - editingSupport.quantity}`
                    : `${editQuantity - editingSupport.quantity}`}
                </span>
              </div>
            </div>

            <Input
              label="Data"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              required
            />

            <Select
              label="Atendente"
              value={editAttendantId}
              onChange={(e) => setEditAttendantId(e.target.value)}
              options={attendants.map((a) => ({
                value: a.id,
                label: `${a.name} (Cód. ${a.code}) ${!a.active ? '[Inativo]' : ''}`,
              }))}
              required
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Nova Quantidade <span className="text-error">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={editQuantity}
                onChange={(e) => setEditQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Observação
              </label>
              <textarea
                rows={3}
                value={editObservation}
                onChange={(e) => setEditObservation(e.target.value)}
                className="w-full p-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmação de Exclusão (Regra 28) */}
      {deletingSupport && (
        <ConfirmDialog
          isOpen={!!deletingSupport}
          onClose={() => setDeletingSupport(null)}
          onConfirm={handleConfirmDelete}
          title="Excluir Apoio?"
          variant="destructive"
          confirmLabel="Excluir"
          isLoading={isDeleting}
          description={
            <div className="flex flex-col gap-2">
              <p>
                <strong>Data:</strong> {formatDateBR(deletingSupport.date)}
              </p>
              <p>
                <strong>Atendente:</strong> {attendantsMap.get(deletingSupport.attendantId)?.name}
              </p>
              <p>
                <strong>Quantidade:</strong> {deletingSupport.quantity}
              </p>
              <p className="mt-2 text-rose-700 font-medium">
                O registro será removido dos indicadores e relatórios. Um ADMIN poderá restaurá-lo posteriormente.
              </p>
            </div>
          }
        />
      )}

      {/* Confirmação de Restauração (Regra 29) */}
      {restoringSupport && (
        <ConfirmDialog
          isOpen={!!restoringSupport}
          onClose={() => setRestoringSupport(null)}
          onConfirm={handleConfirmRestore}
          title="Restaurar Apoio Excluído?"
          variant="success"
          confirmLabel="Restaurar Registro"
          isLoading={isRestoring}
          description={
            <div className="flex flex-col gap-2">
              <p>
                <strong>Data:</strong> {formatDateBR(restoringSupport.date)}
              </p>
              <p>
                <strong>Atendente:</strong> {attendantsMap.get(restoringSupport.attendantId)?.name}
              </p>
              <p>
                <strong>Quantidade:</strong> {restoringSupport.quantity}
              </p>
              <p className="mt-2 text-emerald-700 font-medium">
                O registro voltará a ser contabilizado nos indicadores do Dashboard, relatórios e metas vigentes.
              </p>
            </div>
          }
        />
      )}
    </div>
  );
};

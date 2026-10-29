import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SupportService } from '../../services/supports/supportService';
import { RoutineService } from '../../services/routine/routineService';
import { AttendantService } from '../../services/attendants/attendantService';
import { TreatmentSupport, RoutineCare, Attendant } from '../../types';
import { formatDateBR, formatDateTimeBR } from '../../utils/calculations';
import { exportLancamentosToExcel, exportLancamentosToCSV } from '../../utils/export';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Pagination } from '../../components/common/Pagination';
import { Badge } from '../../components/common/Badge';
import { useToast } from '../../contexts/ToastContext';
import { CloudSyncService } from '../../services/api/cloudSyncService';

export type ServiceTypeFilter = 'ALL' | 'SUPPORT' | 'ROUTINE';

export interface UnifiedLancamento {
  id: string;
  serviceType: 'SUPPORT' | 'ROUTINE';
  date: string;
  attendantId: string;
  quantity: number;
  observation?: string;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt: string;
  deletedAt?: string | null;
  deletedBy?: string | null;
  version: number;
}

export const LancamentosPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [supports, setSupports] = useState<TreatmentSupport[]>([]);
  const [routines, setRoutines] = useState<RoutineCare[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);

  // Filtros
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceTypeFilter>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedAttendantId, setSelectedAttendantId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DELETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modais de Ação
  const [viewingItem, setViewingItem] = useState<UnifiedLancamento | null>(null);
  const [editingItem, setEditingItem] = useState<UnifiedLancamento | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editDate, setEditDate] = useState<string>('');
  const [editAttendantId, setEditAttendantId] = useState<string>('');
  const [editObservation, setEditObservation] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deletingItem, setDeletingItem] = useState<UnifiedLancamento | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [restoringItem, setRestoringItem] = useState<UnifiedLancamento | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Estados para Limpeza de Lançamentos
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearServiceType, setClearServiceType] = useState<ServiceTypeFilter>('ALL');
  const [clearScope, setClearScope] = useState<'ALL' | 'FILTERED' | 'TRASH_ONLY'>('ALL');
  const [clearMode, setClearMode] = useState<'HARD' | 'SOFT'>('HARD');
  const [isClearing, setIsClearing] = useState(false);

  const loadData = useCallback(() => {
    const sList = SupportService.getAll(true);
    const rList = RoutineService.getAll(true);
    const atts = AttendantService.getAll();
    setSupports(sList);
    setRoutines(rList);
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

  // Unifica lançamentos de Apoio e Na Rotina em uma única lista cronológica
  const allLancamentos = useMemo<UnifiedLancamento[]>(() => {
    const sItems: UnifiedLancamento[] = supports.map((s) => ({
      id: s.id,
      serviceType: 'SUPPORT' as const,
      date: s.date,
      attendantId: s.attendantId,
      quantity: s.quantity,
      observation: s.observation,
      createdBy: s.createdBy,
      createdAt: s.createdAt,
      updatedBy: s.updatedBy,
      updatedAt: s.updatedAt,
      deletedAt: s.deletedAt,
      deletedBy: s.deletedBy,
      version: s.version,
    }));

    const rItems: UnifiedLancamento[] = routines.map((r) => ({
      id: r.id,
      serviceType: 'ROUTINE' as const,
      date: r.date,
      attendantId: r.attendantId,
      quantity: r.quantity,
      observation: r.observation,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
      deletedBy: r.deletedBy,
      version: r.version,
    }));

    return [...sItems, ...rItems].sort((a, b) => {
      if (b.date !== a.date) {
        return b.date.localeCompare(a.date);
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [supports, routines]);

  // Filtragem
  const filteredLancamentos = useMemo(() => {
    return allLancamentos.filter((item) => {
      if (serviceTypeFilter === 'SUPPORT' && item.serviceType !== 'SUPPORT') return false;
      if (serviceTypeFilter === 'ROUTINE' && item.serviceType !== 'ROUTINE') return false;

      if (statusFilter === 'ACTIVE' && item.deletedAt) return false;
      if (statusFilter === 'DELETED' && !item.deletedAt) return false;

      if (startDate && item.date < startDate) return false;
      if (endDate && item.date > endDate) return false;

      if (selectedAttendantId && item.attendantId !== selectedAttendantId) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const att = attendantsMap.get(item.attendantId);
        const matchAttName = att?.name.toLowerCase().includes(query);
        const matchAttCode = att?.code.toLowerCase().includes(query);
        const matchObs = item.observation?.toLowerCase().includes(query);
        const matchCreatedBy = item.createdBy.toLowerCase().includes(query);
        if (!matchAttName && !matchAttCode && !matchObs && !matchCreatedBy) return false;
      }

      return true;
    });
  }, [allLancamentos, serviceTypeFilter, statusFilter, startDate, endDate, selectedAttendantId, searchQuery, attendantsMap]);

  // Paginação dos dados filtrados
  const totalItems = filteredLancamentos.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedLancamentos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLancamentos.slice(start, start + pageSize);
  }, [filteredLancamentos, currentPage, pageSize]);

  const handleClearFilters = () => {
    setServiceTypeFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSelectedAttendantId('');
    setStatusFilter('ALL');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Abrir Edição
  const handleOpenEdit = (item: UnifiedLancamento) => {
    setEditingItem(item);
    setEditQuantity(item.quantity);
    setEditDate(item.date);
    setEditAttendantId(item.attendantId);
    setEditObservation(item.observation || '');
  };

  // Salvar Edição
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingItem) return;
    setIsSavingEdit(true);
    const serviceName = editingItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina';
    try {
      if (editingItem.serviceType === 'SUPPORT') {
        await SupportService.update(user, editingItem.id, {
          date: editDate,
          attendantId: editAttendantId,
          quantity: editQuantity,
          observation: editObservation,
          expectedVersion: editingItem.version,
        });
      } else {
        await RoutineService.update(user, editingItem.id, {
          date: editDate,
          attendantId: editAttendantId,
          quantity: editQuantity,
          observation: editObservation,
          expectedVersion: editingItem.version,
        });
      }

      showToast(`✓ ${serviceName} atualizado com sucesso.`, 'success', 'Edição Salva');
      setEditingItem(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Erro ao atualizar ${serviceName}.`;
      showToast(msg, 'error', 'Erro de Concorrência/Validação');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Confirmar Exclusão (Soft Delete)
  const handleConfirmDelete = async () => {
    if (!user || !deletingItem) return;
    setIsDeleting(true);
    const serviceName = deletingItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina';
    try {
      if (deletingItem.serviceType === 'SUPPORT') {
        await SupportService.delete(user, deletingItem.id);
      } else {
        await RoutineService.delete(user, deletingItem.id);
      }
      showToast(`✓ ${serviceName} excluído com sucesso.`, 'info', 'Soft Delete Realizado');
      setDeletingItem(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Erro ao excluir ${serviceName}.`;
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirmar Restauração
  const handleConfirmRestore = async () => {
    if (!user || !restoringItem) return;
    setIsRestoring(true);
    const serviceName = restoringItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina';
    try {
      if (restoringItem.serviceType === 'SUPPORT') {
        await SupportService.restore(user, restoringItem.id);
      } else {
        await RoutineService.restore(user, restoringItem.id);
      }
      showToast(`✓ ${serviceName} restaurado com sucesso.`, 'success', 'Registro Reabilitado');
      setRestoringItem(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Erro ao restaurar ${serviceName}.`;
      showToast(msg, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  // Itens alvo da limpeza baseado na seleção do usuário
  const clearTargetItems = useMemo(() => {
    let base = clearScope === 'FILTERED' ? filteredLancamentos : allLancamentos;
    if (clearScope === 'TRASH_ONLY') {
      base = base.filter((i) => Boolean(i.deletedAt));
    }
    if (clearServiceType === 'SUPPORT') {
      base = base.filter((i) => i.serviceType === 'SUPPORT');
    } else if (clearServiceType === 'ROUTINE') {
      base = base.filter((i) => i.serviceType === 'ROUTINE');
    }
    return base;
  }, [allLancamentos, filteredLancamentos, clearScope, clearServiceType]);

  const clearTargetCount = clearTargetItems.length;
  const clearTargetQuantitySum = clearTargetItems.reduce((acc, curr) => acc + curr.quantity, 0);

  // Executa a limpeza dos lançamentos selecionados
  const handleConfirmClear = async () => {
    if (!user || !isAdmin || clearTargetCount === 0) return;
    setIsClearing(true);
    try {
      const isHard = clearMode === 'HARD';
      const isTrashOnly = clearScope === 'TRASH_ONLY';
      const isFiltered = clearScope === 'FILTERED';

      let supportIds: string[] | undefined = undefined;
      let routineIds: string[] | undefined = undefined;

      if (isFiltered) {
        supportIds = clearTargetItems.filter((i) => i.serviceType === 'SUPPORT').map((i) => i.id);
        routineIds = clearTargetItems.filter((i) => i.serviceType === 'ROUTINE').map((i) => i.id);
      }

      let clearedSupports = 0;
      let clearedRoutines = 0;

      if (clearServiceType === 'ALL' || clearServiceType === 'SUPPORT') {
        clearedSupports = await SupportService.clearLancamentos(user, {
          hardDelete: isHard,
          onlyDeleted: isTrashOnly,
          targetIds: supportIds,
        });
      }

      if (clearServiceType === 'ALL' || clearServiceType === 'ROUTINE') {
        clearedRoutines = await RoutineService.clearLancamentos(user, {
          hardDelete: isHard,
          onlyDeleted: isTrashOnly,
          targetIds: routineIds,
        });
      }

      const totalCleared = clearedSupports + clearedRoutines;
      showToast(
        `✓ Limpeza concluída com sucesso! ${totalCleared} registro(s) foram processados (${
          isHard ? 'excluídos definitivamente' : 'movidos para a lixeira'
        }).`,
        'success',
        'Lançamentos Limpos'
      );
      setIsClearModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao limpar registros de lançamentos.';
      showToast(msg, 'error');
    } finally {
      setIsClearing(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center text-error mb-4">
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
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Lançamentos de Serviços</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Histórico unificado de Apoio ao Tratamento e Na Rotina, com auditoria, exportação e gestão de registros
          </p>
        </div>

        {/* Botões de Ação e Exportação */}
        <div className="flex items-center gap-2">
          {allLancamentos.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClearModalOpen(true)}
              icon="delete_sweep"
              className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors"
            >
              Limpar Lançamentos
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportLancamentosToCSV(filteredLancamentos, attendantsMap)}
            icon="description"
          >
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportLancamentosToExcel(filteredLancamentos, attendantsMap)}
            icon="table_view"
          >
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5">
        {/* Seletor Visual de Tipo de Serviço */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/20 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mr-1">
            Filtrar Serviço:
          </span>
          <button
            type="button"
            onClick={() => {
              setServiceTypeFilter('ALL');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              serviceTypeFilter === 'ALL'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">hub</span>
            Todos os Serviços ({allLancamentos.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setServiceTypeFilter('SUPPORT');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              serviceTypeFilter === 'SUPPORT'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">health_and_safety</span>
            Apoio ao Tratamento ({supports.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setServiceTypeFilter('ROUTINE');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              serviceTypeFilter === 'ROUTINE'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">assignment_turned_in</span>
            Na Rotina ({routines.length})
          </button>
        </div>

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
            {filteredLancamentos.length} registro(s) encontrado(s)
          </span>
          <Button variant="ghost" size="sm" onClick={handleClearFilters} icon="filter_alt_off">
            Limpar Filtros
          </Button>
        </div>
      </div>

      {/* Tabela de Lançamentos */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
        {/* Visualização em Cards para Dispositivos Móveis (Celulares) */}
        <div className="md:hidden divide-y divide-outline-variant/20">
          {paginatedLancamentos.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[36px] text-outline mb-2">
                search_off
              </span>
              <p className="font-semibold text-sm">Nenhum lançamento encontrado</p>
              <p className="text-xs text-outline mt-1">Ajuste os filtros ou registre um novo atendimento.</p>
            </div>
          ) : (
            paginatedLancamentos.map((item) => {
              const attendant = attendantsMap.get(item.attendantId);
              const isDeleted = !!item.deletedAt;
              const isSupport = item.serviceType === 'SUPPORT';

              return (
                <div
                  key={`mobile-${item.serviceType}-${item.id}`}
                  className={`p-4 transition-colors ${
                    isDeleted ? 'bg-rose-50/40 dark:bg-rose-950/20 opacity-80' : ''
                  }`}
                >
                  {/* Topo do Card Mobile */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isSupport ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50">
                          <span className="material-symbols-outlined text-[15px] text-blue-600">health_and_safety</span>
                          Apoio
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/50">
                          <span className="material-symbols-outlined text-[15px] text-purple-600">assignment_turned_in</span>
                          Na Rotina
                        </span>
                      )}
                      <span className="text-xs font-bold text-on-surface">
                        {formatDateBR(item.date)}
                      </span>
                    </div>

                    <div>
                      {isDeleted ? (
                        <Badge variant="error" icon="delete">
                          Excluído
                        </Badge>
                      ) : (
                        <Badge variant="success" icon="check_circle">
                          Ativo
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Corpo do Card: Atendente e Quantidade */}
                  <div className="flex items-center justify-between gap-2 my-2.5">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-on-surface">
                        {attendant?.name || 'Desconhecido'}
                      </span>
                      <span className="text-[11px] text-outline font-mono">
                        Cód. {attendant?.code || '-'}
                      </span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-xl font-extrabold ${
                          isSupport ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'
                        }`}
                      >
                        +{item.quantity}
                      </span>
                      <span className="text-[10px] text-outline block">
                        {isSupport ? 'apoios' : 'rotina'}
                      </span>
                    </div>
                  </div>

                  {/* Observação */}
                  {item.observation && (
                    <div className="my-2 p-2 rounded-lg bg-surface-container-low text-xs text-on-surface-variant italic border border-outline-variant/20">
                      "{item.observation}"
                    </div>
                  )}

                  {/* Metadados e Ações Touch-Friendly */}
                  <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-outline-variant/20 flex-wrap gap-2 text-xs">
                    <div className="text-[10px] text-outline truncate max-w-[170px]">
                      {item.createdBy} • {formatDateTimeBR(item.createdAt)}
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        onClick={() => setViewingItem(item)}
                        className="px-2.5 py-1.5 rounded-lg text-outline hover:text-primary hover:bg-surface-container transition-colors text-xs font-semibold flex items-center gap-1 border border-outline-variant/30"
                        title="Visualizar detalhes"
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        <span>Ver</span>
                      </button>

                      {!isDeleted ? (
                        <>
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="px-2.5 py-1.5 rounded-lg text-outline hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors text-xs font-semibold flex items-center gap-1 border border-outline-variant/30"
                            title="Editar registro"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                            <span>Editar</span>
                          </button>
                          <button
                            onClick={() => setDeletingItem(item)}
                            className="p-1.5 rounded-lg text-outline hover:text-error hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors border border-outline-variant/30"
                            title="Excluir lançamento"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setRestoringItem(item)}
                          className="px-2.5 py-1.5 rounded-lg text-emerald-600 hover:text-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 transition-colors font-bold flex items-center gap-1 text-xs border border-emerald-200 dark:border-emerald-800"
                          title="Restaurar registro excluído"
                        >
                          <span className="material-symbols-outlined text-[16px]">restore_from_trash</span>
                          <span>Restaurar</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tabela Completa para Tablets e Telas Maiores (md: e superior) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
              <tr>
                <th className="px-4 py-3">Tipo de Serviço</th>
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
              {paginatedLancamentos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-on-surface-variant">
                    <div className="flex flex-col items-center justify-center">
                      <span className="material-symbols-outlined text-[32px] text-outline mb-2">
                        search_off
                      </span>
                      <p className="font-semibold text-sm">Nenhum lançamento encontrado</p>
                      <p className="text-xs text-outline mt-1">Ajuste os filtros ou registre um novo atendimento.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLancamentos.map((item) => {
                  const attendant = attendantsMap.get(item.attendantId);
                  const isDeleted = !!item.deletedAt;
                  const isSupport = item.serviceType === 'SUPPORT';

                  return (
                    <tr
                      key={`${item.serviceType}-${item.id}`}
                      className={`hover:bg-surface-container-low/50 transition-colors ${
                        isDeleted ? 'bg-rose-50/40 dark:bg-rose-950/20 opacity-75' : ''
                      }`}
                    >
                      {/* Tipo de Serviço */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isSupport ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50 shadow-xs">
                            <span className="material-symbols-outlined text-[15px] text-blue-600 dark:text-blue-400">health_and_safety</span>
                            Apoio
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/50 shadow-xs">
                            <span className="material-symbols-outlined text-[15px] text-purple-600 dark:text-purple-400">assignment_turned_in</span>
                            Na Rotina
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{formatDateBR(item.date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-on-surface">{attendant?.name || 'Desconhecido'}</span>
                          <span className="text-[10px] text-outline">Cód. {attendant?.code || '-'}</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold text-sm ${isSupport ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`}>
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-on-surface-variant" title={item.observation}>
                        {item.observation || '-'}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-outline whitespace-nowrap">{item.createdBy}</td>
                      <td className="px-4 py-3 text-[11px] text-outline whitespace-nowrap">
                        {formatDateTimeBR(item.createdAt)}
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
                            onClick={() => setViewingItem(item)}
                            className="p-1 rounded text-outline hover:text-primary hover:bg-surface-container transition-colors"
                            title="Visualizar detalhes"
                          >
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                          </button>

                          {!isDeleted ? (
                            <>
                              {/* Editar */}
                              <button
                                onClick={() => handleOpenEdit(item)}
                                className="p-1 rounded text-outline hover:text-amber-600 hover:bg-surface-container transition-colors"
                                title="Editar registro"
                              >
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                              </button>
                              {/* Excluir */}
                              <button
                                onClick={() => setDeletingItem(item)}
                                className="p-1 rounded text-outline hover:text-error hover:bg-surface-container transition-colors"
                                title="Excluir lançamento (Soft delete)"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </>
                          ) : (
                            /* Restaurar */
                            <button
                              onClick={() => setRestoringItem(item)}
                              className="p-1 rounded text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors font-semibold flex items-center gap-0.5 text-[11px]"
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

      {/* Modal Visualizar Lançamento */}
      {viewingItem && (
        <Modal
          isOpen={!!viewingItem}
          onClose={() => setViewingItem(null)}
          title="Detalhes do Lançamento"
          subtitle={`Serviço: ${viewingItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina'} | ID: ${viewingItem.id}`}
        >
          <div className="flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-container-low rounded-lg">
              <div>
                <span className="text-outline block">Tipo de Serviço</span>
                <strong className={`text-sm font-bold ${viewingItem.serviceType === 'SUPPORT' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`}>
                  {viewingItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina'}
                </strong>
              </div>
              <div>
                <span className="text-outline block">Data do Atendimento</span>
                <strong className="text-sm text-on-surface">{formatDateBR(viewingItem.date)}</strong>
              </div>
              <div>
                <span className="text-outline block">Quantidade</span>
                <strong className="text-base text-primary font-bold">{viewingItem.quantity}</strong>
              </div>
              <div>
                <span className="text-outline block">Atendente</span>
                <strong className="text-sm text-on-surface">
                  {attendantsMap.get(viewingItem.attendantId)?.name} (Cód.{' '}
                  {attendantsMap.get(viewingItem.attendantId)?.code})
                </strong>
              </div>
              <div>
                <span className="text-outline block">Versão do Registro</span>
                <strong className="text-sm text-on-surface">v{viewingItem.version}</strong>
              </div>
            </div>

            <div>
              <span className="text-outline block mb-1">Observação Clínica/Operacional:</span>
              <p className="p-3 bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-on-surface">
                {viewingItem.observation || 'Nenhuma observação informada.'}
              </p>
            </div>

            <div className="border-t border-outline-variant/30 pt-3 flex flex-col gap-1 text-[11px] text-outline">
              <p>Criado por: {viewingItem.createdBy} em {formatDateTimeBR(viewingItem.createdAt)}</p>
              {viewingItem.updatedBy && (
                <p>Última atualização por: {viewingItem.updatedBy} em {formatDateTimeBR(viewingItem.updatedAt)}</p>
              )}
              {viewingItem.deletedAt && (
                <p className="text-error font-semibold">
                  Excluído por: {viewingItem.deletedBy} em {formatDateTimeBR(viewingItem.deletedAt)}
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Editar Lançamento */}
      {editingItem && (
        <Modal
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          title={`Editar ${editingItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina'}`}
          subtitle="Ajuste os valores do registro. Os totalizadores e ranking serão recalculados."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setEditingItem(null)}>
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
            {/* Box com Cálculo Visual da Diferença */}
            <div className="p-4 bg-primary-fixed dark:bg-primary/20 rounded-xl border border-primary/20 flex items-center justify-between text-on-primary-fixed dark:text-primary">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wider text-primary/80 dark:text-primary font-bold">Quantidade Atual</span>
                <span className="text-xl font-extrabold text-primary">{editingItem.quantity}</span>
              </div>
              <span className="material-symbols-outlined text-[20px] text-primary">arrow_forward</span>
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-wider text-primary/80 dark:text-primary font-bold">Nova Quantidade</span>
                <span className="text-xl font-extrabold text-primary">{editQuantity}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[11px] uppercase tracking-wider text-primary/80 dark:text-primary font-bold">Diferença</span>
                <span
                  className={`text-xl font-extrabold ${
                    editQuantity - editingItem.quantity >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {editQuantity - editingItem.quantity >= 0
                    ? `+${editQuantity - editingItem.quantity}`
                    : `${editQuantity - editingItem.quantity}`}
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

      {/* Confirmação de Exclusão */}
      {deletingItem && (
        <ConfirmDialog
          isOpen={!!deletingItem}
          onClose={() => setDeletingItem(null)}
          onConfirm={handleConfirmDelete}
          title={`Excluir ${deletingItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina'}?`}
          variant="destructive"
          confirmLabel="Excluir"
          isLoading={isDeleting}
          description={
            <div className="flex flex-col gap-2">
              <p>
                <strong>Tipo:</strong> {deletingItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina'}
              </p>
              <p>
                <strong>Data:</strong> {formatDateBR(deletingItem.date)}
              </p>
              <p>
                <strong>Atendente:</strong> {attendantsMap.get(deletingItem.attendantId)?.name}
              </p>
              <p>
                <strong>Quantidade:</strong> {deletingItem.quantity}
              </p>
              <p className="mt-2 text-rose-700 dark:text-rose-400 font-medium">
                O registro será removido dos indicadores e relatórios. Um ADMIN poderá restaurá-lo posteriormente.
              </p>
            </div>
          }
        />
      )}

      {/* Confirmação de Restauração */}
      {restoringItem && (
        <ConfirmDialog
          isOpen={!!restoringItem}
          onClose={() => setRestoringItem(null)}
          onConfirm={handleConfirmRestore}
          title={`Restaurar ${restoringItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina'}?`}
          variant="success"
          confirmLabel="Restaurar Registro"
          isLoading={isRestoring}
          description={
            <div className="flex flex-col gap-2">
              <p>
                <strong>Tipo:</strong> {restoringItem.serviceType === 'SUPPORT' ? 'Apoio ao Tratamento' : 'Na Rotina'}
              </p>
              <p>
                <strong>Data:</strong> {formatDateBR(restoringItem.date)}
              </p>
              <p>
                <strong>Atendente:</strong> {attendantsMap.get(restoringItem.attendantId)?.name}
              </p>
              <p>
                <strong>Quantidade:</strong> {restoringItem.quantity}
              </p>
              <p className="mt-2 text-emerald-700 dark:text-emerald-400 font-medium">
                O registro voltará a ser contabilizado nos indicadores do Dashboard, relatórios e metas vigentes.
              </p>
            </div>
          }
        />
      )}

      {/* Modal de Limpeza de Lançamentos */}
      {isClearModalOpen && (
        <Modal
          isOpen={isClearModalOpen}
          onClose={() => setIsClearModalOpen(false)}
          title="Limpar Registros de Lançamentos"
          subtitle="Permite apagar ou mover para lixeira registros de apoio ao tratamento e na rotina com segurança."
          maxWidth="lg"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsClearModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmClear}
                isLoading={isClearing}
                loadingText="Limpando Registros..."
                icon="delete_sweep"
                disabled={clearTargetCount === 0}
              >
                Confirmar Limpeza ({clearTargetCount} registros)
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 text-xs">
            {/* Opção 1: Serviço */}
            <Select
              label="Tipo de Serviço a Limpar"
              value={clearServiceType}
              onChange={(e) => setClearServiceType(e.target.value as ServiceTypeFilter)}
              options={[
                { value: 'ALL', label: 'Todos os Lançamentos (Apoio ao Tratamento + Na Rotina)' },
                { value: 'SUPPORT', label: 'Apenas Apoios ao Tratamento' },
                { value: 'ROUTINE', label: 'Apenas Atendimentos Na Rotina' },
              ]}
            />

            {/* Opção 2: Abrangência */}
            <Select
              label="Abrangência dos Registros"
              value={clearScope}
              onChange={(e) => setClearScope(e.target.value as 'ALL' | 'FILTERED' | 'TRASH_ONLY')}
              options={[
                { value: 'ALL', label: `Todos os registros cadastrados (${allLancamentos.length} no total)` },
                {
                  value: 'FILTERED',
                  label: `Apenas registros filtrados na tabela atualmente (${filteredLancamentos.length} registros)`,
                },
                {
                  value: 'TRASH_ONLY',
                  label: `Apenas registros que já estão na lixeira (${allLancamentos.filter((i) => i.deletedAt).length} excluídos)`,
                },
              ]}
            />

            {/* Opção 3: Modo de Exclusão */}
            <Select
              label="Método de Limpeza"
              value={clearMode}
              onChange={(e) => setClearMode(e.target.value as 'HARD' | 'SOFT')}
              options={[
                {
                  value: 'HARD',
                  label: 'Exclusão Definitiva (Hard Delete / Purgar do Banco e Nuvem)',
                },
                {
                  value: 'SOFT',
                  label: 'Mover para Lixeira (Soft Delete - preserva possibilidade de restauração)',
                },
              ]}
            />

            {/* Resumo do Impacto */}
            <div className={`p-4 rounded-xl border ${
              clearMode === 'HARD'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="flex items-center gap-2 mb-2 font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">
                  {clearMode === 'HARD' ? 'warning' : 'info'}
                </span>
                <span>Resumo da Operação</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-outline block text-[11px]">Registros Afetados:</span>
                  <span className="font-extrabold text-base">{clearTargetCount}</span>
                </div>
                <div>
                  <span className="text-outline block text-[11px]">Volume de Atendimentos:</span>
                  <span className="font-extrabold text-base">{clearTargetQuantitySum} apoios/rotinas</span>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed">
                {clearMode === 'HARD'
                  ? 'Atenção: A exclusão definitiva remove os registros permanentemente do banco local e do Cloudflare D1. Esta ação não poderá ser desfeita.'
                  : 'Os registros serão marcados como excluídos e não aparecerão mais nos cálculos ativos, mas poderão ser restaurados por um administrador.'}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

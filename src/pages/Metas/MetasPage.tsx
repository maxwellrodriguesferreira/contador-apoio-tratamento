import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { GoalService } from '../../services/goals/goalService';
import { AttendantService } from '../../services/attendants/attendantService';
import { Goal, GoalType, Attendant } from '../../types';
import { formatDateBR, formatDateTimeBR, getTodayISODate } from '../../utils/calculations';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/States';
import { useToast } from '../../contexts/ToastContext';
import { CloudSyncService } from '../../services/api/cloudSyncService';

type FilterTab = 'ALL' | 'ACTIVE' | 'HISTORY' | 'STORE' | 'ATTENDANT';

export const MetasPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);

  // Estados do Modal de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalType, setGoalType] = useState<GoalType>('DAILY_STORE');
  const [targetValue, setTargetValue] = useState<number>(60);
  const [startDate, setStartDate] = useState<string>(getTodayISODate());
  const [endDate, setEndDate] = useState<string>('');
  const [selectedAttendantId, setSelectedAttendantId] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);

  // Estados de Exclusão
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Filtros da Tabela
  const [currentTab, setCurrentTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(() => {
    setGoals(GoalService.getAll());
    setAttendants(AttendantService.getAll());
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

  const activeGoals = useMemo(() => goals.filter((g) => g.active), [goals]);
  const historyGoals = useMemo(() => goals.filter((g) => !g.active), [goals]);

  const dailyStoreGoal = useMemo(
    () => activeGoals.find((g) => g.type === 'DAILY_STORE'),
    [activeGoals]
  );
  const monthlyStoreGoal = useMemo(
    () => activeGoals.find((g) => g.type === 'MONTHLY_STORE'),
    [activeGoals]
  );
  const attendantActiveGoalsCount = useMemo(
    () => activeGoals.filter((g) => g.type === 'DAILY_ATTENDANT' || g.type === 'MONTHLY_ATTENDANT').length,
    [activeGoals]
  );

  const formatGoalTypeName = useCallback(
    (type: GoalType, attendantId?: string) => {
      switch (type) {
        case 'DAILY_STORE':
          return 'Meta Diária da Drogaria';
        case 'MONTHLY_STORE':
          return 'Meta Mensal da Drogaria';
        case 'DAILY_ATTENDANT': {
          const att = attendantsMap.get(attendantId || '');
          return `Meta Diária: ${att ? `${att.name} (Cód. ${att.code})` : 'Atendente'}`;
        }
        case 'MONTHLY_ATTENDANT': {
          const att = attendantsMap.get(attendantId || '');
          return `Meta Mensal: ${att ? `${att.name} (Cód. ${att.code})` : 'Atendente'}`;
        }
        default:
          return type;
      }
    },
    [attendantsMap]
  );

  // Abertura para Criação
  const handleOpenCreate = (defaultType: GoalType = 'DAILY_STORE', defaultValue: number = 60) => {
    setEditingGoal(null);
    setGoalType(defaultType);
    setTargetValue(defaultValue);
    setStartDate(getTodayISODate());
    setEndDate('');
    setSelectedAttendantId('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  // Abertura para Edição
  const handleOpenEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setGoalType(goal.type);
    setTargetValue(goal.targetValue);
    setStartDate(goal.startDate);
    setEndDate(goal.endDate || '');
    setSelectedAttendantId(goal.attendantId || '');
    setIsActive(goal.active);
    setIsModalOpen(true);
  };

  // Salvar Meta (Criação ou Edição)
  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;

    if (
      (goalType === 'DAILY_ATTENDANT' || goalType === 'MONTHLY_ATTENDANT') &&
      !selectedAttendantId
    ) {
      showToast('Por favor, selecione um atendente para esta meta.', 'error', 'Campo Obrigatório');
      return;
    }

    if (endDate && endDate < startDate) {
      showToast('A data final não pode ser anterior à data inicial.', 'error', 'Data Inválida');
      return;
    }

    setIsSaving(true);
    try {
      if (editingGoal) {
        // Atualizar meta existente
        await GoalService.updateGoal(user, editingGoal.id, {
          type: goalType,
          targetValue,
          startDate,
          endDate: endDate ? endDate : null,
          active: isActive,
          attendantId:
            goalType === 'DAILY_ATTENDANT' || goalType === 'MONTHLY_ATTENDANT'
              ? selectedAttendantId || undefined
              : undefined,
        });

        showToast('Meta atualizada com sucesso no banco de dados.', 'success', 'Meta Editada');
      } else {
        // Criar nova meta (com versionamento automático se ativa)
        await GoalService.setGoal(user, {
          type: goalType,
          targetValue,
          startDate,
          endDate: endDate ? endDate : null,
          attendantId:
            goalType === 'DAILY_ATTENDANT' || goalType === 'MONTHLY_ATTENDANT'
              ? selectedAttendantId || undefined
              : undefined,
        });

        showToast('Meta configurada e salva com sucesso no banco de dados.', 'success', 'Meta Definida');
      }

      setIsModalOpen(false);
      setEditingGoal(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar meta.';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirmar Exclusão Individual
  const handleConfirmDeleteGoal = async () => {
    if (!user || !isAdmin || !goalToDelete) return;

    setIsDeleting(true);
    try {
      await GoalService.deleteGoal(user, goalToDelete.id);
      showToast('Meta excluída com sucesso.', 'success', 'Meta Excluída');
      setGoalToDelete(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir meta.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirmar Exclusão de Todas as Metas (Refazer)
  const handleConfirmClearAll = async () => {
    if (!user || !isAdmin) return;

    setIsClearingAll(true);
    try {
      await GoalService.clearAllGoals(user);
      showToast(
        'Todas as metas foram excluídas. Agora você pode redefinir o planejamento do zero.',
        'success',
        'Metas Resetadas'
      );
      setIsClearAllModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao resetar metas.';
      showToast(msg, 'error');
    } finally {
      setIsClearingAll(false);
    }
  };

  // Filtragem dos dados da tabela
  const filteredGoals = useMemo(() => {
    return goals.filter((g) => {
      // Filtro por Aba
      if (currentTab === 'ACTIVE' && !g.active) return false;
      if (currentTab === 'HISTORY' && g.active) return false;
      if (currentTab === 'STORE' && g.type !== 'DAILY_STORE' && g.type !== 'MONTHLY_STORE') return false;
      if (currentTab === 'ATTENDANT' && g.type !== 'DAILY_ATTENDANT' && g.type !== 'MONTHLY_ATTENDANT') return false;

      // Filtro por Busca textual
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const typeName = formatGoalTypeName(g.type, g.attendantId).toLowerCase();
        const attendant = g.attendantId ? attendantsMap.get(g.attendantId) : null;
        const attendantName = attendant?.name.toLowerCase() || '';
        const attendantCode = attendant?.code.toLowerCase() || '';
        const targetStr = g.targetValue.toString();

        const matches =
          typeName.includes(query) ||
          attendantName.includes(query) ||
          attendantCode.includes(query) ||
          targetStr.includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [goals, currentTab, searchQuery, formatGoalTypeName, attendantsMap]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center text-error mb-4">
          <span className="material-symbols-outlined text-[32px]">lock</span>
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-2">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-on-surface-variant max-w-md">
          A configuração, edição e exclusão de metas operacionais é permitida apenas para administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Metas Operacionais</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Gestão de metas diárias e mensais, edição de valores vigentes, histórico temporal e opção de refazer metas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {goals.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClearAllModalOpen(true)}
              icon="restart_alt"
              className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors"
            >
              Refazer / Limpar Metas
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenCreate('DAILY_STORE', 60)}
            icon="add_task"
          >
            Nova Meta
          </Button>
        </div>
      </div>

      {/* Cards de Metas Vigentes Atuais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card: Meta Diária Drogaria */}
        <div className="bg-surface-container-lowest rounded-xl border border-primary/20 shadow-subtle p-5 flex flex-col justify-between transition-all hover:border-primary/40">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">Meta Diária Drogaria</span>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">store</span>
              </div>
            </div>
            <div className="my-3">
              {dailyStoreGoal ? (
                <>
                  <span className="text-3xl font-extrabold text-on-surface">
                    {dailyStoreGoal.targetValue}
                  </span>
                  <span className="text-xs text-outline ml-1.5 font-semibold">apoios/dia</span>
                </>
              ) : (
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-on-surface-variant">Não cadastrada</span>
                  <span className="text-[11px] text-outline">Padrão do sistema: 60 apoios</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20 text-[11px]">
            <span className="text-outline truncate max-w-[130px]">
              {dailyStoreGoal ? `Desde ${formatDateBR(dailyStoreGoal.startDate)}` : 'Sem vigência'}
            </span>
            <div className="flex items-center gap-2">
              {dailyStoreGoal ? (
                <>
                  <button
                    onClick={() => handleOpenEdit(dailyStoreGoal)}
                    className="text-primary font-bold hover:underline inline-flex items-center gap-0.5"
                    title="Editar meta diária atual"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    Editar
                  </button>
                  <button
                    onClick={() => setGoalToDelete(dailyStoreGoal)}
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition-colors"
                    title="Excluir meta diária"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleOpenCreate('DAILY_STORE', 60)}
                  className="text-primary font-bold hover:underline"
                >
                  + Definir
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card: Meta Mensal Drogaria */}
        <div className="bg-surface-container-lowest rounded-xl border border-secondary/20 shadow-subtle p-5 flex flex-col justify-between transition-all hover:border-secondary/40">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-secondary uppercase tracking-wider">Meta Mensal Drogaria</span>
              <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">calendar_month</span>
              </div>
            </div>
            <div className="my-3">
              {monthlyStoreGoal ? (
                <>
                  <span className="text-3xl font-extrabold text-on-surface">
                    {monthlyStoreGoal.targetValue}
                  </span>
                  <span className="text-xs text-outline ml-1.5 font-semibold">apoios/mês</span>
                </>
              ) : (
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-on-surface-variant">Não cadastrada</span>
                  <span className="text-[11px] text-outline">Padrão do sistema: 1200 apoios</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20 text-[11px]">
            <span className="text-outline truncate max-w-[130px]">
              {monthlyStoreGoal ? `Desde ${formatDateBR(monthlyStoreGoal.startDate)}` : 'Sem vigência'}
            </span>
            <div className="flex items-center gap-2">
              {monthlyStoreGoal ? (
                <>
                  <button
                    onClick={() => handleOpenEdit(monthlyStoreGoal)}
                    className="text-secondary font-bold hover:underline inline-flex items-center gap-0.5"
                    title="Editar meta mensal atual"
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                    Editar
                  </button>
                  <button
                    onClick={() => setGoalToDelete(monthlyStoreGoal)}
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition-colors"
                    title="Excluir meta mensal"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleOpenCreate('MONTHLY_STORE', 1200)}
                  className="text-secondary font-bold hover:underline"
                >
                  + Definir
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Card: Metas Individuais (Atalhos) */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5 flex flex-col justify-between transition-all hover:border-outline-variant/60">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Metas Individuais</span>
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-[20px]">groups</span>
              </div>
            </div>
            <div className="my-3">
              <span className="text-3xl font-extrabold text-on-surface">
                {attendantActiveGoalsCount}
              </span>
              <span className="text-xs text-outline ml-1.5 font-semibold">atendentes com meta ativa</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20 text-[11px]">
            <span className="text-outline">Personalizadas</span>
            <button
              onClick={() => handleOpenCreate('DAILY_ATTENDANT', 10)}
              className="text-primary font-bold hover:underline inline-flex items-center gap-0.5"
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              Criar
            </button>
          </div>
        </div>

        {/* Card: Histórico & Versionamento */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5 flex flex-col justify-between transition-all hover:border-outline-variant/60">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Histórico Versionado</span>
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-[20px]">history</span>
              </div>
            </div>
            <div className="my-3">
              <span className="text-3xl font-extrabold text-on-surface">{historyGoals.length}</span>
              <span className="text-xs text-outline ml-1.5 font-semibold">versões anteriores</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20 text-[11px] text-outline">
            <span>Total cadastrado: {goals.length}</span>
            <button
              onClick={() => setCurrentTab('HISTORY')}
              className="text-on-surface-variant font-bold hover:underline"
            >
              Ver Todas
            </button>
          </div>
        </div>
      </div>

      {/* Painel Principal de Metas: Filtros, Busca e Tabela */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden flex flex-col">
        {/* Barra Superior da Tabela: Título e Controles */}
        <div className="p-4 sm:p-5 border-b border-outline-variant/30 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-surface-container-low/30">
          <div>
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">flag</span>
              Gestão e Histórico de Metas
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Edite valores, vigências ou exclua registros para refazer metas operacionais
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Campo de Busca Rápida */}
            <div className="relative w-full sm:w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar meta ou atendente..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface border border-outline-variant/60 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Abas de Filtragem Rápida */}
        <div className="px-5 py-2.5 border-b border-outline-variant/20 bg-surface flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setCurrentTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              currentTab === 'ALL'
                ? 'bg-primary/10 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span>Todas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-container font-bold">
              {goals.length}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('ACTIVE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              currentTab === 'ACTIVE'
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span>Ativas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
              {activeGoals.length}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('HISTORY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              currentTab === 'HISTORY'
                ? 'bg-surface-container-high text-on-surface'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span>Encerradas</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-surface-container font-bold">
              {historyGoals.length}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('STORE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              currentTab === 'STORE'
                ? 'bg-primary/10 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span>Drogaria</span>
          </button>

          <button
            onClick={() => setCurrentTab('ATTENDANT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              currentTab === 'ATTENDANT'
                ? 'bg-primary/10 text-primary'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span>Por Atendente</span>
          </button>
        </div>

        {/* Tabela de Dados */}
        {filteredGoals.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title={searchQuery ? 'Nenhum resultado para a busca' : 'Nenhuma meta encontrada'}
              description={
                searchQuery
                  ? `Não encontramos registros para "${searchQuery}". Tente outro termo.`
                  : goals.length === 0
                  ? 'Você ainda não possui metas cadastradas ou todas foram excluídas para refazer. Clique abaixo para cadastrar.'
                  : 'Nenhuma meta atende ao filtro selecionado.'
              }
              icon="flag"
              actionLabel={goals.length === 0 ? 'Cadastrar Primeira Meta' : undefined}
              onAction={goals.length === 0 ? () => handleOpenCreate('DAILY_STORE', 60) : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
                <tr>
                  <th className="px-5 py-3.5">Tipo da Meta / Destinatário</th>
                  <th className="px-5 py-3.5 text-right">Meta (Alvo)</th>
                  <th className="px-5 py-3.5">Início Vigência</th>
                  <th className="px-5 py-3.5">Fim Vigência</th>
                  <th className="px-5 py-3.5 text-center">Status</th>
                  <th className="px-5 py-3.5">Registrado Em</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
                {filteredGoals.map((g) => {
                  const isStore = g.type === 'DAILY_STORE' || g.type === 'MONTHLY_STORE';
                  return (
                    <tr
                      key={g.id}
                      className="hover:bg-surface-container-low/50 transition-colors group"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isStore ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">
                              {isStore ? 'store' : 'person'}
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-on-surface block">
                              {formatGoalTypeName(g.type, g.attendantId)}
                            </span>
                            <span className="text-[10px] text-outline">
                              {g.type === 'DAILY_STORE' && 'Meta Diária Geral'}
                              {g.type === 'MONTHLY_STORE' && 'Meta Mensal Geral'}
                              {g.type === 'DAILY_ATTENDANT' && 'Meta Diária Individual'}
                              {g.type === 'MONTHLY_ATTENDANT' && 'Meta Mensal Individual'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-extrabold text-sm text-primary">
                        {g.targetValue}{' '}
                        <span className="text-[10px] font-normal text-outline">apoios</span>
                      </td>
                      <td className="px-5 py-3.5">{formatDateBR(g.startDate)}</td>
                      <td className="px-5 py-3.5 text-outline">
                        {g.endDate ? (
                          formatDateBR(g.endDate)
                        ) : (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[10px] font-semibold">
                            Vigente (Atual)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {g.active ? (
                          <Badge variant="success" icon="check_circle">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="neutral" icon="history">
                            Encerrada
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-outline text-[11px]">
                        {formatDateTimeBR(g.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(g)}
                            className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                            title="Editar esta meta"
                            aria-label="Editar esta meta"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            onClick={() => setGoalToDelete(g)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                            title="Excluir esta meta"
                            aria-label="Excluir esta meta"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé da tabela com sumário */}
        {filteredGoals.length > 0 && (
          <div className="px-5 py-3 border-t border-outline-variant/20 bg-surface-container-low/20 flex items-center justify-between text-xs text-outline">
            <span>
              Exibindo <strong>{filteredGoals.length}</strong> de <strong>{goals.length}</strong> registro(s)
            </span>
            <span>Alterações e exclusões são auditadas e preservam integridade histórica</span>
          </div>
        )}
      </div>

      {/* Modal de Criação ou Edição de Meta */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingGoal(null);
          }}
          title={editingGoal ? 'Editar Meta Operacional' : 'Configurar Nova Meta'}
          subtitle={
            editingGoal
              ? 'Atualize o valor, período de vigência ou status desta meta. As alterações são sincronizadas e auditadas.'
              : 'A definição de uma nova meta ativará a vigência e versionará a meta anterior sem apagar o histórico.'
          }
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingGoal(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveGoal}
                isLoading={isSaving}
                loadingText={editingGoal ? 'Salvando...' : 'Gravando...'}
                icon={editingGoal ? 'save' : 'check'}
              >
                {editingGoal ? 'Salvar Alterações' : 'Salvar Meta'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveGoal} className="flex flex-col gap-4 text-xs">
            <Select
              label="Tipo da Meta"
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as GoalType)}
              options={[
                { value: 'DAILY_STORE', label: 'Meta Diária da Drogaria' },
                { value: 'MONTHLY_STORE', label: 'Meta Mensal da Drogaria' },
                { value: 'DAILY_ATTENDANT', label: 'Meta Diária por Atendente' },
                { value: 'MONTHLY_ATTENDANT', label: 'Meta Mensal por Atendente' },
              ]}
              required
            />

            {(goalType === 'DAILY_ATTENDANT' || goalType === 'MONTHLY_ATTENDANT') && (
              <Select
                label="Atendente Específico"
                value={selectedAttendantId}
                onChange={(e) => setSelectedAttendantId(e.target.value)}
                options={[
                  { value: '', label: 'Selecione o atendente...' },
                  ...attendants.map((a) => ({
                    value: a.id,
                    label: `${a.name} (Cód. ${a.code})`,
                  })),
                ]}
                required
              />
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Valor Alvo (Apoios ao Tratamento) <span className="text-error">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={targetValue}
                onChange={(e) => setTargetValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Ex: 60"
                required
              />
              <span className="text-[11px] text-outline">
                Quantidade mínima planejada para o período.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Início da Vigência"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />

              <Input
                label="Fim da Vigência (Opcional)"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                helperText="Deixe em branco para meta por tempo indeterminado"
              />
            </div>

            {editingGoal && (
              <Select
                label="Status da Meta"
                value={isActive ? 'ACTIVE' : 'INACTIVE'}
                onChange={(e) => setIsActive(e.target.value === 'ACTIVE')}
                options={[
                  { value: 'ACTIVE', label: 'Ativa (Vigente para cálculos)' },
                  { value: 'INACTIVE', label: 'Encerrada (Apenas Histórico)' },
                ]}
                required
              />
            )}
          </form>
        </Modal>
      )}

      {/* Confirmação de Exclusão Individual */}
      <ConfirmDialog
        isOpen={!!goalToDelete}
        onClose={() => setGoalToDelete(null)}
        onConfirm={handleConfirmDeleteGoal}
        title="Excluir Meta Operacional"
        variant="destructive"
        confirmLabel="Sim, Excluir Meta"
        cancelLabel="Cancelar"
        isLoading={isDeleting}
        description={
          <div className="flex flex-col gap-2.5 text-xs text-on-surface-variant">
            <p>
              Tem certeza que deseja excluir esta meta? Essa ação removerá o registro do banco de dados local e da nuvem.
            </p>
            {goalToDelete && (
              <div className="p-3 bg-surface-container rounded-lg border border-outline-variant/40 flex flex-col gap-1 text-on-surface">
                <span className="font-bold text-sm">
                  {formatGoalTypeName(goalToDelete.type, goalToDelete.attendantId)}
                </span>
                <span>
                  Alvo: <strong className="text-primary">{goalToDelete.targetValue} apoios</strong>
                </span>
                <span className="text-[11px] text-outline">
                  Vigência: de {formatDateBR(goalToDelete.startDate)}{' '}
                  {goalToDelete.endDate ? `até ${formatDateBR(goalToDelete.endDate)}` : '(vigente)'}
                </span>
              </div>
            )}
          </div>
        }
      />

      {/* Confirmação de Limpar / Refazer Todas as Metas */}
      <ConfirmDialog
        isOpen={isClearAllModalOpen}
        onClose={() => setIsClearAllModalOpen(false)}
        onConfirm={handleConfirmClearAll}
        title="Refazer e Excluir Todas as Metas"
        variant="destructive"
        confirmLabel="Sim, Excluir Todas e Refazer"
        cancelLabel="Cancelar"
        isLoading={isClearingAll}
        description={
          <div className="flex flex-col gap-2.5 text-xs text-on-surface-variant">
            <p className="font-bold text-rose-700">
              Atenção: Esta ação excluirá definitivamente todas as {goals.length} meta(s) cadastradas no sistema.
            </p>
            <p>
              Esta funcionalidade foi feita para quando você desejar zerar completamente o planejamento e refazer o cadastro de metas do zero.
            </p>
            <p className="text-[11px] text-outline">
              O histórico de auditoria registrará essa limpeza com segurança.
            </p>
          </div>
        }
      />
    </div>
  );
};

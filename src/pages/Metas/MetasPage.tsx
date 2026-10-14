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
import { useToast } from '../../contexts/ToastContext';
import { CloudSyncService } from '../../services/api/cloudSyncService';

export const MetasPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);

  // Modal de Nova Meta
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [goalType, setGoalType] = useState<GoalType>('DAILY_STORE');
  const [targetValue, setTargetValue] = useState<number>(60);
  const [startDate, setStartDate] = useState<string>(getTodayISODate());
  const [selectedAttendantId, setSelectedAttendantId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

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

  const handleOpenCreate = (defaultType: GoalType = 'DAILY_STORE', defaultValue: number = 60) => {
    setGoalType(defaultType);
    setTargetValue(defaultValue);
    setStartDate(getTodayISODate());
    setSelectedAttendantId('');
    setIsModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;

    setIsSaving(true);
    try {
      await GoalService.setGoal(user, {
        type: goalType,
        targetValue,
        startDate,
        attendantId:
          goalType === 'DAILY_ATTENDANT' || goalType === 'MONTHLY_ATTENDANT'
            ? selectedAttendantId || undefined
            : undefined,
      });

      showToast('Meta configurada e salva com sucesso no banco de dados.', 'success', 'Meta Atualizada');
      setIsModalOpen(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao definir meta.';
      showToast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const formatGoalTypeName = (type: GoalType, attendantId?: string) => {
    switch (type) {
      case 'DAILY_STORE':
        return 'Meta Diária da Drogaria';
      case 'MONTHLY_STORE':
        return 'Meta Mensal da Drogaria';
      case 'DAILY_ATTENDANT':
        return `Meta Diária: ${attendantsMap.get(attendantId || '')?.name || 'Atendente'}`;
      case 'MONTHLY_ATTENDANT':
        return `Meta Mensal: ${attendantsMap.get(attendantId || '')?.name || 'Atendente'}`;
      default:
        return type;
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
          A configuração e versionamento de metas é permitida apenas para administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Metas Operacionais</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Planejamento quantitativo, metas diárias/mensais e histórico com versionamento temporal
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleOpenCreate('DAILY_STORE', 60)}
          icon="add_task"
        >
          Nova Meta
        </Button>
      </div>

      {/* Cards de Metas Vigentes Atuais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Meta Diária Drogaria */}
        <div className="bg-surface-container-lowest rounded-xl border border-primary/20 shadow-subtle p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary uppercase">Meta Diária Drogaria</span>
            <span className="material-symbols-outlined text-primary text-[20px]">store</span>
          </div>
          <div className="my-3">
            <span className="text-3xl font-extrabold text-on-surface">
              {activeGoals.find((g) => g.type === 'DAILY_STORE')?.targetValue || 60}
            </span>
            <span className="text-xs text-outline ml-1 font-semibold">apoios/dia</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-[11px] text-outline">
            <span>Vigência desde {formatDateBR(activeGoals.find((g) => g.type === 'DAILY_STORE')?.startDate || '2026-09-01')}</span>
            <button
              onClick={() => handleOpenCreate('DAILY_STORE', 60)}
              className="text-primary font-bold hover:underline"
            >
              Ajustar
            </button>
          </div>
        </div>

        {/* Meta Mensal Drogaria */}
        <div className="bg-surface-container-lowest rounded-xl border border-secondary/20 shadow-subtle p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-secondary uppercase">Meta Mensal Drogaria</span>
            <span className="material-symbols-outlined text-secondary text-[20px]">calendar_month</span>
          </div>
          <div className="my-3">
            <span className="text-3xl font-extrabold text-on-surface">
              {activeGoals.find((g) => g.type === 'MONTHLY_STORE')?.targetValue || 1200}
            </span>
            <span className="text-xs text-outline ml-1 font-semibold">apoios/mês</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-[11px] text-outline">
            <span>Vigência desde {formatDateBR(activeGoals.find((g) => g.type === 'MONTHLY_STORE')?.startDate || '2026-09-01')}</span>
            <button
              onClick={() => handleOpenCreate('MONTHLY_STORE', 1200)}
              className="text-secondary font-bold hover:underline"
            >
              Ajustar
            </button>
          </div>
        </div>

        {/* Metas Individuais (Atalho) */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface-variant uppercase">Metas Individuais</span>
            <span className="material-symbols-outlined text-outline text-[20px]">groups</span>
          </div>
          <div className="my-3">
            <span className="text-3xl font-extrabold text-on-surface">
              {activeGoals.filter((g) => g.type === 'DAILY_ATTENDANT' || g.type === 'MONTHLY_ATTENDANT').length}
            </span>
            <span className="text-xs text-outline ml-1 font-semibold">atendentes com meta</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-[11px]">
            <span className="text-outline">Personalizadas por profissional</span>
            <button
              onClick={() => handleOpenCreate('DAILY_ATTENDANT', 10)}
              className="text-primary font-bold hover:underline"
            >
              + Criar
            </button>
          </div>
        </div>

        {/* Histórico Versionado */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface-variant uppercase">Histórico Preservado</span>
            <span className="material-symbols-outlined text-outline text-[20px]">history</span>
          </div>
          <div className="my-3">
            <span className="text-3xl font-extrabold text-on-surface">{historyGoals.length}</span>
            <span className="text-xs text-outline ml-1 font-semibold">versões anteriores</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-[11px] text-outline">
            <span>Preserva cálculos históricos</span>
          </div>
        </div>
      </div>

      {/* Tabela de Histórico Temporal de Metas (Regra 43) */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/40">
          <div>
            <h3 className="font-bold text-sm text-on-surface">Histórico Cronológico de Metas</h3>
            <p className="text-xs text-on-surface-variant">
              Garante que relatórios passados utilizem a meta vigente no período correspondente
            </p>
          </div>
          <span className="text-xs font-semibold text-outline">Total: {goals.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
              <tr>
                <th className="px-5 py-3">Tipo da Meta</th>
                <th className="px-5 py-3 text-right">Meta (Alvo)</th>
                <th className="px-5 py-3">Início Vigência</th>
                <th className="px-5 py-3">Fim Vigência</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Registrado Em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
              {goals.map((g) => (
                <tr key={g.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="px-5 py-3 font-bold text-on-surface">
                    {formatGoalTypeName(g.type, g.attendantId)}
                  </td>
                  <td className="px-5 py-3 text-right font-extrabold text-sm text-primary">
                    {g.targetValue}
                  </td>
                  <td className="px-5 py-3">{formatDateBR(g.startDate)}</td>
                  <td className="px-5 py-3 text-outline">
                    {g.endDate ? formatDateBR(g.endDate) : 'Vigente (Atual)'}
                  </td>
                  <td className="px-5 py-3">
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
                  <td className="px-5 py-3 text-outline text-[11px]">
                    {formatDateTimeBR(g.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nova Meta */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Configurar Meta"
          subtitle="A definição de uma nova meta encerrará a vigência da anterior sem apagar o histórico."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveGoal}
                isLoading={isSaving}
                loadingText="Gravando..."
              >
                Salvar Meta
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
                Valor Alvo (Apoios) <span className="text-error">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={targetValue}
                onChange={(e) => setTargetValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full h-10 px-3 rounded-lg bg-surface-container-lowest border border-outline-variant text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <Input
              label="Data de Início da Vigência"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </form>
        </Modal>
      )}
    </div>
  );
};

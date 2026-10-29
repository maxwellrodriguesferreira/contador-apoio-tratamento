import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SupportService } from '../../services/supports/supportService';
import { RoutineService } from '../../services/routine/routineService';
import { AttendantService } from '../../services/attendants/attendantService';
import { GoalService } from '../../services/goals/goalService';
import { AIService } from '../../services/ai/aiService';
import { SettingsService } from '../../services/settings/settingsService';
import { CloudSyncService } from '../../services/api/cloudSyncService';
import {
  calculateDashboardMetrics,
  calculateAttendantsPerformance,
  calculateConsolidatedMetrics,
  calculateConsolidatedAttendantsPerformance,
  calculateTeamServicesTotal,
  calculateDailyServicesEvolution,
  formatDateBR,
  formatDateTimeBR,
  getTodayISODate,
} from '../../utils/calculations';
import {
  AIAnalysis,
  TreatmentSupport,
  RoutineCare,
  Attendant,
  Goal,
  RankingSortMode,
} from '../../types';
import { StatCard } from '../../components/common/StatCard';
import { Button } from '../../components/common/Button';
import { useToast } from '../../contexts/ToastContext';
import { AIExecutiveReportCard } from '../../components/dashboard/AIExecutiveReportCard';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DashboardPageProps {
  onNavigate: (path: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [selectedDate, setSelectedDate] = useState<string>(getTodayISODate());
  const [supports, setSupports] = useState<TreatmentSupport[]>([]);
  const [routines, setRoutines] = useState<RoutineCare[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [rankingSortMode, setRankingSortMode] = useState<RankingSortMode>('TOTAL');
  
  // IA State
  const [dailyAnalysis, setDailyAnalysis] = useState<AIAnalysis | null>(null);
  const [monthlyAnalysis, setMonthlyAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoadingDailyAI, setIsLoadingDailyAI] = useState(false);
  const [isLoadingMonthlyAI, setIsLoadingMonthlyAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(() => {
    const s = SupportService.getAll(false);
    const r = RoutineService.getAll(false);
    const a = AttendantService.getAll();
    const g = GoalService.getAll();
    setSupports(s);
    setRoutines(r);
    setAttendants(a);
    setGoals(g);
  }, []);

  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      await CloudSyncService.syncAllFromCloud();
      loadData();
      showToast('Dados sincronizados e atualizados com sucesso.', 'success', 'Sincronização Concluída');
    } catch (err: unknown) {
      loadData();
      const msg = err instanceof Error ? err.message : 'Falha ao sincronizar com o banco.';
      showToast(msg, 'warning', 'Sincronização Offline');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = CloudSyncService.subscribe(loadData);
    return unsubscribe;
  }, [loadData]);

  // Cálculos de Apoio ao Tratamento (Mantém regras e metas originais)
  const metrics = useMemo(
    () => calculateDashboardMetrics(supports, attendants, goals, selectedDate),
    [supports, attendants, goals, selectedDate]
  );

  const attendantsPerformance = useMemo(
    () => calculateAttendantsPerformance(supports, attendants, selectedDate),
    [supports, attendants, selectedDate]
  );

  // Cálculos Consolidados: Total Geral = Apoio ao Tratamento + Na Rotina
  const consolidatedMetrics = useMemo(
    () => calculateConsolidatedMetrics(supports, routines, selectedDate),
    [supports, routines, selectedDate]
  );

  const consolidatedAttendantsPerformance = useMemo(
    () =>
      calculateConsolidatedAttendantsPerformance(
        supports,
        routines,
        attendants,
        selectedDate,
        rankingSortMode
      ),
    [supports, routines, attendants, selectedDate, rankingSortMode]
  );

  const teamTotal = useMemo(
    () => calculateTeamServicesTotal(consolidatedAttendantsPerformance),
    [consolidatedAttendantsPerformance]
  );

  const appSettings = useMemo(() => SettingsService.getAppSettings(), []);


  // Dados para Gráfico de Evolução Diária (separando Apoio ao Tratamento, Na Rotina e Total Geral)
  const dailyEvolutionChartData = useMemo(() => {
    return calculateDailyServicesEvolution(supports, routines, selectedDate, metrics.todayGoal);
  }, [supports, routines, selectedDate, metrics.todayGoal]);

  // Dados para Gráfico de Apoios por Atendente
  const attendantsChartData = useMemo(() => {
    return attendantsPerformance.map((ap) => ({
      nome: ap.attendantName.split(' ')[0], // Primeiro nome para legibilidade
      nomeCompleto: ap.attendantName,
      hoje: ap.todayQuantity,
      mes: ap.monthQuantity,
      codigo: ap.attendantCode,
    }));
  }, [attendantsPerformance]);

  // Carregar análises de IA
  const handleGenerateDailyAI = async (force: boolean = false) => {
    if (!user) return;
    setIsLoadingDailyAI(true);
    setAiError(null);
    try {
      const result = await AIService.generateDailyAnalysis(user, selectedDate, force);
      setDailyAnalysis(result);
      if (force) {
        showToast('Nova Análise Diária gerada pelo Google Gemini.', 'success', 'IA Atualizada');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na IA';
      setAiError(msg);
      showToast(msg, 'warning', 'Aviso de IA');
    } finally {
      setIsLoadingDailyAI(false);
    }
  };

  const handleGenerateMonthlyAI = async (force: boolean = false) => {
    if (!user) return;
    setIsLoadingMonthlyAI(true);
    setAiError(null);
    try {
      const result = await AIService.generateMonthlyAnalysis(user, selectedDate, force);
      setMonthlyAnalysis(result);
      if (force) {
        showToast('Nova Análise Mensal consolidada com Gemini.', 'success', 'IA Atualizada');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na IA';
      setAiError(msg);
      showToast(msg, 'warning', 'Aviso de IA');
    } finally {
      setIsLoadingMonthlyAI(false);
    }
  };

  useEffect(() => {
    handleGenerateDailyAI(false);
    handleGenerateMonthlyAI(false);
  }, [selectedDate]);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Executive Welcome & Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-on-surface-variant text-xs font-semibold uppercase tracking-wider">
            <span>Monitoramento Clínico &amp; Operacional</span>
            <span>•</span>
            <span className="text-tertiary-container font-bold">Ciclo Ativo 2026.09</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <h1 className="text-2xl lg:text-3xl font-extrabold text-on-surface tracking-tight">
              Olá, {user?.name}
            </h1>
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                isAdmin ? 'bg-primary-container text-on-primary' : 'bg-secondary-fixed text-on-secondary-fixed'
              }`}
            >
              {user?.role}
            </span>
          </div>
          <p className="text-sm text-on-surface-variant mt-1">
            Visão executiva da volumetria, ritmo de adesão e projeções mensais em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Período */}
          <div className="flex items-center bg-surface-container rounded-lg p-1 shadow-sm border border-outline-variant/30">
            <button
              onClick={() => setSelectedDate(getTodayISODate())}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedDate === getTodayISODate()
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>
              <span>Hoje: {formatDateBR(getTodayISODate())}</span>
            </button>
          </div>

          {/* Botão de Atualizar Dados */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshData}
            isLoading={isRefreshing}
            loadingText="Atualizando..."
            icon="sync"
            className="hover:text-primary"
          >
            Atualizar Dados
          </Button>

          {/* Ações Primárias para ADMIN */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => onNavigate('registrar-apoio')}
                icon="health_and_safety"
              >
                Novo Apoio
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate('registrar-rotina')}
                icon="assignment_turned_in"
              >
                Novo Na Rotina
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Totalizador Geral de Serviços Farmacêuticos (Regra Consolidada) */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-subtle p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-outline-variant/20 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">hub</span>
            </div>
            <div>
              <h2 className="font-bold text-sm text-on-surface">Totalizador Geral de Serviços Farmacêuticos</h2>
              <p className="text-xs text-on-surface-variant">
                Indicadores consolidados da equipe: Apoio ao Tratamento + Na Rotina
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-[11px] font-bold text-outline">
            <span className="text-primary">APOIO AO TRATAMENTO</span>
            <span>+</span>
            <span className="text-secondary">NA ROTINA</span>
            <span>=</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">TOTAL GERAL</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Apoio ao Tratamento */}
          <div className="p-4 rounded-xl bg-surface-container-low border border-primary/20 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[18px]">health_and_safety</span>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface block">Apoio ao Tratamento</span>
                  <span className="text-[10px] text-on-surface-variant">Contador individual</span>
                </div>
              </div>
              <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">Possui Metas</span>
            </div>
            <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-outline-variant/20">
              <div>
                <span className="text-2xl font-extrabold text-on-surface">{consolidatedMetrics.todayTreatmentSupport}</span>
                <span className="text-xs text-on-surface-variant ml-1 font-medium">hoje</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-primary">{consolidatedMetrics.monthTreatmentSupport}</span>
                <span className="text-xs text-on-surface-variant ml-1 font-medium">no mês</span>
              </div>
            </div>
          </div>

          {/* Card 2: Na Rotina */}
          <div className="p-4 rounded-xl bg-surface-container-low border border-secondary/20 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-secondary text-on-secondary flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-on-surface block">Na Rotina</span>
                  <span className="text-[10px] text-on-surface-variant">Contador individual</span>
                </div>
              </div>
              <span className="text-[10px] bg-secondary/15 text-secondary font-bold px-2 py-0.5 rounded-full">Sem Meta Obrigatória</span>
            </div>
            <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-outline-variant/20">
              <div>
                <span className="text-2xl font-extrabold text-on-surface">{consolidatedMetrics.todayRoutineCare}</span>
                <span className="text-xs text-on-surface-variant ml-1 font-medium">hoje</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-secondary">{consolidatedMetrics.monthRoutineCare}</span>
                <span className="text-xs text-on-surface-variant ml-1 font-medium">no mês</span>
              </div>
            </div>
          </div>

          {/* Card 3: Total Geral de Serviços */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-surface-container-low to-surface-container-low border-2 border-emerald-500/40 dark:border-emerald-500/30 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[18px]">functions</span>
                </div>
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-950 dark:text-emerald-300 block">Total Geral de Serviços</span>
                  <span className="text-[10px] text-emerald-800 dark:text-emerald-400">Apoio + Na Rotina</span>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-extrabold px-2 py-0.5 rounded-full border border-emerald-200/50 dark:border-emerald-800/40">Consolidado</span>
            </div>
            <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-emerald-500/20">
              <div>
                <span className="text-2xl font-extrabold text-emerald-950 dark:text-emerald-200">{consolidatedMetrics.todayTotalServices}</span>
                <span className="text-xs text-emerald-800 dark:text-emerald-400 ml-1 font-medium">hoje ({consolidatedMetrics.todayTreatmentSupport} + {consolidatedMetrics.todayRoutineCare})</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{consolidatedMetrics.monthTotalServices}</span>
                <span className="text-xs text-emerald-800 dark:text-emerald-400 ml-1 font-medium">no mês ({consolidatedMetrics.monthTreatmentSupport} + {consolidatedMetrics.monthRoutineCare})</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de 6 StatCards Operacionais de Apoio ao Tratamento */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-4">
        {/* 1. Apoios Hoje */}
        <StatCard
          label="Apoios Hoje"
          value={metrics.todayTotal}
          icon="task_alt"
          iconBgColor="bg-surface-container-low"
          iconColor="text-primary"
          trendText={metrics.todayGoal > 0 ? `${metrics.todayPercentage}%` : '0%'}
          trendVariant={metrics.todayGoal > 0 && metrics.todayPercentage >= 100 ? 'success' : 'neutral'}
          footerLabel={metrics.todayGoal > 0 ? `Meta: ${metrics.todayGoal}` : 'Meta: 0'}
          footerValue={
            metrics.todayGoal > 0
              ? metrics.todayDifference >= 0
                ? `+${metrics.todayDifference}`
                : `${metrics.todayDifference}`
              : '-'
          }
          progressPercentage={metrics.todayGoal > 0 ? metrics.todayPercentage : 0}
          progressBarColor={metrics.todayPercentage >= 100 ? 'bg-emerald-600' : 'bg-primary'}
        />

        {/* 2. Apoios no Mês */}
        <StatCard
          label="Apoios no Mês"
          value={metrics.monthTotal}
          icon="calendar_month"
          iconBgColor="bg-secondary-fixed"
          iconColor="text-on-secondary-fixed"
          trendText={metrics.monthGoal > 0 ? `${metrics.monthPercentage}%` : '0%'}
          trendVariant={metrics.monthGoal > 0 ? 'secondary' : 'neutral'}
          footerLabel={metrics.monthGoal > 0 ? 'Meta Mensal' : 'Meta Mensal: 0'}
          footerValue={metrics.monthGoal > 0 ? `${metrics.monthGoal}` : '-'}
          progressPercentage={metrics.monthGoal > 0 ? metrics.monthPercentage : 0}
          progressBarColor="bg-secondary"
        />

        {/* 3. Meta Diária */}
        <StatCard
          label="Meta Diária"
          value={metrics.todayGoal}
          icon="flag"
          iconBgColor="bg-surface-container-low"
          iconColor="text-tertiary-container"
          trendText={
            metrics.todayGoal > 0
              ? metrics.todayDifference >= 0
                ? 'Atingida'
                : 'Em Curso'
              : 'Zerada'
          }
          trendVariant={metrics.todayGoal > 0 ? (metrics.todayDifference >= 0 ? 'success' : 'warning') : 'neutral'}
          footerLabel="Atendentes Ativos"
          footerValue={`${metrics.activeAttendantsCount}`}
        />

        {/* 4. Meta Mensal */}
        <StatCard
          label="Meta Mensal"
          value={metrics.monthGoal}
          icon="track_changes"
          iconBgColor="bg-surface-container-low"
          iconColor="text-primary"
          trendText={metrics.monthGoal > 0 ? `Faltam ${metrics.monthRemainingValue}` : 'Zerada'}
          trendVariant={metrics.monthGoal > 0 && metrics.monthRemainingValue === 0 ? 'success' : 'neutral'}
          footerLabel="Dias Restantes"
          footerValue={`${metrics.monthRemainingDays} dias`}
        />

        {/* 5. Média Diária */}
        <StatCard
          label="Média Diária"
          value={metrics.monthDailyAverage}
          icon="analytics"
          iconBgColor="bg-surface-container-low"
          iconColor="text-secondary"
          trendText="apoios/dia"
          trendVariant="neutral"
          footerLabel="Ritmo Necessário"
          footerValue={metrics.monthGoal > 0 ? `${metrics.monthRequiredPace}/dia` : '-'}
        />

        {/* 6. Projeção Mensal */}
        <StatCard
          label="Projeção Mensal"
          value={metrics.monthProjection}
          icon="trending_up"
          iconBgColor="bg-emerald-100"
          iconColor="text-emerald-700"
          trendText={metrics.monthProjection >= metrics.monthGoal ? 'Supera Meta' : 'Abaixo'}
          trendVariant={metrics.monthProjection >= metrics.monthGoal ? 'success' : 'warning'}
          footerLabel="Previsão ao ritmo atual"
          footerValue={`${metrics.monthProjection} apoios`}
          progressPercentage={calculateDashboardMetrics(supports, attendants, goals).monthPercentage}
          progressBarColor="bg-emerald-600"
        />
      </div>

      {/* Seção Inteligência Artificial Executiva (Diária e Mensal) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AIExecutiveReportCard
          title="Parecer Executivo do Dia"
          type="daily"
          analysis={dailyAnalysis}
          isLoading={isLoadingDailyAI}
          isAdmin={isAdmin}
          error={aiError}
          onRefresh={() => handleGenerateDailyAI(true)}
          metricsSummary={{
            percentage: metrics.todayPercentage,
            realizedText: `${metrics.todayTotal}`,
            goalText: `${metrics.todayGoal}`,
            secondaryMetricLabel: 'Média / Atendente',
            secondaryMetricValue: `${metrics.todayAveragePerAttendant}`,
          }}
        />

        <AIExecutiveReportCard
          title="Parecer Estratégico do Mês"
          type="monthly"
          analysis={monthlyAnalysis}
          isLoading={isLoadingMonthlyAI}
          isAdmin={isAdmin}
          error={aiError}
          onRefresh={() => handleGenerateMonthlyAI(true)}
          metricsSummary={{
            percentage: metrics.monthPercentage,
            realizedText: `${metrics.monthTotal}`,
            goalText: `${metrics.monthGoal}`,
            secondaryMetricLabel: 'Projeção Final',
            secondaryMetricValue: `${metrics.monthProjection} apoios`,
          }}
        />
      </div>

      {/* Gráficos em Linha e Barras */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Evolução Diária no Mês (Separando Apoio e Na Rotina) */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
            <div>
              <h3 className="font-bold text-base text-on-surface">Evolução Diária de Apoios e Na Rotina</h3>
              <p className="text-xs text-on-surface-variant">
                Comparativo diário entre Apoio ao Tratamento, Na Rotina e meta diária ({metrics.todayGoal})
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb] inline-block shadow-sm"></span>
                Apoio: {consolidatedMetrics.todayTreatmentSupport}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/50 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#9333ea] inline-block shadow-sm"></span>
                Rotina: {consolidatedMetrics.todayRoutineCare}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#059669] inline-block shadow-sm"></span>
                Total: {consolidatedMetrics.todayTotalServices}
              </span>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyEvolutionChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                <XAxis dataKey="dia" stroke="#757682" fontSize={11} />
                <YAxis stroke="#757682" fontSize={11} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value} ${name.includes('Meta') ? 'apoios (meta)' : 'registros'}`,
                    name,
                  ]}
                  contentStyle={{
                    backgroundColor: 'rgb(var(--color-surface-container-lowest))',
                    borderRadius: '8px',
                    borderColor: 'rgb(var(--color-outline-variant))',
                    color: 'rgb(var(--color-on-surface))',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  itemStyle={{ color: 'rgb(var(--color-on-surface))' }}
                  labelStyle={{ color: 'rgb(var(--color-on-surface))', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Line
                  type="monotone"
                  dataKey="apoios"
                  name="Apoio ao Tratamento"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ r: 3.5, fill: '#2563eb', strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 6, fill: '#2563eb' }}
                />
                <Line
                  type="monotone"
                  dataKey="rotinas"
                  name="Na Rotina"
                  stroke="#9333ea"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#9333ea', strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 6, fill: '#9333ea' }}
                />
                <Line
                  type="monotone"
                  dataKey="totalGeral"
                  name="Total Geral (Apoio + Rotina)"
                  stroke="#059669"
                  strokeWidth={2.5}
                  strokeDasharray="4 2"
                  dot={{ r: 3, fill: '#059669', strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 6, fill: '#059669' }}
                />
                <Line
                  type="monotone"
                  dataKey="meta"
                  name="Meta Diária Fixa (Apoio)"
                  stroke="#ea580c"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Apoios por Atendente */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-on-surface">Apoios por Atendente</h3>
              <p className="text-xs text-on-surface-variant">
                Volume acumulado no mês por atendente cadastrado
              </p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendantsChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="nome" stroke="#757682" fontSize={11} />
                <YAxis stroke="#757682" fontSize={11} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value} apoios`,
                    name === 'mes' ? 'Total no Mês' : 'Hoje',
                  ]}
                  contentStyle={{
                    backgroundColor: 'rgb(var(--color-surface-container-lowest))',
                    borderRadius: '8px',
                    borderColor: 'rgb(var(--color-outline-variant))',
                    color: 'rgb(var(--color-on-surface))',
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                  itemStyle={{ color: 'rgb(var(--color-on-surface))' }}
                  labelStyle={{ color: 'rgb(var(--color-on-surface))', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="mes" name="Total no Mês" fill="#006398" radius={[4, 4, 0, 0]} />
                <Bar dataKey="hoje" name="Hoje" fill="#5bb8fe" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Ranking e Tabela Consolidada de Desempenho dos Atendentes */}
      {(isAdmin || appSettings.allowAttendantViewIndividualPerformance) && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-low/30">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">leaderboard</span>
                <h3 className="font-bold text-sm text-on-surface">Ranking Consolidado de Atendentes</h3>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Desempenho individual em Apoio ao Tratamento, Na Rotina e Total Geral de Serviços
              </p>
            </div>

            {/* Controles de Ordenação do Ranking */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-outline">Ordenar por:</span>
              <div className="inline-flex rounded-lg border border-outline-variant/40 bg-surface-container-low p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setRankingSortMode('TOTAL')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    rankingSortMode === 'TOTAL'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Ordenar por Total Geral Consolidado"
                >
                  Total Geral
                </button>
                <button
                  type="button"
                  onClick={() => setRankingSortMode('SUPPORT')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    rankingSortMode === 'SUPPORT'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Consultar resultados de Apoio ao Tratamento"
                >
                  Apoio ao Tratamento
                </button>
                <button
                  type="button"
                  onClick={() => setRankingSortMode('ROUTINE')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    rankingSortMode === 'ROUTINE'
                      ? 'bg-secondary text-on-secondary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Consultar resultados de Na Rotina"
                >
                  Na Rotina
                </button>
              </div>
            </div>
          </div>

          {/* Barra explicativa da regra de negócio e formato dos valores */}
          <div className="px-5 py-2.5 bg-surface-container-low/70 border-b border-outline-variant/20 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-on-surface-variant flex-wrap">
              <span className="material-symbols-outlined text-[16px] text-emerald-700">calculate</span>
              <span className="font-bold text-on-surface">Fórmula do Totalizador:</span>
              <span className="inline-flex items-center gap-1 font-semibold text-primary">
                Apoio ao Tratamento
              </span>
              <span className="text-outline font-bold">+</span>
              <span className="inline-flex items-center gap-1 font-semibold text-secondary">
                Na Rotina
              </span>
              <span className="text-outline font-bold">=</span>
              <span className="inline-flex items-center gap-1 font-extrabold text-emerald-700">
                Total Geral de Serviços
              </span>
            </div>
            <div className="text-[11px] text-outline">
              Valores exibidos: <strong className="text-on-surface">Acumulado no Mês</strong> (<span className="text-outline">hoje</span>)
            </div>
          </div>

          {/* Visualização em Cards para Dispositivos Móveis (Celulares) */}
          <div className="md:hidden p-3 space-y-3">
            {consolidatedAttendantsPerformance.length === 0 ? (
              <div className="p-6 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[32px] text-outline mb-1">
                  person_off
                </span>
                <p className="font-semibold text-xs text-on-surface">Nenhum atendente cadastrado ainda</p>
                <p className="text-[11px] text-outline mt-0.5">
                  Acesse o menu Atendentes para cadastrar os profissionais da drogaria.
                </p>
              </div>
            ) : (
              <>
                {consolidatedAttendantsPerformance.map((item) => (
                  <div
                    key={item.attendantId}
                    className={`p-3.5 rounded-xl border transition-all ${
                      user?.attendantId === item.attendantId
                        ? 'bg-primary/5 border-primary/40 shadow-sm'
                        : 'bg-surface-container-lowest border-outline-variant/30'
                    }`}
                  >
                    {/* Topo do Card: Posição, Nome e Status */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-outline-variant/20">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                            item.position === 1
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-xs'
                              : item.position === 2
                              ? 'bg-slate-200 text-slate-800'
                              : item.position === 3
                              ? 'bg-amber-700/20 text-amber-900'
                              : 'bg-surface-container text-outline'
                          }`}
                        >
                          {item.position}º
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-on-surface leading-tight">
                              {item.attendantName}
                            </span>
                            {user?.attendantId === item.attendantId && (
                              <span className="px-1.5 py-0.2 rounded bg-primary text-on-primary text-[9px] font-bold">
                                Você
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-outline font-mono">Cód. {item.attendantCode}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {item.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>

                    {/* Grade de 3 Métricas: Apoio, Na Rotina e Total Geral */}
                    <div className="grid grid-cols-3 gap-2 py-1 text-center">
                      {/* Apoio */}
                      <div className="p-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/40">
                        <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 block">
                          Apoio
                        </span>
                        <span className="text-base font-extrabold text-blue-700 dark:text-blue-300">
                          {item.treatmentSupportMonth}
                        </span>
                        <span className="text-[9px] text-blue-600/80 dark:text-blue-400 block">
                          ({item.treatmentSupportToday} hoje)
                        </span>
                      </div>

                      {/* Na Rotina */}
                      <div className="p-2 rounded-lg bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/40">
                        <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 block">
                          Na Rotina
                        </span>
                        <span className="text-base font-extrabold text-purple-700 dark:text-purple-300">
                          {item.routineCareMonth}
                        </span>
                        <span className="text-[9px] text-purple-600/80 dark:text-purple-400 block">
                          ({item.routineCareToday} hoje)
                        </span>
                      </div>

                      {/* Total Geral */}
                      <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/60 dark:border-emerald-800/60">
                        <span className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300 block">
                          Total Geral
                        </span>
                        <span className="text-base font-black text-emerald-800 dark:text-emerald-200">
                          {item.totalServicesMonth}
                        </span>
                        <span className="text-[9px] text-emerald-700/80 dark:text-emerald-400 block font-semibold">
                          ({item.totalServicesToday} hoje)
                        </span>
                      </div>
                    </div>

                    {/* Barra de Participação */}
                    <div className="mt-2.5 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[11px]">
                      <span className="text-outline">Participação na Equipe:</span>
                      <span className="font-extrabold text-on-surface bg-surface-container px-2 py-0.5 rounded text-[10px]">
                        {item.percentageOfMonth}%
                      </span>
                    </div>
                  </div>
                ))}

                {/* Total da Equipe Mobile */}
                <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-500/10 via-surface-container-low to-surface-container-low border-2 border-emerald-500/40 shadow-sm">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-500/20">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-emerald-700">groups</span>
                      <span className="font-extrabold text-xs text-emerald-950 dark:text-emerald-200 uppercase tracking-wider">
                        Total da Equipe
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-extrabold text-[10px]">
                      100%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <span className="text-[10px] font-bold text-primary block">Apoio</span>
                      <span className="text-base font-bold text-primary">{teamTotal.treatmentSupportMonth}</span>
                      <span className="text-[9px] text-outline block">({teamTotal.treatmentSupportToday} hoje)</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-secondary block">Na Rotina</span>
                      <span className="text-base font-bold text-secondary">{teamTotal.routineCareMonth}</span>
                      <span className="text-[9px] text-outline block">({teamTotal.routineCareToday} hoje)</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300 block">Total Geral</span>
                      <span className="text-base font-black text-emerald-800 dark:text-emerald-200">{teamTotal.totalServicesMonth}</span>
                      <span className="text-[9px] text-emerald-700 dark:text-emerald-400 block font-semibold">({teamTotal.totalServicesToday} hoje)</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Tabela Completa para Tablets e Desktops (md: e superior) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
                <tr>
                  <th className="px-4 py-3 text-center w-12">Pos.</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Atendente</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-primary font-bold">Apoio</span>
                    <span className="text-[10px] text-outline block normal-case font-normal">Mês / (Hoje)</span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-secondary font-bold">Na Rotina</span>
                    <span className="text-[10px] text-outline block normal-case font-normal">Mês / (Hoje)</span>
                  </th>
                  <th className="px-4 py-3 text-right bg-emerald-500/5">
                    <span className="text-emerald-800 font-extrabold flex items-center justify-end gap-1">
                      <span>Total Geral</span>
                      <span className="material-symbols-outlined text-[14px] text-emerald-600" title="Apoio ao Tratamento + Na Rotina">functions</span>
                    </span>
                    <span className="text-[10px] text-emerald-700 font-bold block normal-case">Apoio + Rotina</span>
                  </th>
                  <th className="px-4 py-3 text-right">Participação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
                {consolidatedAttendantsPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-on-surface-variant">
                      <div className="flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-[28px] text-outline mb-1">
                          person_off
                        </span>
                        <p className="font-semibold text-xs text-on-surface">Nenhum atendente cadastrado ainda</p>
                        <p className="text-[11px] text-outline mt-0.5">
                          Acesse o menu Atendentes para cadastrar os profissionais da drogaria.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  consolidatedAttendantsPerformance.map((item) => (
                    <tr
                      key={item.attendantId}
                      className={`hover:bg-surface-container-low/50 transition-colors ${
                        user?.attendantId === item.attendantId ? 'bg-primary/5 font-bold' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            item.position === 1
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : item.position === 2
                              ? 'bg-slate-200 text-slate-700'
                              : item.position === 3
                              ? 'bg-amber-700/20 text-amber-900'
                              : 'text-outline'
                          }`}
                        >
                          {item.position}º
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-outline">{item.attendantCode}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span>{item.attendantName}</span>
                          {user?.attendantId === item.attendantId && (
                            <span className="px-1.5 py-0.5 rounded bg-primary text-on-primary text-[10px] font-bold">
                              Você
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {item.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      {/* Apoio ao Tratamento */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-primary">{item.treatmentSupportMonth}</span>
                          <span className="text-[10px] text-outline">({item.treatmentSupportToday} hoje)</span>
                        </div>
                      </td>
                      {/* Na Rotina */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-secondary">{item.routineCareMonth}</span>
                          <span className="text-[10px] text-outline">({item.routineCareToday} hoje)</span>
                        </div>
                      </td>
                      {/* Total Geral de Serviços (Soma de Apoio + Na Rotina) */}
                      <td
                        className="px-4 py-3 text-right bg-emerald-500/5"
                        title={`Total Geral: ${item.treatmentSupportMonth} (Apoio) + ${item.routineCareMonth} (Na Rotina) = ${item.totalServicesMonth} serviços no mês`}
                      >
                        <div className="flex flex-col items-end">
                          <span className="font-extrabold text-emerald-800 text-sm">
                            {item.totalServicesMonth}
                          </span>
                          <span className="text-[10px] text-emerald-700/80 font-medium">
                            ({item.totalServicesToday} hoje)
                          </span>
                        </div>
                      </td>
                      {/* Participação */}
                      <td className="px-4 py-3 text-right">
                        <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold text-[11px]">
                          {item.percentageOfMonth}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Linha Consolidada de TOTAL DA EQUIPE */}
              {consolidatedAttendantsPerformance.length > 0 && (
                <tfoot className="bg-surface-container border-t-2 border-outline-variant/60 font-bold text-on-surface">
                  <tr>
                    <td colSpan={4} className="px-4 py-3.5 uppercase tracking-wider text-xs">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px] text-emerald-700">groups</span>
                        <div>
                          <span className="text-on-surface font-extrabold block">TOTAL DA EQUIPE</span>
                          <span className="text-[10px] text-outline normal-case font-normal">
                            Soma: {teamTotal.treatmentSupportMonth} Apoios + {teamTotal.routineCareMonth} Na Rotina = {teamTotal.totalServicesMonth} Serviços
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-primary font-bold text-sm">
                      <div>{teamTotal.treatmentSupportMonth}</div>
                      <span className="text-[10px] font-normal text-outline">({teamTotal.treatmentSupportToday} hoje)</span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-secondary font-bold text-sm">
                      <div>{teamTotal.routineCareMonth}</div>
                      <span className="text-[10px] font-normal text-outline">({teamTotal.routineCareToday} hoje)</span>
                    </td>
                    <td
                      className="px-4 py-3.5 text-right bg-emerald-500/10 text-emerald-900 font-extrabold text-base"
                      title={`Total da Equipe: ${teamTotal.treatmentSupportMonth} Apoios + ${teamTotal.routineCareMonth} Na Rotina = ${teamTotal.totalServicesMonth} Serviços no mês`}
                    >
                      <div className="text-emerald-900 font-black">{teamTotal.totalServicesMonth}</div>
                      <span className="text-[10px] font-semibold text-emerald-800">
                        ({teamTotal.totalServicesToday} hoje)
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-extrabold text-[11px]">
                        100%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};


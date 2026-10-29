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


  // Dados para Gráfico de Evolução Diária (dias 1 até a data selecionada)
  const dailyEvolutionChartData = useMemo(() => {
    const targetMonth = selectedDate.substring(0, 7);
    const parts = selectedDate.split('-');
    const currentDay = parseInt(parts[2], 10) || 24;

    const data = [];
    for (let day = 1; day <= currentDay; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${targetMonth}-${dayStr}`;
      const dayTotal = supports
        .filter((s) => !s.deletedAt && s.date === dateKey)
        .reduce((acc, curr) => acc + curr.quantity, 0);

      data.push({
        dia: `${dayStr}/${targetMonth.substring(5, 7)}`,
        apoios: dayTotal,
        meta: metrics.todayGoal,
      });
    }
    return data;
  }, [supports, selectedDate, metrics.todayGoal]);

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
            onClick={loadData}
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
            <span className="text-emerald-700 font-extrabold">TOTAL GERAL</span>
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
          <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-surface-container-low to-surface-container-low border-2 border-emerald-500/40 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[18px]">functions</span>
                </div>
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-950 block">Total Geral de Serviços</span>
                  <span className="text-[10px] text-emerald-800">Apoio + Na Rotina</span>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">Consolidado</span>
            </div>
            <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-emerald-500/20">
              <div>
                <span className="text-2xl font-extrabold text-emerald-950">{consolidatedMetrics.todayTotalServices}</span>
                <span className="text-xs text-emerald-800 ml-1 font-medium">hoje ({consolidatedMetrics.todayTreatmentSupport} + {consolidatedMetrics.todayRoutineCare})</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-extrabold text-emerald-700">{consolidatedMetrics.monthTotalServices}</span>
                <span className="text-xs text-emerald-800 ml-1 font-medium">no mês</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de 6 StatCards Operacionais de Apoio ao Tratamento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* 1. Apoios Hoje */}
        <StatCard
          label="Apoios Hoje"
          value={metrics.todayTotal}
          icon="task_alt"
          iconBgColor="bg-surface-container-low"
          iconColor="text-primary"
          trendText={`${metrics.todayPercentage}%`}
          trendVariant={metrics.todayPercentage >= 100 ? 'success' : 'neutral'}
          footerLabel={`Meta: ${metrics.todayGoal}`}
          footerValue={metrics.todayDifference >= 0 ? `+${metrics.todayDifference}` : `${metrics.todayDifference}`}
          progressPercentage={metrics.todayPercentage}
          progressBarColor={metrics.todayPercentage >= 100 ? 'bg-emerald-600' : 'bg-primary'}
        />

        {/* 2. Apoios no Mês */}
        <StatCard
          label="Apoios no Mês"
          value={metrics.monthTotal}
          icon="calendar_month"
          iconBgColor="bg-secondary-fixed"
          iconColor="text-on-secondary-fixed"
          trendText={`${metrics.monthPercentage}%`}
          trendVariant="secondary"
          footerLabel="Meta Mensal"
          footerValue={`${metrics.monthGoal}`}
          progressPercentage={metrics.monthPercentage}
          progressBarColor="bg-secondary"
        />

        {/* 3. Meta Diária */}
        <StatCard
          label="Meta Diária"
          value={metrics.todayGoal}
          icon="flag"
          iconBgColor="bg-surface-container-low"
          iconColor="text-tertiary-container"
          trendText={metrics.todayDifference >= 0 ? 'Atingida' : 'Em Curso'}
          trendVariant={metrics.todayDifference >= 0 ? 'success' : 'warning'}
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
          trendText={`Faltam ${metrics.monthRemainingValue}`}
          trendVariant={metrics.monthRemainingValue === 0 ? 'success' : 'neutral'}
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
          footerValue={`${metrics.monthRequiredPace}/dia`}
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
        {/* Gráfico 1: Evolução Diária no Mês */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-on-surface">Evolução Diária de Apoios</h3>
              <p className="text-xs text-on-surface-variant">
                Comparativo diário de apoios realizados vs meta diária ({metrics.todayGoal})
              </p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyEvolutionChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dia" stroke="#757682" fontSize={11} />
                <YAxis stroke="#757682" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    borderColor: '#cbd5e1',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="apoios"
                  name="Apoios Realizados"
                  stroke="#00236f"
                  strokeWidth={3}
                  dot={{ r: 3, fill: '#00236f' }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="meta"
                  name="Meta Diária Fixa"
                  stroke="#d97706"
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
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    borderColor: '#cbd5e1',
                    fontSize: '12px',
                  }}
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

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
                <tr>
                  <th className="px-4 py-3 text-center w-12">Pos.</th>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Atendente</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-primary font-bold">Apoio</span>
                    <span className="text-[10px] text-outline block normal-case font-normal">Hoje / Mês</span>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <span className="text-secondary font-bold">Na Rotina</span>
                    <span className="text-[10px] text-outline block normal-case font-normal">Hoje / Mês</span>
                  </th>
                  <th className="px-4 py-3 text-right bg-emerald-500/5">
                    <span className="text-emerald-800 font-extrabold">Total Geral</span>
                    <span className="text-[10px] text-emerald-700/80 block normal-case font-medium">Hoje / Mês</span>
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
                      {/* Total Geral de Serviços */}
                      <td className="px-4 py-3 text-right bg-emerald-500/5">
                        <div className="flex flex-col items-end">
                          <span className="font-extrabold text-emerald-800 text-sm">
                            {item.totalServicesMonth}
                          </span>
                          <span className="text-[10px] text-emerald-700/80">({item.totalServicesToday} hoje)</span>
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
                        <span className="material-symbols-outlined text-[18px] text-emerald-700">groups</span>
                        <span className="text-on-surface font-extrabold">TOTAL DA EQUIPE</span>
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
                    <td className="px-4 py-3.5 text-right bg-emerald-500/10 text-emerald-900 font-extrabold text-base">
                      <div>{teamTotal.totalServicesMonth}</div>
                      <span className="text-[10px] font-medium text-emerald-800">({teamTotal.totalServicesToday} hoje)</span>
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


import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SupportService } from '../../services/supports/supportService';
import { AttendantService } from '../../services/attendants/attendantService';
import { GoalService } from '../../services/goals/goalService';
import { AIService } from '../../services/ai/aiService';
import { SettingsService } from '../../services/settings/settingsService';
import { CloudSyncService } from '../../services/api/cloudSyncService';
import {
  calculateDashboardMetrics,
  calculateAttendantsPerformance,
  formatDateBR,
  formatDateTimeBR,
  getTodayISODate,
} from '../../utils/calculations';
import { AIAnalysis, TreatmentSupport, Attendant, Goal } from '../../types';
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
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  
  // IA State
  const [dailyAnalysis, setDailyAnalysis] = useState<AIAnalysis | null>(null);
  const [monthlyAnalysis, setMonthlyAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoadingDailyAI, setIsLoadingDailyAI] = useState(false);
  const [isLoadingMonthlyAI, setIsLoadingMonthlyAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    const s = SupportService.getAll(false);
    const a = AttendantService.getAll();
    const g = GoalService.getAll();
    setSupports(s);
    setAttendants(a);
    setGoals(g);
  }, []);

  useEffect(() => {
    loadData();
    const unsubscribe = CloudSyncService.subscribe(loadData);
    return unsubscribe;
  }, [loadData]);

  // Cálculos consolidados
  const metrics = useMemo(
    () => calculateDashboardMetrics(supports, attendants, goals, selectedDate),
    [supports, attendants, goals, selectedDate]
  );

  const attendantsPerformance = useMemo(
    () => calculateAttendantsPerformance(supports, attendants, selectedDate),
    [supports, attendants, selectedDate]
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

          {/* Ação Primária para ADMIN */}
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onNavigate('registrar-apoio')}
              icon="add_circle"
            >
              Novo Apoio
            </Button>
          )}
        </div>
      </div>

      {/* Grid de 6 StatCards */}
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

      {/* Seção Inteligência Artificial Gemini (Diária e Mensal) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card IA: Análise Diária */}
        <div className="bg-surface-container-lowest rounded-xl border border-primary/20 shadow-subtle p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[20px]">psychology</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-on-surface">Análise Inteligente do Dia</h3>
                <span className="text-[11px] text-on-surface-variant">
                  {dailyAnalysis ? `Última atualização: ${formatDateTimeBR(dailyAnalysis.updatedAt)}` : 'Google Gemini 3.6 Flash'}
                </span>
              </div>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerateDailyAI(true)}
                isLoading={isLoadingDailyAI}
                loadingText="Gerando..."
                icon="refresh"
              >
                Regenerar
              </Button>
            )}
          </div>

          <div className="bg-surface-container-low/60 rounded-lg p-4 text-xs text-on-surface leading-relaxed flex-1 border border-outline-variant/30 overflow-y-auto max-h-56">
            {isLoadingDailyAI ? (
              <div className="flex items-center justify-center py-8 text-on-surface-variant gap-2">
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                <span>Processando interpretação de indicadores com Google Gemini...</span>
              </div>
            ) : dailyAnalysis ? (
              <div className="prose prose-sm max-w-none whitespace-pre-line">
                {dailyAnalysis.analysisText}
              </div>
            ) : aiError ? (
              <div className="text-amber-800 p-2 bg-amber-50 rounded border border-amber-200">
                <p className="font-semibold mb-1">Análise por IA temporariamente indisponível.</p>
                <p className="text-[11px] text-amber-700">
                  Os indicadores continuam funcionando normalmente. ({aiError})
                </p>
              </div>
            ) : (
              <p className="text-on-surface-variant italic">Clique em Regenerar para obter o parecer analítico da IA.</p>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-outline">
            <span>Análise gerada por IA com base nos registros disponíveis no sistema.</span>
            <span className="font-medium text-primary">Modelo: gemini-3.6-flash</span>
          </div>
        </div>

        {/* Card IA: Análise Mensal */}
        <div className="bg-surface-container-lowest rounded-xl border border-secondary/20 shadow-subtle p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
              </div>
              <div>
                <h3 className="font-bold text-sm text-on-surface">Análise Inteligente do Mês</h3>
                <span className="text-[11px] text-on-surface-variant">
                  {monthlyAnalysis ? `Última atualização: ${formatDateTimeBR(monthlyAnalysis.updatedAt)}` : 'Projeções & Ritmo'}
                </span>
              </div>
            </div>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerateMonthlyAI(true)}
                isLoading={isLoadingMonthlyAI}
                loadingText="Gerando..."
                icon="refresh"
              >
                Regenerar
              </Button>
            )}
          </div>

          <div className="bg-surface-container-low/60 rounded-lg p-4 text-xs text-on-surface leading-relaxed flex-1 border border-outline-variant/30 overflow-y-auto max-h-56">
            {isLoadingMonthlyAI ? (
              <div className="flex items-center justify-center py-8 text-on-surface-variant gap-2">
                <span className="w-4 h-4 border-2 border-secondary border-t-transparent rounded-full animate-spin"></span>
                <span>Calculando projeções e interpretando tendências com Google Gemini...</span>
              </div>
            ) : monthlyAnalysis ? (
              <div className="prose prose-sm max-w-none whitespace-pre-line">
                {monthlyAnalysis.analysisText}
              </div>
            ) : (
              <p className="text-on-surface-variant italic">Clique em Regenerar para processar o fechamento estatístico mensal.</p>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-outline">
            <span>Cálculos oficiais efetuados deterministicamente pelo backend.</span>
            <span className="font-medium text-secondary">Cloudflare Edge • GEMINI_API_KEY</span>
          </div>
        </div>
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

      {/* Tabela de Desempenho dos Atendentes (Condicional para Atendente) */}
      {(isAdmin || appSettings.allowAttendantViewIndividualPerformance) && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/30">
            <div>
              <h3 className="font-bold text-sm text-on-surface">Indicadores por Atendente</h3>
              <p className="text-xs text-on-surface-variant">
                Participação de cada atendente nos apoios registrados no ciclo de Setembro/2026
              </p>
            </div>
            <span className="text-xs font-semibold text-outline">
              Total Ativos: {metrics.activeAttendantsCount}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
                <tr>
                  <th className="px-5 py-3">Código</th>
                  <th className="px-5 py-3">Atendente</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Apoios Hoje</th>
                  <th className="px-5 py-3 text-right">Apoios no Mês</th>
                  <th className="px-5 py-3 text-right">Participação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
                {attendantsPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-on-surface-variant">
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
                  attendantsPerformance.map((item) => (
                    <tr
                      key={item.attendantId}
                      className={`hover:bg-surface-container-low/50 transition-colors ${
                        user?.attendantId === item.attendantId ? 'bg-primary/5 font-bold' : ''
                      }`}
                    >
                      <td className="px-5 py-3 font-mono text-outline">{item.attendantCode}</td>
                      <td className="px-5 py-3 flex items-center gap-2">
                        <span>{item.attendantName}</span>
                        {user?.attendantId === item.attendantId && (
                          <span className="px-1.5 py-0.5 rounded bg-primary text-on-primary text-[10px] font-bold">
                            Você
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {item.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-primary">{item.todayQuantity}</td>
                      <td className="px-5 py-3 text-right font-bold">{item.monthQuantity}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-semibold text-[11px]">
                          {item.percentageOfMonth}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

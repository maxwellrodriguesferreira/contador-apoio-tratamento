import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SupportService } from '../../services/supports/supportService';
import { RoutineService } from '../../services/routine/routineService';
import { AttendantService } from '../../services/attendants/attendantService';
import { GoalService } from '../../services/goals/goalService';
import { TreatmentSupport, RoutineCare, Attendant, Goal } from '../../types';
import {
  calculateDashboardMetrics,
  calculateAttendantsPerformance,
  calculateConsolidatedMetrics,
  calculateConsolidatedAttendantsPerformance,
  filterValidRecords,
  formatDateBR,
  getTodayISODate,
} from '../../utils/calculations';
import { getDaysInMonth } from 'date-fns';
import {
  exportSupportsToExcel,
  exportSupportsToCSV,
  exportLancamentosToExcel,
  exportLancamentosToCSV,
  ExportableLancamento,
} from '../../utils/export';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { CloudSyncService } from '../../services/api/cloudSyncService';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export type ServiceReportView = 'SUPPORT' | 'ROUTINE' | 'CONSOLIDATED';

export const RelatoriosPage: React.FC = () => {
  const { isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'diario' | 'mensal' | 'atendente'>('diario');
  const [serviceView, setServiceView] = useState<ServiceReportView>('SUPPORT');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayISODate());

  const [supports, setSupports] = useState<TreatmentSupport[]>([]);
  const [routines, setRoutines] = useState<RoutineCare[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const loadData = useCallback(() => {
    setSupports(SupportService.getAll(false));
    setRoutines(RoutineService.getAll(false));
    setAttendants(AttendantService.getAll());
    setGoals(GoalService.getAll());
  }, []);

  useEffect(() => {
    loadData();
    const unsubscribe = CloudSyncService.subscribe(loadData);
    return unsubscribe;
  }, [loadData]);

  // Garante integridade e fidelidade total dos registros (sem soft-deletes ou IDs duplicados)
  const validSupports = useMemo(() => filterValidRecords(supports), [supports]);
  const validRoutines = useMemo(() => filterValidRecords(routines), [routines]);

  const attendantsMap = useMemo(() => {
    const map = new Map<string, Attendant>();
    attendants.forEach((a) => map.set(a.id, a));
    return map;
  }, [attendants]);

  // Mês e Ano formatados dinamicamente
  const monthName = useMemo(() => {
    try {
      const [yearStr, monthStr] = selectedDate.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const date = new Date(year, month - 1, 1);
      const formatted = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } catch {
      return 'Ciclo Vigente';
    }
  }, [selectedDate]);

  // Métricas de Apoio ao Tratamento
  const supportMetrics = useMemo(
    () => calculateDashboardMetrics(validSupports, attendants, goals, selectedDate),
    [validSupports, attendants, goals, selectedDate]
  );

  // Desempenho de Apoio por Atendente
  const supportAttendantsPerformance = useMemo(
    () => calculateAttendantsPerformance(validSupports, attendants, selectedDate),
    [validSupports, attendants, selectedDate]
  );

  // Métricas Consolidadas (Apoio + Na Rotina)
  const consolidatedMetrics = useMemo(
    () => calculateConsolidatedMetrics(validSupports, validRoutines, selectedDate),
    [validSupports, validRoutines, selectedDate]
  );

  // Desempenho Consolidado de Atendentes
  const consolidatedAttendantsPerformance = useMemo(
    () => calculateConsolidatedAttendantsPerformance(validSupports, validRoutines, attendants, selectedDate),
    [validSupports, validRoutines, attendants, selectedDate]
  );

  // Métricas de Na Rotina
  const routineMetrics = useMemo(() => {
    const targetMonth = selectedDate.substring(0, 7);
    const parts = selectedDate.split('-');
    const currentDay = parseInt(parts[2], 10) || 1;
    const year = parseInt(parts[0], 10) || new Date().getFullYear();
    const month = parseInt(parts[1], 10) || new Date().getMonth() + 1;
    const totalDaysInMonth = getDaysInMonth(new Date(year, month - 1));

    const todayRoutines = validRoutines.filter((r) => r.date === selectedDate);
    const todayTotal = todayRoutines.reduce((acc, curr) => acc + curr.quantity, 0);

    const monthRoutines = validRoutines.filter((r) => r.date.startsWith(targetMonth));
    const monthTotal = monthRoutines.reduce((acc, curr) => acc + curr.quantity, 0);

    const daysConsidered = Math.max(1, currentDay);
    const monthDailyAverage = Number((monthTotal / daysConsidered).toFixed(1));
    const monthProjection = Math.round(monthDailyAverage * totalDaysInMonth);

    const attendantsWithRoutineSet = new Set(todayRoutines.map((r) => r.attendantId));

    return {
      todayTotal,
      monthTotal,
      monthDailyAverage,
      monthProjection,
      attendantsWithRoutineCount: attendantsWithRoutineSet.size,
      activeAttendantsCount: attendants.filter((a) => a.active).length,
    };
  }, [validRoutines, attendants, selectedDate]);

  // Dados diários no mês com total fidelidade
  const dailyData = useMemo(() => {
    const targetMonth = selectedDate.substring(0, 7);
    const parts = selectedDate.split('-');
    const currentDay = parseInt(parts[2], 10) || 1;

    const list = [];
    for (let day = 1; day <= currentDay; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${targetMonth}-${dayStr}`;

      const daySupports = validSupports.filter((s) => s.date === dateKey);
      const daySupportTotal = daySupports.reduce((acc, curr) => acc + curr.quantity, 0);

      const dayRoutines = validRoutines.filter((r) => r.date === dateKey);
      const dayRoutineTotal = dayRoutines.reduce((acc, curr) => acc + curr.quantity, 0);

      const displayTotal =
        serviceView === 'SUPPORT'
          ? daySupportTotal
          : serviceView === 'ROUTINE'
          ? dayRoutineTotal
          : daySupportTotal + dayRoutineTotal;

      list.push({
        data: `${dayStr}/${targetMonth.substring(5, 7)}`,
        dataCompleta: dateKey,
        total: displayTotal,
        apoios: daySupportTotal,
        rotinas: dayRoutineTotal,
        meta: serviceView === 'SUPPORT' ? supportMetrics.todayGoal : 0,
        atendentesComApoio: new Set(daySupports.map((s) => s.attendantId)).size,
        atendentesComRotina: new Set(dayRoutines.map((r) => r.attendantId)).size,
      });
    }
    return list;
  }, [validSupports, validRoutines, selectedDate, serviceView, supportMetrics.todayGoal]);

  // Exportação Fiel conforme visualização atual
  const handleExportCSV = () => {
    if (serviceView === 'SUPPORT') {
      exportSupportsToCSV(validSupports, attendantsMap);
    } else {
      const items: ExportableLancamento[] = [];
      if (serviceView === 'CONSOLIDATED') {
        validSupports.forEach((s) => {
          items.push({
            id: s.id,
            serviceType: 'SUPPORT',
            date: s.date,
            attendantId: s.attendantId,
            quantity: s.quantity,
            observation: s.observation,
            createdBy: s.createdBy,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            deletedAt: s.deletedAt,
          });
        });
      }
      validRoutines.forEach((r) => {
        items.push({
          id: r.id,
          serviceType: 'ROUTINE',
          date: r.date,
          attendantId: r.attendantId,
          quantity: r.quantity,
          observation: r.observation,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          deletedAt: r.deletedAt,
        });
      });
      exportLancamentosToCSV(items, attendantsMap, `relatorio_${serviceView.toLowerCase()}`);
    }
  };

  const handleExportExcel = () => {
    if (serviceView === 'SUPPORT') {
      exportSupportsToExcel(validSupports, attendantsMap);
    } else {
      const items: ExportableLancamento[] = [];
      if (serviceView === 'CONSOLIDATED') {
        validSupports.forEach((s) => {
          items.push({
            id: s.id,
            serviceType: 'SUPPORT',
            date: s.date,
            attendantId: s.attendantId,
            quantity: s.quantity,
            observation: s.observation,
            createdBy: s.createdBy,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            deletedAt: s.deletedAt,
          });
        });
      }
      validRoutines.forEach((r) => {
        items.push({
          id: r.id,
          serviceType: 'ROUTINE',
          date: r.date,
          attendantId: r.attendantId,
          quantity: r.quantity,
          observation: r.observation,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          deletedAt: r.deletedAt,
        });
      });
      exportLancamentosToExcel(items, attendantsMap, `relatorio_${serviceView.toLowerCase()}`);
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
          Relatórios executivos e comparativos de desempenho são restritos a administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Relatórios &amp; Comparativos</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Análises analíticas, volumetria consolidada e governança operacional de serviços farmacêuticos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} icon="description">
            Exportar CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} icon="table_view">
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Barra de Seletor de Serviço (Fidelidade aos Lançamentos) */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mr-1">
            Serviço Analisado:
          </span>
          <button
            onClick={() => setServiceView('SUPPORT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              serviceView === 'SUPPORT'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">health_and_safety</span>
            <span>Apoio ao Tratamento</span>
          </button>
          <button
            onClick={() => setServiceView('ROUTINE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              serviceView === 'ROUTINE'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">assignment_turned_in</span>
            <span>Na Rotina</span>
          </button>
          <button
            onClick={() => setServiceView('CONSOLIDATED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              serviceView === 'CONSOLIDATED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">hub</span>
            <span>Consolidado (Todos)</span>
          </button>
        </div>

        <div className="max-w-xs w-full sm:w-auto">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            label="Data de Referência"
          />
        </div>
      </div>

      {/* Seletor de Abas de Relatório */}
      <div className="flex items-center gap-1 p-1 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle w-fit">
        <button
          onClick={() => setActiveTab('diario')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'diario'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">today</span>
          <span>Relatório Diário</span>
        </button>
        <button
          onClick={() => setActiveTab('mensal')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'mensal'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">calendar_view_month</span>
          <span>Relatório Mensal</span>
        </button>
        <button
          onClick={() => setActiveTab('atendente')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'atendente'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">group</span>
          <span>Por Atendente</span>
        </button>
      </div>

      {/* Conteúdo da Aba 1: Relatório Diário */}
      {activeTab === 'diario' && (
        <div className="flex flex-col gap-6 animate-in fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total de Hoje */}
            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-subtle">
              <span className="text-xs text-outline font-semibold">Total de Hoje</span>
              <p className="text-2xl font-extrabold text-on-surface mt-1">
                {serviceView === 'SUPPORT' && `${supportMetrics.todayTotal} apoios`}
                {serviceView === 'ROUTINE' && `${routineMetrics.todayTotal} rotinas`}
                {serviceView === 'CONSOLIDATED' && `${consolidatedMetrics.todayTotalServices} serviços`}
              </p>
              {serviceView === 'SUPPORT' ? (
                supportMetrics.todayGoal > 0 ? (
                  <span className="text-xs text-primary font-bold">
                    {supportMetrics.todayPercentage}% da meta ({supportMetrics.todayGoal} alvo)
                  </span>
                ) : (
                  <span className="text-xs text-outline font-semibold">Sem meta fixada (Meta: 0)</span>
                )
              ) : (
                <span className="text-xs text-outline">Registrado em {formatDateBR(selectedDate)}</span>
              )}
            </div>

            {/* Card 2: Meta Diária / Volume */}
            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-subtle">
              <span className="text-xs text-outline font-semibold">
                {serviceView === 'SUPPORT' ? 'Meta Diária Vigente' : 'Participação no Dia'}
              </span>
              <p className="text-2xl font-extrabold text-on-surface mt-1">
                {serviceView === 'SUPPORT'
                  ? `${supportMetrics.todayGoal} apoios`
                  : serviceView === 'ROUTINE'
                  ? `${routineMetrics.todayTotal} atendimentos`
                  : `${consolidatedMetrics.todayTreatmentSupport} ap. / ${consolidatedMetrics.todayRoutineCare} rot.`}
              </p>
              <span className="text-xs text-outline">
                {serviceView === 'SUPPORT'
                  ? supportMetrics.todayGoal > 0
                    ? 'Vigência ativa'
                    : 'Meta zerada / não cadastrada'
                  : 'Volume realizado hoje'}
              </span>
            </div>

            {/* Card 3: Diferença para Meta / Ritmo */}
            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-subtle">
              <span className="text-xs text-outline font-semibold">
                {serviceView === 'SUPPORT' ? 'Diferença para Meta' : 'Média por Atendente Ativo'}
              </span>
              {serviceView === 'SUPPORT' ? (
                supportMetrics.todayGoal > 0 ? (
                  <p
                    className={`text-2xl font-extrabold mt-1 ${
                      supportMetrics.todayDifference >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {supportMetrics.todayDifference >= 0
                      ? `+${supportMetrics.todayDifference}`
                      : `${supportMetrics.todayDifference}`}
                  </p>
                ) : (
                  <p className="text-2xl font-extrabold text-on-surface mt-1">-</p>
                )
              ) : (
                <p className="text-2xl font-extrabold text-on-surface mt-1">
                  {serviceView === 'ROUTINE'
                    ? (routineMetrics.todayTotal / Math.max(1, routineMetrics.activeAttendantsCount)).toFixed(1)
                    : (consolidatedMetrics.todayTotalServices / Math.max(1, supportMetrics.activeAttendantsCount)).toFixed(1)}
                </p>
              )}
              <span className="text-xs text-outline">
                {serviceView === 'SUPPORT'
                  ? supportMetrics.todayGoal > 0
                    ? 'em relação ao alvo diário'
                    : 'Sem meta configurada'
                  : 'média por profissional'}
              </span>
            </div>

            {/* Card 4: Atendentes Participantes */}
            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-subtle">
              <span className="text-xs text-outline font-semibold">Atendentes com Registro</span>
              <p className="text-2xl font-extrabold text-on-surface mt-1">
                {serviceView === 'SUPPORT' &&
                  `${supportMetrics.attendantsWithSupportCount} de ${supportMetrics.activeAttendantsCount}`}
                {serviceView === 'ROUTINE' &&
                  `${routineMetrics.attendantsWithRoutineCount} de ${routineMetrics.activeAttendantsCount}`}
                {serviceView === 'CONSOLIDATED' &&
                  `${Math.max(supportMetrics.attendantsWithSupportCount, routineMetrics.attendantsWithRoutineCount)} de ${supportMetrics.activeAttendantsCount}`}
              </p>
              <span className="text-xs text-outline">
                Média:{' '}
                {serviceView === 'SUPPORT'
                  ? supportMetrics.todayAveragePerAttendant
                  : serviceView === 'ROUTINE'
                  ? (routineMetrics.todayTotal / Math.max(1, routineMetrics.activeAttendantsCount)).toFixed(1)
                  : (consolidatedMetrics.todayTotalServices / Math.max(1, supportMetrics.activeAttendantsCount)).toFixed(1)}{' '}
                por atendente
              </span>
            </div>
          </div>

          {/* Gráfico Diário */}
          <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-subtle">
            <h3 className="font-bold text-sm text-on-surface mb-3">
              Evolução dos Dias no Ciclo de {monthName}
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="data" stroke="#757682" fontSize={11} />
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
                  {serviceView === 'CONSOLIDATED' ? (
                    <>
                      <Line
                        type="monotone"
                        dataKey="apoios"
                        name="Apoios ao Tratamento"
                        stroke="#00236f"
                        strokeWidth={2.5}
                      />
                      <Line
                        type="monotone"
                        dataKey="rotinas"
                        name="Na Rotina"
                        stroke="#9333ea"
                        strokeWidth={2.5}
                      />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Total Geral"
                        stroke="#059669"
                        strokeWidth={3}
                      />
                    </>
                  ) : (
                    <Line
                      type="monotone"
                      dataKey="total"
                      name={serviceView === 'SUPPORT' ? 'Apoios Realizados' : 'Atendimentos de Rotina'}
                      stroke={serviceView === 'SUPPORT' ? '#00236f' : '#9333ea'}
                      strokeWidth={3}
                    />
                  )}
                  {serviceView === 'SUPPORT' && supportMetrics.todayGoal > 0 && (
                    <Line
                      type="monotone"
                      dataKey="meta"
                      name="Meta Diária"
                      stroke="#d97706"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba 2: Relatório Mensal */}
      {activeTab === 'mensal' && (
        <div className="flex flex-col gap-6 animate-in fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-subtle">
              <span className="text-xs text-outline font-semibold">Acumulado no Mês ({monthName})</span>
              <p className="text-2xl font-extrabold text-on-surface mt-1">
                {serviceView === 'SUPPORT' && `${supportMetrics.monthTotal} apoios`}
                {serviceView === 'ROUTINE' && `${routineMetrics.monthTotal} rotinas`}
                {serviceView === 'CONSOLIDATED' && `${consolidatedMetrics.monthTotalServices} serviços`}
              </p>
              {serviceView === 'SUPPORT' && (
                supportMetrics.monthGoal > 0 ? (
                  <span className="text-xs text-secondary font-bold">
                    {supportMetrics.monthPercentage}% da meta mensal
                  </span>
                ) : (
                  <span className="text-xs text-outline">Meta mensal zerada</span>
                )
              )}
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-subtle">
              <span className="text-xs text-outline font-semibold">
                {serviceView === 'SUPPORT' ? 'Meta Mensal' : 'Composição do Mês'}
              </span>
              <p className="text-2xl font-extrabold text-on-surface mt-1">
                {serviceView === 'SUPPORT'
                  ? `${supportMetrics.monthGoal} apoios`
                  : serviceView === 'ROUTINE'
                  ? `${routineMetrics.monthTotal} rotinas`
                  : `${consolidatedMetrics.monthTreatmentSupport} ap. / ${consolidatedMetrics.monthRoutineCare} rot.`}
              </p>
              <span className="text-xs text-outline">
                {serviceView === 'SUPPORT'
                  ? supportMetrics.monthGoal > 0
                    ? `Faltam ${supportMetrics.monthRemainingValue} apoios`
                    : 'Sem meta cadastrada'
                  : 'Total consolidado no ciclo'}
              </span>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-subtle">
              <span className="text-xs text-outline font-semibold">Média Diária Observada</span>
              <p className="text-2xl font-extrabold text-on-surface mt-1">
                {serviceView === 'SUPPORT' && supportMetrics.monthDailyAverage}
                {serviceView === 'ROUTINE' && routineMetrics.monthDailyAverage}
                {serviceView === 'CONSOLIDATED' &&
                  (
                    Number(supportMetrics.monthDailyAverage) + Number(routineMetrics.monthDailyAverage)
                  ).toFixed(1)}
              </p>
              <span className="text-xs text-outline">registros/dia</span>
            </div>

            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 shadow-subtle">
              <span className="text-xs text-outline font-semibold">Projeção Final do Mês</span>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                {serviceView === 'SUPPORT' && supportMetrics.monthProjection}
                {serviceView === 'ROUTINE' && routineMetrics.monthProjection}
                {serviceView === 'CONSOLIDATED' &&
                  supportMetrics.monthProjection + routineMetrics.monthProjection}
              </p>
              <span className="text-xs text-outline">
                {serviceView === 'SUPPORT' && supportMetrics.monthGoal > 0
                  ? `Ritmo necessário: ${supportMetrics.monthRequiredPace}/dia`
                  : 'Estimativa baseada no histórico'}
              </span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/30 shadow-subtle">
            <h3 className="font-bold text-sm text-on-surface mb-3">
              Ritmo de Acumulação Mensal ({monthName})
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="data" stroke="#757682" fontSize={11} />
                  <YAxis stroke="#757682" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      borderColor: '#cbd5e1',
                      fontSize: '12px',
                    }}
                  />
                  {serviceView === 'CONSOLIDATED' ? (
                    <>
                      <Bar dataKey="apoios" name="Apoios por Dia" fill="#006398" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="rotinas" name="Na Rotina por Dia" fill="#9333ea" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <Bar
                      dataKey="total"
                      name={serviceView === 'SUPPORT' ? 'Apoios por Dia' : 'Atendimentos por Dia'}
                      fill={serviceView === 'SUPPORT' ? '#006398' : '#9333ea'}
                      radius={[4, 4, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba 3: Relatório por Atendente */}
      {activeTab === 'atendente' && (
        <div className="flex flex-col gap-6 animate-in fade-in">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/30 bg-surface-container-low/40 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-on-surface">Desempenho por Atendente</h3>
                <p className="text-xs text-on-surface-variant">
                  Distribuição fidedigna de registros, médias diárias e participação percentual da equipe
                </p>
              </div>
              <span className="text-xs font-bold text-outline">
                {serviceView === 'SUPPORT'
                  ? 'Visão: Apoio ao Tratamento'
                  : serviceView === 'ROUTINE'
                  ? 'Visão: Na Rotina'
                  : 'Visão: Consolidada'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
                  <tr>
                    <th className="px-5 py-3">Código</th>
                    <th className="px-5 py-3">Atendente</th>
                    {serviceView === 'CONSOLIDATED' ? (
                      <>
                        <th className="px-5 py-3 text-right">Apoios Hoje</th>
                        <th className="px-5 py-3 text-right">Rotinas Hoje</th>
                        <th className="px-5 py-3 text-right">Total Hoje</th>
                        <th className="px-5 py-3 text-right">Acumulado Mês</th>
                        <th className="px-5 py-3 text-right">Média Diária</th>
                      </>
                    ) : (
                      <>
                        <th className="px-5 py-3 text-right">Hoje</th>
                        <th className="px-5 py-3 text-right">Acumulado Mês</th>
                        <th className="px-5 py-3 text-right">Média Diária</th>
                      </>
                    )}
                    <th className="px-5 py-3 text-right">Participação %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
                  {serviceView === 'CONSOLIDATED'
                    ? consolidatedAttendantsPerformance.map((item) => {
                        const days = parseInt(selectedDate.split('-')[2], 10) || 1;
                        const dailyAvg = (item.totalServicesMonth / days).toFixed(1);
                        const totalAllMonth = consolidatedMetrics.monthTotalServices || 1;
                        const share = ((item.totalServicesMonth / totalAllMonth) * 100).toFixed(1);

                        return (
                          <tr key={item.attendantId} className="hover:bg-surface-container-low/50">
                            <td className="px-5 py-3 font-mono text-outline">{item.attendantCode}</td>
                            <td className="px-5 py-3 font-bold text-on-surface">{item.attendantName}</td>
                            <td className="px-5 py-3 text-right font-medium text-primary">
                              {item.treatmentSupportToday}
                            </td>
                            <td className="px-5 py-3 text-right font-medium text-purple-700">
                              {item.routineCareToday}
                            </td>
                            <td className="px-5 py-3 text-right font-bold text-emerald-700">
                              {item.totalServicesToday}
                            </td>
                            <td className="px-5 py-3 text-right font-extrabold text-sm">
                              {item.totalServicesMonth}
                            </td>
                            <td className="px-5 py-3 text-right text-outline">{dailyAvg}/dia</td>
                            <td className="px-5 py-3 text-right">
                              <span className="px-2 py-0.5 rounded bg-surface-container font-bold text-on-surface">
                                {share}%
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    : supportAttendantsPerformance.map((item) => {
                        const days = parseInt(selectedDate.split('-')[2], 10) || 1;
                        const dailyAvg = (item.monthQuantity / days).toFixed(1);

                        return (
                          <tr key={item.attendantId} className="hover:bg-surface-container-low/50">
                            <td className="px-5 py-3 font-mono text-outline">{item.attendantCode}</td>
                            <td className="px-5 py-3 font-bold text-on-surface">{item.attendantName}</td>
                            <td className="px-5 py-3 text-right font-bold text-primary">
                              {item.todayQuantity}
                            </td>
                            <td className="px-5 py-3 text-right font-extrabold text-sm">
                              {item.monthQuantity}
                            </td>
                            <td className="px-5 py-3 text-right text-outline">{dailyAvg}/dia</td>
                            <td className="px-5 py-3 text-right">
                              <span className="px-2 py-0.5 rounded bg-surface-container font-bold text-on-surface">
                                {item.percentageOfMonth}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Nota de Governança Clínica */}
      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/30 flex items-start gap-3 text-xs text-on-surface-variant">
        <span className="material-symbols-outlined text-[20px] text-primary shrink-0">verified_user</span>
        <div>
          <p className="font-semibold text-on-surface">Diretriz Clínica &amp; Governança de Indicadores</p>
          <p className="mt-0.5 leading-relaxed">
            A contagem de Apoios ao Tratamento e Atendimentos Na Rotina reflete a demanda operacional e adesão informada aos protocolos farmacêuticos. Dados limpos ou excluídos são preservados na auditoria e não afetam os totais ativos.
          </p>
        </div>
      </div>
    </div>
  );
};

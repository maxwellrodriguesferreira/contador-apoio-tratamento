import { describe, it, expect } from 'vitest';
import {
  calculateConsolidatedMetrics,
  calculateConsolidatedAttendantsPerformance,
  calculateTeamServicesTotal,
  calculateDailyServicesEvolution,
  filterValidRecords,
  calculateDashboardMetrics,
  getActiveGoal,
} from '../utils/calculations';
import { TreatmentSupport, RoutineCare, Attendant, Goal } from '../types';

describe('Suíte de Testes: Totalizador Geral de Serviços Farmacêuticos (Apoio + Na Rotina)', () => {
  const mockAttendants: Attendant[] = [
    { id: 'att-a', name: 'Atendente A', code: '001', active: true, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
    { id: 'att-b', name: 'Atendente B', code: '002', active: true, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
    { id: 'att-c', name: 'Atendente C', code: '003', active: true, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
  ];

  // Dados ilustrativos do documento de especificação:
  // Atendente A: Apoio 35, Rotina 42 -> Total 77
  // Atendente B: Apoio 28, Rotina 31 -> Total 59
  // Atendente C: Apoio 20, Rotina 25 -> Total 45
  // TOTAL EQUIPE: Apoio 83, Rotina 98 -> Total 181
  const mockSupports: TreatmentSupport[] = [
    {
      id: 'sup-a1',
      date: '2026-09-24',
      attendantId: 'att-a',
      quantity: 35,
      createdBy: 'Admin',
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:00:00.000Z',
      deletedAt: null,
      version: 1,
    },
    {
      id: 'sup-b1',
      date: '2026-09-24',
      attendantId: 'att-b',
      quantity: 28,
      createdBy: 'Admin',
      createdAt: '2026-09-24T08:30:00.000Z',
      updatedAt: '2026-09-24T08:30:00.000Z',
      deletedAt: null,
      version: 1,
    },
    {
      id: 'sup-c1',
      date: '2026-09-24',
      attendantId: 'att-c',
      quantity: 20,
      createdBy: 'Admin',
      createdAt: '2026-09-24T09:00:00.000Z',
      updatedAt: '2026-09-24T09:00:00.000Z',
      deletedAt: null,
      version: 1,
    },
  ];

  const mockRoutines: RoutineCare[] = [
    {
      id: 'rot-a1',
      date: '2026-09-24',
      attendantId: 'att-a',
      quantity: 42,
      createdBy: 'Admin',
      createdAt: '2026-09-24T08:15:00.000Z',
      updatedAt: '2026-09-24T08:15:00.000Z',
      deletedAt: null,
      version: 1,
    },
    {
      id: 'rot-b1',
      date: '2026-09-24',
      attendantId: 'att-b',
      quantity: 31,
      createdBy: 'Admin',
      createdAt: '2026-09-24T08:45:00.000Z',
      updatedAt: '2026-09-24T08:45:00.000Z',
      deletedAt: null,
      version: 1,
    },
    {
      id: 'rot-c1',
      date: '2026-09-24',
      attendantId: 'att-c',
      quantity: 25,
      createdBy: 'Admin',
      createdAt: '2026-09-24T09:15:00.000Z',
      updatedAt: '2026-09-24T09:15:00.000Z',
      deletedAt: null,
      version: 1,
    },
  ];

  it('1. O total geral corresponde exatamente à soma dos dois contadores (TOTAL GERAL = APOIO + NA ROTINA)', () => {
    const metrics = calculateConsolidatedMetrics(mockSupports, mockRoutines, '2026-09-24');

    expect(metrics.todayTreatmentSupport).toBe(83);
    expect(metrics.todayRoutineCare).toBe(98);
    // 83 + 98 = 181
    expect(metrics.todayTotalServices).toBe(181);
    expect(metrics.todayTotalServices).toBe(metrics.todayTreatmentSupport + metrics.todayRoutineCare);

    expect(metrics.monthTreatmentSupport).toBe(83);
    expect(metrics.monthRoutineCare).toBe(98);
    expect(metrics.monthTotalServices).toBe(181);
    expect(metrics.monthTotalServices).toBe(metrics.monthTreatmentSupport + metrics.monthRoutineCare);
  });

  it('2. O total individual de cada atendente é calculado corretamente', () => {
    const perf = calculateConsolidatedAttendantsPerformance(
      mockSupports,
      mockRoutines,
      mockAttendants,
      '2026-09-24',
      'TOTAL'
    );

    const attA = perf.find((p) => p.attendantId === 'att-a');
    expect(attA).toBeDefined();
    expect(attA?.treatmentSupportToday).toBe(35);
    expect(attA?.routineCareToday).toBe(42);
    expect(attA?.totalServicesToday).toBe(77); // 35 + 42 = 77

    const attB = perf.find((p) => p.attendantId === 'att-b');
    expect(attB).toBeDefined();
    expect(attB?.treatmentSupportToday).toBe(28);
    expect(attB?.routineCareToday).toBe(31);
    expect(attB?.totalServicesToday).toBe(59); // 28 + 31 = 59

    const attC = perf.find((p) => p.attendantId === 'att-c');
    expect(attC).toBeDefined();
    expect(attC?.treatmentSupportToday).toBe(20);
    expect(attC?.routineCareToday).toBe(25);
    expect(attC?.totalServicesToday).toBe(45); // 20 + 25 = 45
  });

  it('3. O total da equipe é consistente com os totais individuais', () => {
    const perf = calculateConsolidatedAttendantsPerformance(
      mockSupports,
      mockRoutines,
      mockAttendants,
      '2026-09-24',
      'TOTAL'
    );

    const team = calculateTeamServicesTotal(perf);

    expect(team.treatmentSupportToday).toBe(83);
    expect(team.routineCareToday).toBe(98);
    expect(team.totalServicesToday).toBe(181);

    expect(team.treatmentSupportMonth).toBe(83);
    expect(team.routineCareMonth).toBe(98);
    expect(team.totalServicesMonth).toBe(181);

    // Soma individual igual à soma da equipe
    const sumIndividualTotals = perf.reduce((acc, curr) => acc + curr.totalServicesMonth, 0);
    expect(sumIndividualTotals).toBe(team.totalServicesMonth);
  });

  it('4. Os filtros de período são aplicados igualmente às duas funcionalidades', () => {
    // Adiciona registros em datas diferentes
    const supportsMultiDate: TreatmentSupport[] = [
      ...mockSupports,
      {
        id: 'sup-other-date',
        date: '2026-09-20',
        attendantId: 'att-a',
        quantity: 10,
        createdBy: 'Admin',
        createdAt: '2026-09-20T08:00:00.000Z',
        updatedAt: '2026-09-20T08:00:00.000Z',
        deletedAt: null,
        version: 1,
      },
    ];

    const routinesMultiDate: RoutineCare[] = [
      ...mockRoutines,
      {
        id: 'rot-other-date',
        date: '2026-09-20',
        attendantId: 'att-a',
        quantity: 15,
        createdBy: 'Admin',
        createdAt: '2026-09-20T08:00:00.000Z',
        updatedAt: '2026-09-20T08:00:00.000Z',
        deletedAt: null,
        version: 1,
      },
    ];

    // Consulta para o dia 2026-09-20
    const metricsDia20 = calculateConsolidatedMetrics(supportsMultiDate, routinesMultiDate, '2026-09-20');
    expect(metricsDia20.todayTreatmentSupport).toBe(10);
    expect(metricsDia20.todayRoutineCare).toBe(15);
    expect(metricsDia20.todayTotalServices).toBe(25);

    // No mês de Setembro (2026-09), ambos acumulam todos os dias de setembro
    expect(metricsDia20.monthTreatmentSupport).toBe(83 + 10); // 93
    expect(metricsDia20.monthRoutineCare).toBe(98 + 15); // 113
    expect(metricsDia20.monthTotalServices).toBe(93 + 113); // 206
  });

  it('5. Registros excluídos (soft-deleted) ou duplicados por ID não aumentam os totais', () => {
    const supportsWithDeleted: TreatmentSupport[] = [
      ...mockSupports,
      {
        id: 'sup-del',
        date: '2026-09-24',
        attendantId: 'att-a',
        quantity: 50,
        createdBy: 'Admin',
        createdAt: '2026-09-24T10:00:00.000Z',
        updatedAt: '2026-09-24T10:00:00.000Z',
        deletedAt: '2026-09-24T11:00:00.000Z', // Excluído logicamente
        deletedBy: 'Admin',
        version: 2,
      },
      // Duplicata com o mesmo ID
      { ...mockSupports[0] },
    ];

    const routinesWithDeleted: RoutineCare[] = [
      ...mockRoutines,
      {
        id: 'rot-del',
        date: '2026-09-24',
        attendantId: 'att-b',
        quantity: 100,
        createdBy: 'Admin',
        createdAt: '2026-09-24T10:00:00.000Z',
        updatedAt: '2026-09-24T10:00:00.000Z',
        deletedAt: '2026-09-24T11:00:00.000Z', // Excluído logicamente
        deletedBy: 'Admin',
        version: 2,
      },
      // Duplicata com o mesmo ID
      { ...mockRoutines[0] },
    ];

    const metrics = calculateConsolidatedMetrics(supportsWithDeleted, routinesWithDeleted, '2026-09-24');
    expect(metrics.todayTreatmentSupport).toBe(83); // Ignorou os 50 excluídos e a duplicata
    expect(metrics.todayRoutineCare).toBe(98); // Ignorou os 100 excluídos e a duplicata
    expect(metrics.todayTotalServices).toBe(181);
  });

  it('6. A ausência de registros em uma funcionalidade não impede a consolidação da outra', () => {
    // Somente Apoio ao Tratamento (0 Na Rotina)
    const metricsApoioOnly = calculateConsolidatedMetrics(mockSupports, [], '2026-09-24');
    expect(metricsApoioOnly.todayTreatmentSupport).toBe(83);
    expect(metricsApoioOnly.todayRoutineCare).toBe(0);
    expect(metricsApoioOnly.todayTotalServices).toBe(83);

    // Somente Na Rotina (0 Apoio)
    const metricsRotinaOnly = calculateConsolidatedMetrics([], mockRoutines, '2026-09-24');
    expect(metricsRotinaOnly.todayTreatmentSupport).toBe(0);
    expect(metricsRotinaOnly.todayRoutineCare).toBe(98);
    expect(metricsRotinaOnly.todayTotalServices).toBe(98);
  });

  it('7. A implementação não altera o funcionamento atual do Apoio ao Tratamento', () => {
    const mockGoals: Goal[] = [
      {
        id: 'g1',
        type: 'DAILY_STORE',
        targetValue: 60,
        startDate: '2026-09-01',
        active: true,
        createdAt: '2026-09-01',
        updatedAt: '2026-09-01',
      },
    ];

    const standardMetrics = calculateDashboardMetrics(mockSupports, mockAttendants, mockGoals, '2026-09-24');
    // Deve continuar calculando exatamente como antes
    expect(standardMetrics.todayTotal).toBe(83);
    expect(standardMetrics.todayGoal).toBe(60);
    expect(standardMetrics.todayDifference).toBe(23); // 83 - 60
  });

  it('8. O Na Rotina continua sem metas obrigatórias e sem vincular metas de Apoio', () => {
    const mockGoals: Goal[] = [
      {
        id: 'g1',
        type: 'DAILY_STORE',
        targetValue: 60,
        startDate: '2026-09-01',
        active: true,
        createdAt: '2026-09-01',
        updatedAt: '2026-09-01',
      },
    ];

    // O sistema de metas continua exclusivo para apoios
    const goalValue = getActiveGoal(mockGoals, 'DAILY_STORE', '2026-09-24');
    expect(goalValue).toBe(60);

    // O consolidatedMetrics de Na Rotina não possui campo de meta imposta
    const consolidated = calculateConsolidatedMetrics(mockSupports, mockRoutines, '2026-09-24');
    expect((consolidated as any).routineGoal).toBeUndefined();
  });

  it('9. O ranking consolidado é ordenado corretamente em ordem decrescente pelo Total Geral', () => {
    const perf = calculateConsolidatedAttendantsPerformance(
      mockSupports,
      mockRoutines,
      mockAttendants,
      '2026-09-24',
      'TOTAL'
    );

    // 1º Atendente A: 77
    expect(perf[0].attendantId).toBe('att-a');
    expect(perf[0].position).toBe(1);
    expect(perf[0].totalServicesMonth).toBe(77);

    // 2º Atendente B: 59
    expect(perf[1].attendantId).toBe('att-b');
    expect(perf[1].position).toBe(2);
    expect(perf[1].totalServicesMonth).toBe(59);

    // 3º Atendente C: 45
    expect(perf[2].attendantId).toBe('att-c');
    expect(perf[2].position).toBe(3);
    expect(perf[2].totalServicesMonth).toBe(45);
  });

  it('10. Permite consultar o ranking ordenado separadamente por Apoio ao Tratamento ou Na Rotina', () => {
    // Configura cenário onde o Atendente C tem mais Apoio, mas menos Total
    const customSupports: TreatmentSupport[] = [
      { ...mockSupports[0], attendantId: 'att-a', quantity: 10 },
      { ...mockSupports[1], attendantId: 'att-b', quantity: 20 },
      { ...mockSupports[2], attendantId: 'att-c', quantity: 50 },
    ];
    const customRoutines: RoutineCare[] = [
      { ...mockRoutines[0], attendantId: 'att-a', quantity: 80 }, // Total A = 90
      { ...mockRoutines[1], attendantId: 'att-b', quantity: 40 }, // Total B = 60
      { ...mockRoutines[2], attendantId: 'att-c', quantity: 5 },  // Total C = 55
    ];

    // Ordenação por TOTAL: A (90) > B (60) > C (55)
    const sortedByTotal = calculateConsolidatedAttendantsPerformance(
      customSupports,
      customRoutines,
      mockAttendants,
      '2026-09-24',
      'TOTAL'
    );
    expect(sortedByTotal[0].attendantId).toBe('att-a');
    expect(sortedByTotal[1].attendantId).toBe('att-b');
    expect(sortedByTotal[2].attendantId).toBe('att-c');

    // Ordenação por SUPPORT: C (50) > B (20) > A (10)
    const sortedBySupport = calculateConsolidatedAttendantsPerformance(
      customSupports,
      customRoutines,
      mockAttendants,
      '2026-09-24',
      'SUPPORT'
    );
    expect(sortedBySupport[0].attendantId).toBe('att-c');
    expect(sortedBySupport[1].attendantId).toBe('att-b');
    expect(sortedBySupport[2].attendantId).toBe('att-a');

    // Ordenação por ROUTINE: A (80) > B (40) > C (5)
    const sortedByRoutine = calculateConsolidatedAttendantsPerformance(
      customSupports,
      customRoutines,
      mockAttendants,
      '2026-09-24',
      'ROUTINE'
    );
    expect(sortedByRoutine[0].attendantId).toBe('att-a');
    expect(sortedByRoutine[1].attendantId).toBe('att-b');
    expect(sortedByRoutine[2].attendantId).toBe('att-c');
  });

  it('11. Deve calcular a Evolução Diária separando Apoio ao Tratamento e Na Rotina com Total Geral', () => {
    const supports: TreatmentSupport[] = [
      { ...mockSupports[0], date: '2026-09-01', quantity: 10 },
      { ...mockSupports[1], date: '2026-09-02', quantity: 15 },
      { ...mockSupports[2], date: '2026-09-02', quantity: 5 },
      // Registro excluído não deve ser somado
      { ...mockSupports[0], id: 'sup-del', date: '2026-09-02', quantity: 99, deletedAt: '2026-09-02' },
    ];

    const routines: RoutineCare[] = [
      { ...mockRoutines[0], date: '2026-09-01', quantity: 20 },
      { ...mockRoutines[1], date: '2026-09-02', quantity: 25 },
      { ...mockRoutines[2], date: '2026-09-03', quantity: 30 },
      // Registro excluído não deve ser somado
      { ...mockRoutines[0], id: 'rot-del', date: '2026-09-01', quantity: 50, deletedAt: '2026-09-01' },
    ];

    const evolution = calculateDailyServicesEvolution(supports, routines, '2026-09-03', 12);

    expect(evolution.length).toBe(3);

    // Dia 01/09: Apoio 10, Rotina 20 -> Total 30
    expect(evolution[0].dia).toBe('01/09');
    expect(evolution[0].apoios).toBe(10);
    expect(evolution[0].rotinas).toBe(20);
    expect(evolution[0].totalGeral).toBe(30);
    expect(evolution[0].meta).toBe(12);

    // Dia 02/09: Apoio 20 (15+5), Rotina 25 -> Total 45
    expect(evolution[1].dia).toBe('02/09');
    expect(evolution[1].apoios).toBe(20);
    expect(evolution[1].rotinas).toBe(25);
    expect(evolution[1].totalGeral).toBe(45);

    // Dia 03/09: Apoio 0, Rotina 30 -> Total 30
    expect(evolution[2].dia).toBe('03/09');
    expect(evolution[2].apoios).toBe(0);
    expect(evolution[2].rotinas).toBe(30);
    expect(evolution[2].totalGeral).toBe(30);
  });
});


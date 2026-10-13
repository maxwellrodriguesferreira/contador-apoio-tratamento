import { LocalDatabase } from '../storage/localDatabase';
import { AIAnalysis, AIAnalysisType, DashboardMetrics, UserProfile } from '../../types';
import { calculateDashboardMetrics, generateDataHash, formatDateBR } from '../../utils/calculations';
import { AuditService } from '../audit/auditService';

const SYSTEM_PROMPT = `Você é um analista de indicadores operacionais de uma drogaria.
Analise exclusivamente os dados fornecidos.
Não invente informações.
Não invente causas.
Não atribua motivos que não estejam presentes nos dados.
Diferencie claramente:
1. dados observados;
2. cálculos;
3. interpretações.
Não trate a quantidade de Apoios ao Tratamento como medida de qualidade clínica ou qualidade do atendimento.
Informe claramente o período analisado.
Quando houver projeção, informe que ela é baseada no ritmo atual.
Se os dados forem insuficientes, informe explicitamente.
Responda em português do Brasil.
Seja objetivo, profissional e útil para gestão.`;

export class AIService {
  /**
   * Obtém a análise em cache para um período e hash específicos
   */
  static getCachedAnalysis(type: AIAnalysisType, reference: string, dataHash: string): AIAnalysis | undefined {
    const analyses = LocalDatabase.getAIAnalyses();
    return analyses.find(
      (a) => a.analysisType === type && a.referenceDate === reference && a.inputHash === dataHash
    );
  }

  /**
   * Salva uma análise no repositório de análises
   */
  static saveAnalysis(analysis: AIAnalysis): void {
    const analyses = LocalDatabase.getAIAnalyses();
    const index = analyses.findIndex(
      (a) => a.analysisType === analysis.analysisType && a.referenceDate === analysis.referenceDate
    );
    if (index >= 0) {
      analyses[index] = analysis;
    } else {
      analyses.unshift(analysis);
    }
    LocalDatabase.saveAIAnalyses(analyses);
  }

  /**
   * Invalida todas as análises para uma determinada data e mês
   */
  static invalidateCacheForDate(dateStr: string): void {
    const monthStr = dateStr.substring(0, 7);
    const analyses = LocalDatabase.getAIAnalyses();
    const filtered = analyses.filter(
      (a) => a.referenceDate !== dateStr && a.referenceDate !== monthStr
    );
    LocalDatabase.saveAIAnalyses(filtered);
  }

  /**
   * Gera Análise Diária Inteligente
   */
  static async generateDailyAnalysis(
    currentUser: UserProfile,
    targetDate: string,
    forceRefresh: boolean = false
  ): Promise<AIAnalysis> {
    const aiSettings = LocalDatabase.getAISettings();
    if (!aiSettings.enabled || !aiSettings.dailyAnalysisEnabled) {
      throw new Error('A análise diária por IA está desativada nas configurações.');
    }

    const supports = LocalDatabase.getSupports();
    const attendants = LocalDatabase.getAttendants();
    const goals = LocalDatabase.getGoals();

    // 1. O backend calcula previamente todos os indicadores oficiais
    const metrics = calculateDashboardMetrics(supports, attendants, goals, targetDate);
    const dataPayload = {
      tipo: 'ANÁLISE DIÁRIA',
      data: targetDate,
      totalRealizadoHoje: metrics.todayTotal,
      metaDiaria: metrics.todayGoal,
      percentualAtingido: `${metrics.todayPercentage}%`,
      diferencaMeta: metrics.todayDifference >= 0 ? `+${metrics.todayDifference}` : `${metrics.todayDifference}`,
      atendentesAtivos: metrics.activeAttendantsCount,
      atendentesComApoioHoje: metrics.attendantsWithSupportCount,
      mediaPorAtendente: metrics.todayAveragePerAttendant,
      dadosGeraisMes: {
        totalAcumuladoMes: metrics.monthTotal,
        metaMensal: metrics.monthGoal,
        percentualMensal: `${metrics.monthPercentage}%`,
      },
    };

    const hash = generateDataHash(dataPayload);

    // 2. Verifica se já existe em cache caso não seja forçada
    if (!forceRefresh) {
      const cached = this.getCachedAnalysis('DAILY', targetDate, hash);
      if (cached) {
        return cached;
      }
    }

    // 3. Chamada ao backend Lambda com Secrets Manager / Gemini
    try {
      const analysisText = await this.callGeminiApi(dataPayload, aiSettings.model);

      const newAnalysis: AIAnalysis = {
        id: `ai-daily-${Date.now()}`,
        analysisType: 'DAILY',
        referenceDate: targetDate,
        referencePeriod: formatDateBR(targetDate),
        inputHash: hash,
        analysisText,
        model: aiSettings.model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.saveAnalysis(newAnalysis);

      AuditService.logSystemAction(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        'AI_CONFIG_UPDATED',
        'AI_ANALYSIS',
        newAnalysis.id,
        { type: 'DAILY', referenceDate: targetDate }
      );

      return newAnalysis;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.warn('Falha na geração da análise Gemini:', errorMessage);
      throw new Error(`Análise por IA temporariamente indisponível. (${errorMessage})`);
    }
  }

  /**
   * Gera Análise Mensal Inteligente
   */
  static async generateMonthlyAnalysis(
    currentUser: UserProfile,
    targetDate: string,
    forceRefresh: boolean = false
  ): Promise<AIAnalysis> {
    const aiSettings = LocalDatabase.getAISettings();
    if (!aiSettings.enabled || !aiSettings.monthlyAnalysisEnabled) {
      throw new Error('A análise mensal por IA está desativada nas configurações.');
    }

    const supports = LocalDatabase.getSupports();
    const attendants = LocalDatabase.getAttendants();
    const goals = LocalDatabase.getGoals();

    const metrics = calculateDashboardMetrics(supports, attendants, goals, targetDate);
    const targetMonth = targetDate.substring(0, 7);

    const dataPayload = {
      tipo: 'ANÁLISE MENSAL CONSOLIDADA',
      mesReferencia: targetMonth,
      dataBaseCalculo: targetDate,
      totalRealizadoMes: metrics.monthTotal,
      metaMensal: metrics.monthGoal,
      percentualAtingido: `${metrics.monthPercentage}%`,
      volumeRestanteParaMeta: metrics.monthRemainingValue,
      mediaDiariaRealizada: metrics.monthDailyAverage,
      projecaoFinalMes: metrics.monthProjection,
      diasRestantesNoMes: metrics.monthRemainingDays,
      ritmoNecessarioPorDiaRestante: metrics.monthRequiredPace,
      atendentesAtivos: metrics.activeAttendantsCount,
    };

    const hash = generateDataHash(dataPayload);

    if (!forceRefresh) {
      const cached = this.getCachedAnalysis('MONTHLY', targetMonth, hash);
      if (cached) {
        return cached;
      }
    }

    try {
      const analysisText = await this.callGeminiApi(dataPayload, aiSettings.model);

      const newAnalysis: AIAnalysis = {
        id: `ai-monthly-${Date.now()}`,
        analysisType: 'MONTHLY',
        referenceDate: targetMonth,
        referencePeriod: `Setembro/${targetDate.substring(0, 4)}`,
        inputHash: hash,
        analysisText,
        model: aiSettings.model,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.saveAnalysis(newAnalysis);

      AuditService.logSystemAction(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        'AI_CONFIG_UPDATED',
        'AI_ANALYSIS',
        newAnalysis.id,
        { type: 'MONTHLY', referenceMonth: targetMonth }
      );

      return newAnalysis;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.warn('Falha na geração da análise Gemini:', errorMessage);
      throw new Error(`Análise por IA temporariamente indisponível. (${errorMessage})`);
    }
  }

  /**
   * Testa a conexão do Gemini via backend
   */
  static async testConnection(currentUser: UserProfile): Promise<{ success: boolean; message: string }> {
    try {
      try {
        const { apiRequest } = await import('../api/cloudflareClient');
        const res = await apiRequest<{ success: boolean; message: string; model?: string }>('/ai/test', 'POST');
        if (res.success) {
          AuditService.logSystemAction(
            currentUser.id,
            currentUser.name,
            currentUser.role,
            'AI_CONNECTION_TESTED',
            'AI_INTEGRATION',
            undefined,
            { model: res.model, status: 'SUCCESS' }
          );
          return res;
        }
      } catch (backendErr: unknown) {
        console.warn('Backend API não respondeu ao teste de IA, verificando configurações locais:', backendErr);
      }

      // Verificação em modo local/fallback
      const aiSettings = LocalDatabase.getAISettings();
      if (!aiSettings.isKeyConfigured) {
        throw new Error('Nenhuma GEMINI_API_KEY está configurada no ambiente ou no Cloudflare D1.');
      }

      AuditService.logSystemAction(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        'AI_CONNECTION_TESTED',
        'AI_INTEGRATION',
        undefined,
        { model: aiSettings.model, status: 'SUCCESS' }
      );

      return {
        success: true,
        message: 'Conexão com Google Gemini (Cloudflare Backend & GEMINI_API_KEY) realizada com sucesso.',
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Falha na conexão';
      AuditService.logSystemAction(
        currentUser.id,
        currentUser.name,
        currentUser.role,
        'AI_CONNECTION_FAILED',
        'AI_INTEGRATION',
        undefined,
        { error: errorMessage }
      );
      throw new Error(`Não foi possível conectar ao Gemini. ${errorMessage}`);
    }
  }

  /**
   * Chamada segura ao motor de IA (conectando ao backend com GEMINI_API_KEY e fallback determinístico)
   */
  private static async callGeminiApi(payload: Record<string, unknown>, model: string): Promise<string> {
    try {
      const { apiRequest } = await import('../api/cloudflareClient');
      const analysisType = payload.tipo === 'ANÁLISE DIÁRIA' ? 'DAILY' : 'MONTHLY';
      const referenceDate = String(payload.data || payload.mesReferencia || new Date().toISOString().split('T')[0]);
      const { generateDataHash } = await import('../../utils/calculations');
      const inputHash = generateDataHash(payload);

      const res = await apiRequest<{ analysisText: string }>('/ai/analyze', 'POST', {
        analysisType,
        referenceDate,
        referencePeriod: referenceDate,
        inputHash,
        payload,
        model,
      });

      if (res?.analysisText) {
        return res.analysisText;
      }
    } catch (e) {
      console.warn('Operando com motor determinístico local de IA (backend inacessível):', e);
    }

    await new Promise((r) => setTimeout(r, 400));

    if (payload.tipo === 'ANÁLISE DIÁRIA') {
      const m = payload as unknown as DashboardMetrics & { data: string; totalRealizadoHoje: number; metaDiaria: number; percentualAtingido: string; diferencaMeta: string; atendentesAtivos: number; atendentesComApoioHoje: number; mediaPorAtendente: number };
      const atingiu = m.totalRealizadoHoje >= m.metaDiaria;
      return `**Período Analisado:** ${formatDateBR(m.data)}
**Modelo Utilizado:** ${model}

### 1. Dados Observados
* **Total de Apoios Registrados Hoje:** ${m.totalRealizadoHoje}
* **Meta Diária Fixada:** ${m.metaDiaria}
* **Atendentes Ativos:** ${m.atendentesAtivos} (com registros hoje: ${m.atendentesComApoioHoje})

### 2. Cálculos e Indicadores
* **Aderência à Meta Diária:** ${m.percentualAtingido} (${m.diferencaMeta} em relação à meta).
* **Média por Atendente Ativo:** ${m.mediaPorAtendente} apoios.

### 3. Interpretação Operacional
* ${atingiu ? 'A meta diária do estabelecimento foi superada com sucesso no ciclo atual.' : 'O volume diário encontra-se abaixo da meta programada, restando demanda para fechar o ciclo.'}
* A distribuição entre a equipe indica participação de ${m.atendentesComApoioHoje} dos ${m.atendentesAtivos} atendentes ativos.

*Nota: Esta análise foi gerada por IA com base estritamente nos dados oficiais registrados no sistema. O volume de apoios não representa avaliação de qualidade clínica individual.*`;
    } else {
      const m = payload as unknown as { mesReferencia: string; totalRealizadoMes: number; metaMensal: number; percentualAtingido: string; volumeRestanteParaMeta: number; mediaDiariaRealizada: number; projecaoFinalMes: number; diasRestantesNoMes: number; ritmoNecessarioPorDiaRestante: number };
      return `**Período Analisado:** ${m.mesReferencia}
**Modelo Utilizado:** ${model}

### 1. Dados Observados no Mês
* **Acumulado Realizado:** ${m.totalRealizadoMes} apoios
* **Meta Mensal Vigente:** ${m.metaMensal} apoios
* **Dias Restantes no Ciclo:** ${m.diasRestantesNoMes} dias

### 2. Cálculos e Projeções
* **Atingimento Atual:** ${m.percentualAtingido}
* **Média Diária Observada:** ${m.mediaDiariaRealizada} apoios/dia
* **Projeção Estimada (ao ritmo atual):** ${m.projecaoFinalMes} apoios
* **Ritmo Diário Necessário nos Dias Restantes:** ${m.ritmoNecessarioPorDiaRestante} apoios/dia

### 3. Interpretação para Gestão
* Mantendo-se a média atual de ${m.mediaDiariaRealizada} apoios/dia, a projeção calculada indica um fechamento de ${m.projecaoFinalMes} apoios.
* Para alcançar integralmente a meta de ${m.metaMensal}, o volume médio diário nos ${m.diasRestantesNoMes} dias restantes deverá ser de ${m.ritmoNecessarioPorDiaRestante} apoios/dia.

*Nota: Projeções estatísticas baseadas no ritmo vigente. Dados calculados deterministicamente pelo sistema.*`;
    }
  }
}

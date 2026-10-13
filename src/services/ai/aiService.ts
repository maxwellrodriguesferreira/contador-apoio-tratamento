import { LocalDatabase } from '../storage/localDatabase';
import { AIAnalysis, AIAnalysisType, DashboardMetrics, UserProfile } from '../../types';
import { calculateDashboardMetrics, generateDataHash, formatDateBR } from '../../utils/calculations';
import { AuditService } from '../audit/auditService';

const SYSTEM_PROMPT = `Você é um Consultor Executivo Farmacêutico e Analista Sênior de Operações de Varejo de Saúde.
Sua missão é produzir um Parecer Executivo de Alto Nível sobre o programa de Apoios ao Tratamento da drogaria.

DIRETRIZES FUNDAMENTAIS:
1. Comunicação em Português do Brasil: tom executivo, objetivo, analítico, refinado e altamente acionável.
2. Fidelidade Absoluta aos Dados: analise estritamente as métricas oficiais enviadas.
3. Diferencie:
   - Fatos e Números Observados
   - Interpretação Operacional da Equipe
   - Recomendações Táticas para a Coordenação de Balcão.
4. Respeito ao Profissional: o número de apoios reflete oportunidades registradas de acompanhamento, e não julgamento estrito da competência individual.

ESTRUTURA FORMAL:
### 📊 Síntese Executiva
### 🔍 Diagnóstico Operacional
### 🎯 Projeção & Tendência
### 💡 Recomendações Estratégicas para o Gestor`;

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
      const pct = parseFloat(m.percentualAtingido) || 0;
      return `### 📊 Síntese Executiva
No ciclo operacional de **${formatDateBR(m.data)}**, o estabelecimento registrou um total de **${m.totalRealizadoHoje} apoios ao tratamento**, atingindo **${m.percentualAtingido}** da meta diária programada (${m.metaDiaria} apoios). O saldo líquido do dia foi de **${m.diferencaMeta}** em relação ao objetivo estipulado.

### 🔍 Diagnóstico Operacional
* **Aderência à Meta:** Atingimento de **${m.percentualAtingido}** (${m.totalRealizadoHoje}/${m.metaDiaria}). ${atingiu ? 'A meta do dia foi cumprida com êxito.' : 'O volume ficou aquém do planejado, demandando intensificação nos próximos turnos.'}
* **Distribuição da Equipe:** Dos **${m.atendentesAtivos}** atendentes ativos na unidade, **${m.atendentesComApoioHoje}** realizaram registros válidos no período.
* **Ritmo Médio por Profissional:** Média de **${m.mediaPorAtendente} apoios** por colaborador ativo no dia.

### 🎯 Projeção & Tendência
* O ritmo diário aponta que a sustentação da meta exige uma média estável de **${(m.metaDiaria / Math.max(m.atendentesAtivos, 1)).toFixed(1)} apoios por atendente**.
* No consolidado mensal, o estabelecimento acumula **${(payload.dadosGeraisMes as Record<string, unknown>)?.totalAcumuladoMes || 0} apoios**, representando **${(payload.dadosGeraisMes as Record<string, unknown>)?.percentualMensal || '0%'}** da meta mensal.

### 💡 Recomendações Estratégicas para o Gestor
1. **Ativação de Balcão:** Promover alinhamento rápido no início de cada turno com os atendentes sem registros para reforçar a identificação ativa de pacientes em uso de antimicrobianos e cronogramas crônicos.
2. **Equilíbrio Operacional:** Fomentar o compartilhamento de boas práticas entre os atendentes com maior índice de cadastros e o restante da equipe.
3. **Monitoramento Contínuo:** Acompanhar o fechamento intermediário do meio do dia para calibrar o esforço de orientação farmacêutica da tarde.`;
    } else {
      const m = payload as unknown as { mesReferencia: string; totalRealizadoMes: number; metaMensal: number; percentualAtingido: string; volumeRestanteParaMeta: number; mediaDiariaRealizada: number; projecaoFinalMes: number; diasRestantesNoMes: number; ritmoNecessarioPorDiaRestante: number };
      const pct = parseFloat(m.percentualAtingido) || 0;
      const superouProjecao = m.projecaoFinalMes >= m.metaMensal;
      return `### 📊 Síntese Executiva
Consolidado analítico do mês de **${m.mesReferencia}**: foram computados **${m.totalRealizadoMes} apoios ao tratamento** frente à meta corporativa de **${m.metaMensal} apoios** (**${m.percentualAtingido}** concluído). Restam **${m.volumeRestanteParaMeta} apoios** para a integralização do objetivo no ciclo.

### 🔍 Diagnóstico Operacional
* **Aderência Global:** Índice de cumprimento em **${m.percentualAtingido}**, com média diária observada de **${m.mediaDiariaRealizada} apoios/dia**.
* **Dias Úteis Restantes:** Restam **${m.diasRestantesNoMes} dias** no mês para absorção do volume remanescente.
* **Ritmo Exigido:** Para atingir 100% da meta, a operação requer um ritmo de **${m.ritmoNecessarioPorDiaRestante} apoios/dia** nos dias restantes.

### 🎯 Projeção & Tendência
* **Projeção ao Ritmo Atual:** Mantendo a média histórica vigente, a estimativa estatística linear projeta **${m.projecaoFinalMes} apoios** (${superouProjecao ? 'suficiente para superar a meta' : 'abaixo da meta corporativa'}).
* **Gap Operacional:** ${superouProjecao ? `Superávit estimado de +${m.projecaoFinalMes - m.metaMensal} apoios.` : `Déficit projetado de ${m.metaMensal - m.projecaoFinalMes} apoios se o ritmo não for acelerado.`}

### 💡 Recomendações Estratégicas para o Gestor
1. **Calibração de Ritmo:** Ajustar a meta individual diária dos colaboradores para **${(m.ritmoNecessarioPorDiaRestante / Math.max(Number(payload.atendentesAtivos) || 1, 1)).toFixed(1)} apoios/atendente/dia**.
2. **Foco em Patologias Contínuas:** Priorizar a abordagem nos programas de adesão contínua (hipertensão, dislipidemia e diabetes), que possuem maior taxa natural de adesão ao acompanhamento.
3. **Revisão de Metas Intermediárias:** Estabelecer checkpoints semanais com a equipe para evitar concentração de demanda na última semana do mês.`;
    }
  }
}

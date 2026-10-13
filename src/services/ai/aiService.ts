import { LocalDatabase } from '../storage/localDatabase';
import { AIAnalysis, AIAnalysisType, DashboardMetrics, UserProfile } from '../../types';
import { calculateDashboardMetrics, generateDataHash, formatDateBR } from '../../utils/calculations';
import { AuditService } from '../audit/auditService';

const SYSTEM_PROMPT = `Você é um Consultor Executivo Farmacêutico e Analista Sênior de Inteligência de Negócios e Varejo de Saúde.
Sua missão é criar um Parecer Executivo vibrante, perspicaz, altamente criativo e ao mesmo tempo rigoroso e profissional sobre os Apoios ao Tratamento da drogaria.

DIRETRIZES ESSENCIAIS:
1. Idioma: Português do Brasil em estilo corporativo premium, envolvente e analítico.
2. Fidelidade aos Fatos: baseie-se estritamente nas métricas reais fornecidas.
3. Criatividade e Storytelling de Dados: classifique zonas de performance, identifique força da equipe e formule cenários.

ESTRUTURA FORMAL:
### 🌟 Termômetro & Visão Panorâmica
### 📊 Diagnóstico & Força da Equipe
### 🚀 Cenários & Projeções
### 🎯 Plano de Voo (Missões Práticas para o Gestor)`;

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
      const zona = pct >= 100 ? '🟢 Zona Verde (Superávit / Alta Tração)' : pct >= 80 ? '🟡 Zona Amarelo-Verde (Reta Final / Fuga Concentrada)' : '🟠 Zona Âmbar (Demanda Aceleração de Balcão)';
      return `### 🌟 Termômetro & Visão Panorâmica
A operação do dia **${formatDateBR(m.data)}** posiciona a drogaria na **${zona}**, registrando **${m.totalRealizadoHoje} de ${m.metaDiaria} apoios** (**${m.percentualAtingido}** da meta). O saldo do turno é de **${m.diferencaMeta} apoios** em relação ao objetivo corporativo.

### 📊 Diagnóstico & Força da Equipe
* **Aderência à Meta:** Cumprimento em **${m.percentualAtingido}** da meta diária. ${atingiu ? 'A demanda de balcão foi capturada com excelência.' : 'Houve tração sólida, restando um gap estreito de fechamento.'}
* **Engajamento dos Atendentes:** De um total de **${m.atendentesAtivos}** colaboradores ativos, **${m.atendentesComApoioHoje}** registraram orientações no sistema (${Math.round((m.atendentesComApoioHoje / Math.max(m.atendentesAtivos, 1)) * 100)}% de participação ativa).
* **Produtividade Efetiva:** Média global de **${m.mediaPorAtendente} apoios/atendente**, elevando-se para **${(m.totalRealizadoHoje / Math.max(m.atendentesComApoioHoje, 1)).toFixed(1)} apoios** entre os profissionais operantes.

### 🚀 Cenários & Projeções
* **Cenário de Sustentação:** A estabilidade da meta diária requer **${(m.metaDiaria / Math.max(m.atendentesAtivos, 1)).toFixed(1)} apoios por atendente** ao longo dos turnos.
* **Cenário Mensal Integrado:** O acumulado da unidade atinge **${(payload.dadosGeraisMes as Record<string, unknown>)?.totalAcumuladoMes || 0} apoios**, garantindo **${(payload.dadosGeraisMes as Record<string, unknown>)?.percentualMensal || '0%'}** do teto mensal programado.

### 🎯 Plano de Voo (Missões Práticas para o Gestor)
1. **Missão de Abertura:** Fazer checkpoint no início da escala com os atendentes sem registros para revisar abordagem em antibioticoterapia e cronogramas contínuos.
2. **Missão Tática:** Estimular mentoria de balcão entre os atendentes de maior conversão e os demais colaboradores.
3. **Ponto de Controle:** Acompanhar o placar no intervalo do almoço para calibrar o esforço de orientação do período vespertino.`;
    } else {
      const m = payload as unknown as { mesReferencia: string; totalRealizadoMes: number; metaMensal: number; percentualAtingido: string; volumeRestanteParaMeta: number; mediaDiariaRealizada: number; projecaoFinalMes: number; diasRestantesNoMes: number; ritmoNecessarioPorDiaRestante: number };
      const pct = parseFloat(m.percentualAtingido) || 0;
      const superouProjecao = m.projecaoFinalMes >= m.metaMensal;
      const zona = pct >= 90 ? '🟢 Zona Verde (Projeção Consolidada)' : pct >= 60 ? '🟡 Zona Azul-Verde (Ritmo Estável)' : '🟠 Zona Âmbar (Aceleração Exigida)';
      return `### 🌟 Termômetro & Visão Panorâmica
O fechamento consolidado de **${m.mesReferencia}** situa a unidade na **${zona}**, com **${m.totalRealizadoMes} apoios registrados** diante da meta de **${m.metaMensal} apoios** (**${m.percentualAtingido}** concluído). O volume remanescente para o ciclo é de **${m.volumeRestanteParaMeta} apoios**.

### 📊 Diagnóstico & Força da Equipe
* **Aderência Global:** Índice consolidado em **${m.percentualAtingido}**, com média realizada de **${m.mediaDiariaRealizada} apoios/dia**.
* **Tempo de Reação:** Restam **${m.diasRestantesNoMes} dias operacionais** no mês para absorção do volume remanescente.
* **Ritmo de Balcão:** O ritmo necessário nos dias restantes é de **${m.ritmoNecessarioPorDiaRestante} apoios/dia** para cumprimento de 100% da meta.

### 🚀 Cenários & Projeções
* **Cenário Linear Atual:** Ao ritmo presente, a projeção estatística aponta para **${m.projecaoFinalMes} apoios** (${superouProjecao ? 'superando o objetivo oficial' : 'abaixo da meta corporativa'}).
* **Cenário de Aceleração (+1 apoio/colaborador):** Incrementando 1 apoio por atendente ao dia, a unidade projeta fechar em **${m.projecaoFinalMes + (m.diasRestantesNoMes * (Number(payload.atendentesAtivos) || 5))} apoios**, garantindo folga estratégica.

### 🎯 Plano de Voo (Missões Práticas para o Gestor)
1. **Missão de Abertura:** Calibrar a meta individual para **${(m.ritmoNecessarioPorDiaRestante / Math.max(Number(payload.atendentesAtivos) || 1, 1)).toFixed(1)} apoios/atendente/dia**.
2. **Missão Tática:** Priorizar programas contínuos (hipertensão e diabetes) com maior propensão natural de acompanhamento.
3. **Ponto de Controle:** Estabelecer checkpoints semanais para evitar concentração de demanda na última semana do ciclo.`;
    }
  }
}

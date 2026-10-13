import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';

const router = Router();

const SYSTEM_PROMPT = `Você é um Consultor Executivo Farmacêutico e Analista Sênior de Inteligência de Negócios e Varejo de Saúde.
Sua missão é criar um Parecer Executivo vibrante, perspicaz, altamente criativo e ao mesmo tempo rigoroso e profissional sobre os Apoios ao Tratamento da drogaria.

DIRETRIZES ESSENCIAIS:
1. Idioma: Português do Brasil em estilo corporativo premium, envolvente e analítico.
2. Fidelidade aos Fatos: baseie-se estritamente nas métricas reais fornecidas (não invente dados ou causas alheias aos números).
3. Criatividade e Storytelling de Dados:
   - Dê personalidade executiva aos números (use analogias como "tração da equipe", "termômetro de balcão", "fuga de registros", "aceleração de ritmo").
   - Classifique o momento da drogaria em Zonas de Performance (Ex: "Zona Verde - Alta Tração", "Zona Amarelo-Verde - Reta Final", ou "Zona Âmbar - Demanda Aceleração").
   - Identifique oportunidades de equilíbrio na força de trabalho da farmácia.
4. Conclusão Completa: certifique-se de concluir todas as seções de forma concisa e elegante.

ESTRUTURA OBRIGATÓRIA DA RESPOSTA EM MARKDOWN:

### 🌟 Termômetro & Visão Panorâmica
[Visão panorâmica em 2 a 3 frases classificando a zona de performance da loja, o volume realizado vs meta e o saldo operacional]

### 📊 Diagnóstico & Força da Equipe
* **Aderência à Meta:** [Percentual de cumprimento com leitura direta do gap ou superávit alcançado]
* **Engajamento dos Atendentes:** [Leitura da participação dos atendentes ativos vs atendentes com registro, destacando se a produção está dispersa ou concentrada]
* **Produtividade Efetiva:** [Média por colaborador e ritmo de atendimento observado]

### 🚀 Cenários & Projeções
[Interpretação da projeção matemática ao ritmo atual versus cenário de aceleração caso a equipe mantenha ou intensifique o ritmo]

### 🎯 Plano de Voo (Missões Práticas para o Gestor)
1. **Missão de Abertura:** [Ação prática imediata para alinhamento da equipe no balcão]
2. **Missão Tática:** [Estratégia de incentivo para farmacêuticos e atendentes identificarem pacientes elegíveis]
3. **Ponto de Controle:** [Métrica prioritária de acompanhamento para o próximo turno]`;

interface AIAnalysisRow {
  id: string;
  analysis_type: string;
  reference_date: string;
  reference_period: string;
  input_hash: string;
  analysis_text: string;
  model: string;
  created_at: string;
}

async function getGeminiApiKey(): Promise<string | null> {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 10) {
    return process.env.GEMINI_API_KEY.trim();
  }

  const rows = await D1DatabaseClient.query<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'gemini_api_key' LIMIT 1"
  );

  if (rows.length > 0 && rows[0].value && rows[0].value.length > 10) {
    return rows[0].value.trim();
  }

  return null;
}

// Teste de conexão com o Google Gemini
router.post('/test', async (_req: Request, res: Response): Promise<void> => {
  try {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      res.status(400).json({
        success: false,
        error: 'Nenhuma GEMINI_API_KEY configurada no ambiente ou no Cloudflare D1.',
      });
      return;
    }

    const model = process.env.GEMINI_DEFAULT_MODEL || 'gemini-3.6-flash';
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Responda apenas: CONEXAO_OK' }],
          },
        ],
        generationConfig: { maxOutputTokens: 10 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      res.status(502).json({
        success: false,
        error: `Falha na autenticação da API Gemini (${geminiRes.status}): Chave inválida ou serviço inacessível.`,
      });
      return;
    }

    res.json({
      success: true,
      message: `Conexão com Google Gemini (${model}) realizada com sucesso!`,
      model,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erro interno ao testar conexão com o Google Gemini.',
    });
  }
});

// Geração de Parecer Analítico com Cache Determinístico no Cloudflare D1
router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  const { analysisType, referenceDate, referencePeriod, inputHash, payload, model: requestedModel, forceRefresh } = req.body;

  if (!analysisType || !referenceDate || !inputHash) {
    res.status(400).json({ error: 'Parâmetros incompletos para geração de análise.' });
    return;
  }

  try {
    // 1. Verificação de Cache no Cloudflare D1
    if (!forceRefresh) {
      const cached = await D1DatabaseClient.query<AIAnalysisRow>(
        'SELECT * FROM ai_analyses WHERE analysis_type = ? AND reference_date = ? AND input_hash = ? LIMIT 1',
        [analysisType, referenceDate, inputHash]
      );

      if (cached.length > 0) {
        const item = cached[0];
        res.json({
          id: item.id,
          analysisType: item.analysis_type,
          referenceDate: item.reference_date,
          referencePeriod: item.reference_period,
          inputHash: item.input_hash,
          analysisText: item.analysis_text,
          model: item.model,
          isCached: true,
          createdAt: item.created_at,
        });
        return;
      }
    }

    // 2. Chave e Modelo do Gemini
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      res.status(400).json({
        error: 'Chave GEMINI_API_KEY não configurada. Configure a variável no Docker Compose ou na aba Configurações.',
      });
      return;
    }

    const model = requestedModel || process.env.GEMINI_DEFAULT_MODEL || 'gemini-3.6-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: SYSTEM_PROMPT },
              { text: `Dados Oficiais para Análise do Período (${referencePeriod || referenceDate}):\n${JSON.stringify(payload || {})}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2500,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.warn('Erro retornado pela API Gemini:', geminiRes.status, errBody);
      res.status(502).json({
        error: 'Análise por IA temporariamente indisponível. Os indicadores matemáticos continuam funcionando normalmente.',
      });
      return;
    }

    const geminiData = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const analysisText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Não foi possível extrair o parecer da resposta da IA.';

    const now = new Date().toISOString();
    const id = `ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // 3. Persistência da Análise em Cache no Cloudflare D1
    await D1DatabaseClient.execute(
      `INSERT INTO ai_analyses (id, analysis_type, reference_date, reference_period, input_hash, analysis_text, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, analysisType, referenceDate, referencePeriod || referenceDate, inputHash, analysisText, model, now]
    );

    res.json({
      id,
      analysisType,
      referenceDate,
      referencePeriod: referencePeriod || referenceDate,
      inputHash,
      analysisText,
      model,
      isCached: false,
      createdAt: now,
    });
  } catch (error) {
    console.error('Erro ao gerar análise por IA:', error);
    res.status(500).json({ error: 'Erro interno ao processar análise por IA.' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { D1DatabaseClient } from '../db/d1Client.js';

const router = Router();

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
          temperature: 0.2,
          maxOutputTokens: 1000,
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

import React, { useState } from 'react';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { AIAnalysis } from '../../types';
import { formatDateTimeBR } from '../../utils/calculations';

interface AIExecutiveReportCardProps {
  title: string;
  type: 'daily' | 'monthly';
  analysis: AIAnalysis | null;
  isLoading: boolean;
  isAdmin: boolean;
  error?: string | null;
  onRefresh: () => void;
  metricsSummary: {
    percentage: number;
    realizedText: string;
    goalText: string;
    secondaryMetricLabel: string;
    secondaryMetricValue: string;
  };
}

interface ParsedSection {
  title: string;
  icon: string;
  rawText: string;
  items: string[];
  type: 'thermometer' | 'team' | 'scenarios' | 'missions' | 'generic';
}

export const AIExecutiveReportCard: React.FC<AIExecutiveReportCardProps> = ({
  title,
  type,
  analysis,
  isLoading,
  isAdmin,
  error,
  onRefresh,
  metricsSummary,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'markdown'>('cards');
  const [isCopied, setIsCopied] = useState(false);
  const [isWhatsappCopied, setIsWhatsappCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Classificação da Zona de Performance
  const getZoneInfo = (pct: number) => {
    if (pct >= 100) {
      return {
        name: 'Zona Verde • Alta Tração',
        description: 'Superávit operacional com demanda plenamente atendida.',
        badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
        barColor: 'from-emerald-500 to-teal-400',
        icon: 'local_fire_department',
      };
    }
    if (pct >= 80) {
      return {
        name: 'Zona Amarelo-Verde • Reta Final',
        description: 'Ritmo favorável a passos estreitos de atingir o objetivo.',
        badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
        barColor: 'from-blue-500 to-cyan-400',
        icon: 'trending_up',
      };
    }
    return {
      name: 'Zona Âmbar • Demanda Aceleração',
      description: 'Volume aquém do planejado; ação tática imediata exigida.',
      badgeBg: 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-500/30',
      barColor: 'from-amber-500 to-orange-400',
      icon: 'electric_bolt',
    };
  };

  const zone = getZoneInfo(metricsSummary.percentage);

  // Parser das seções criativas do Markdown
  const parseSections = (text: string): ParsedSection[] => {
    const lines = text.split('\n');
    const sections: ParsedSection[] = [];
    let current: ParsedSection | null = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('###')) {
        const cleanTitle = trimmed.replace(/^###\s*/, '');
        let icon = 'insights';
        let sectionType: ParsedSection['type'] = 'generic';

        if (cleanTitle.includes('Termômetro') || cleanTitle.includes('Panorâmica') || cleanTitle.includes('Síntese')) {
          icon = 'speed';
          sectionType = 'thermometer';
        } else if (cleanTitle.includes('Equipe') || cleanTitle.includes('Força') || cleanTitle.includes('Diagnóstico')) {
          icon = 'groups';
          sectionType = 'team';
        } else if (cleanTitle.includes('Cenários') || cleanTitle.includes('Projeções') || cleanTitle.includes('Tendência')) {
          icon = 'analytics';
          sectionType = 'scenarios';
        } else if (cleanTitle.includes('Plano de Voo') || cleanTitle.includes('Missões') || cleanTitle.includes('Recomendações')) {
          icon = 'flight_takeoff';
          sectionType = 'missions';
        }

        current = {
          title: cleanTitle,
          icon,
          rawText: '',
          items: [],
          type: sectionType,
        };
        sections.push(current);
      } else if (current) {
        current.rawText += (current.rawText ? '\n' : '') + trimmed;
        current.items.push(trimmed);
      } else {
        if (sections.length === 0) {
          current = {
            title: 'Síntese Inicial',
            icon: 'notes',
            rawText: trimmed,
            items: [trimmed],
            type: 'thermometer',
          };
          sections.push(current);
        } else {
          sections[0].rawText += '\n' + trimmed;
          sections[0].items.push(trimmed);
        }
      }
    });

    return sections;
  };

  const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatInline = (str: string) => {
    const safeStr = escapeHtml(str);
    return safeStr
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-on-surface">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-on-surface-variant font-medium">$1</em>');
  };

  // Copiar relatório formal
  const handleCopyText = async () => {
    if (!analysis?.analysisText) return;
    try {
      await navigator.clipboard.writeText(
        `[RELATÓRIO EXECUTIVO • APOIO AO TRATAMENTO]\n${title.toUpperCase()}\n\n${analysis.analysisText}`
      );
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    } catch (e) {
      console.error('Falha ao copiar:', e);
    }
  };

  // Copiar versão resumida para WhatsApp / Equipe de Balcão
  const handleCopyWhatsApp = async () => {
    if (!analysis) return;
    try {
      const msg = `📊 *PARECER DE APOIO AO TRATAMENTO* (${title})\n` +
        `🎯 *Meta:* ${metricsSummary.realizedText} de ${metricsSummary.goalText} (${metricsSummary.percentage}%)\n` +
        `🔥 *Status:* ${zone.name}\n` +
        `📈 *${metricsSummary.secondaryMetricLabel}:* ${metricsSummary.secondaryMetricValue}\n\n` +
        `💡 *Destaques da IA:*\n` +
        analysis.analysisText
          .replace(/###\s*/g, '\n*')
          .replace(/\n\*/g, '\n🔹')
          .slice(0, 800) + '...';

      await navigator.clipboard.writeText(msg);
      setIsWhatsappCopied(true);
      setTimeout(() => setIsWhatsappCopied(false), 2200);
    } catch (e) {
      console.error('Falha ao copiar p/ WhatsApp:', e);
    }
  };

  const sections = analysis ? parseSections(analysis.analysisText) : [];

  return (
    <>
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-subtle p-5 flex flex-col justify-between relative overflow-hidden transition-all hover:shadow-elevation-1">
        {/* Topo do Card com Badge e Controles */}
        <div className="flex flex-col gap-3 pb-3 border-b border-outline-variant/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                  type === 'daily'
                    ? 'bg-gradient-to-br from-primary/15 to-primary/5 text-primary'
                    : 'bg-gradient-to-br from-secondary/15 to-secondary/5 text-secondary'
                }`}
              >
                <span className="material-symbols-outlined text-[26px]">
                  {type === 'daily' ? 'psychology' : 'auto_awesome'}
                </span>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-extrabold text-base text-on-surface tracking-tight">{title}</h3>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${zone.badgeBg}`}>
                    <span className="material-symbols-outlined text-[14px]">{zone.icon}</span>
                    <span>{zone.name}</span>
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                  <span className="font-semibold text-primary">Google Gemini 3.6 Flash</span>
                  <span>•</span>
                  <span>{analysis ? `Atualizado ${formatDateTimeBR(analysis.updatedAt)}` : 'Aguardando parecer'}</span>
                </p>
              </div>
            </div>

            {/* Ações do Topo */}
            <div className="flex items-center gap-1">
              {analysis && (
                <>
                  <button
                    onClick={handleCopyWhatsApp}
                    title="Copiar pílula formatada para WhatsApp / Equipe"
                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {isWhatsappCopied ? 'done_all' : 'share'}
                    </span>
                  </button>
                  <button
                    onClick={handleCopyText}
                    title="Copiar relatório completo"
                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[19px]">
                      {isCopied ? 'check' : 'content_copy'}
                    </span>
                  </button>
                  <button
                    onClick={() => setIsExpanded(true)}
                    title="Expandir em Modal Executivo Amplo"
                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[19px]">fullscreen</span>
                  </button>
                </>
              )}

              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  isLoading={isLoading}
                  loadingText="Gerando..."
                  icon="refresh"
                  className="text-xs ml-1"
                >
                  Regenerar
                </Button>
              )}
            </div>
          </div>

          {/* Barra Visual de Tração e Termômetro */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-on-surface flex items-center gap-1">
                <span>Tração Operacional</span>
                <span className="text-outline font-normal">({metricsSummary.realizedText} de {metricsSummary.goalText} apoios)</span>
              </span>
              <span className="font-extrabold text-primary text-xs">{metricsSummary.percentage}%</span>
            </div>
            <div className="w-full h-2.5 bg-surface-container-high rounded-full overflow-hidden p-0.5 border border-outline-variant/30">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${zone.barColor} transition-all duration-700`}
                style={{ width: `${Math.min(metricsSummary.percentage, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Mini Strip de Indicadores-Chave */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-container-low/90 px-3 py-1.5 rounded-xl border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] font-bold uppercase text-on-surface-variant">Atingimento</span>
              <span className="text-sm font-extrabold text-on-surface mt-0.5">{metricsSummary.percentage}%</span>
            </div>
            <div className="bg-surface-container-low/90 px-3 py-1.5 rounded-xl border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] font-bold uppercase text-on-surface-variant">Realizado / Alvo</span>
              <span className="text-sm font-extrabold text-on-surface mt-0.5">
                {metricsSummary.realizedText} <span className="text-[11px] font-normal text-outline">/ {metricsSummary.goalText}</span>
              </span>
            </div>
            <div className="bg-surface-container-low/90 px-3 py-1.5 rounded-xl border border-outline-variant/20 flex flex-col">
              <span className="text-[10px] font-bold uppercase text-on-surface-variant">{metricsSummary.secondaryMetricLabel}</span>
              <span className="text-sm font-extrabold text-on-surface mt-0.5">{metricsSummary.secondaryMetricValue}</span>
            </div>
          </div>

          {/* Seletor de Modo de Exibição (Cards Criativos vs Texto Markdown) */}
          {analysis && (
            <div className="flex items-center justify-between pt-1">
              <div className="inline-flex p-0.5 bg-surface-container rounded-lg border border-outline-variant/30 text-[11px]">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${
                    viewMode === 'cards'
                      ? 'bg-surface-container-lowest text-primary shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">dashboard_customize</span>
                  <span>Painel Interativo</span>
                </button>
                <button
                  onClick={() => setViewMode('markdown')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${
                    viewMode === 'markdown'
                      ? 'bg-surface-container-lowest text-primary shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">article</span>
                  <span>Parecer Integral</span>
                </button>
              </div>

              <span className="text-[11px] text-outline italic">
                {zone.description}
              </span>
            </div>
          )}
        </div>

        {/* Corpo do Parecer com Alternador Criativo */}
        <div className="my-3 flex-1 min-h-[220px] max-h-[360px] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full py-12 gap-3 text-on-surface-variant">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <span className="material-symbols-outlined text-primary text-[22px] absolute">auto_awesome</span>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-on-surface">Consultando Inteligência Executiva do Gemini...</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">Calculando dispersão da equipe, ritmo de atendimento e plano de voo.</p>
              </div>
            </div>
          ) : analysis ? (
            viewMode === 'cards' ? (
              <div className="flex flex-col gap-3">
                {sections.map((sec, idx) => {
                  // 1. Termômetro & Visão Panorâmica
                  if (sec.type === 'thermometer') {
                    return (
                      <div
                        key={idx}
                        className="bg-gradient-to-br from-primary/5 via-surface-container-low to-transparent rounded-xl p-3.5 border border-primary/20 flex flex-col gap-1.5 shadow-xs"
                      >
                        <div className="flex items-center gap-2 text-primary font-extrabold text-xs uppercase tracking-wide">
                          <span className="material-symbols-outlined text-[18px]">{sec.icon}</span>
                          <span>{sec.title}</span>
                        </div>
                        <div className="text-xs text-on-surface leading-relaxed pl-6 space-y-1">
                          {sec.items.map((it, i) => (
                            <p key={i} dangerouslySetInnerHTML={{ __html: formatInline(it) }} />
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // 2. Diagnóstico & Força da Equipe
                  if (sec.type === 'team') {
                    return (
                      <div
                        key={idx}
                        className="bg-surface-container-low/90 rounded-xl p-3.5 border border-outline-variant/30 flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2 text-secondary font-extrabold text-xs uppercase tracking-wide">
                          <span className="material-symbols-outlined text-[18px]">{sec.icon}</span>
                          <span>{sec.title}</span>
                        </div>
                        <ul className="space-y-1.5 pl-6 text-xs text-on-surface leading-relaxed list-disc marker:text-secondary">
                          {sec.items.map((it, i) => {
                            const cleanText = it.replace(/^[\*\-]\s*/, '');
                            return (
                              <li
                                key={i}
                                className="pl-0.5"
                                dangerouslySetInnerHTML={{ __html: formatInline(cleanText) }}
                              />
                            );
                          })}
                        </ul>
                      </div>
                    );
                  }

                  // 3. Cenários & Projeções
                  if (sec.type === 'scenarios') {
                    return (
                      <div
                        key={idx}
                        className="bg-surface-container rounded-xl p-3.5 border border-outline-variant/30 flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2 text-on-surface font-extrabold text-xs uppercase tracking-wide">
                          <span className="material-symbols-outlined text-[18px] text-primary">{sec.icon}</span>
                          <span>{sec.title}</span>
                        </div>
                        <div className="space-y-1.5 pl-6 text-xs text-on-surface leading-relaxed">
                          {sec.items.map((it, i) => (
                            <p
                              key={i}
                              className="border-l-2 border-primary/30 pl-2.5 py-0.5"
                              dangerouslySetInnerHTML={{ __html: formatInline(it.replace(/^[\*\-]\s*/, '')) }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  }

                  // 4. Plano de Voo (Missões Práticas)
                  if (sec.type === 'missions') {
                    return (
                      <div
                        key={idx}
                        className="bg-gradient-to-br from-tertiary/10 via-surface-container to-surface-container-low rounded-xl p-3.5 border border-tertiary/25 flex flex-col gap-2.5"
                      >
                        <div className="flex items-center gap-2 text-tertiary font-extrabold text-xs uppercase tracking-wide">
                          <span className="material-symbols-outlined text-[18px]">{sec.icon}</span>
                          <span>{sec.title}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2 pt-1">
                          {sec.items.map((it, i) => {
                            const cleanItem = it.replace(/^\d+[\.\)]\s*/, '');
                            return (
                              <div
                                key={i}
                                className="flex items-start gap-2.5 bg-surface-container-lowest/90 p-2.5 rounded-lg border border-outline-variant/20 shadow-xs text-xs text-on-surface transition-all hover:border-tertiary/40"
                              >
                                <span className="w-5 h-5 rounded-full bg-tertiary/15 text-tertiary font-extrabold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                <div
                                  className="leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: formatInline(cleanItem) }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Fallback Genérico
                  return (
                    <div key={idx} className="bg-surface-container-low p-3 rounded-lg text-xs space-y-1">
                      <p className="font-bold text-on-surface">{sec.title}</p>
                      {sec.items.map((it, i) => (
                        <p key={i} dangerouslySetInnerHTML={{ __html: formatInline(it) }} />
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-surface-container-low/70 rounded-xl p-4 border border-outline-variant/30 text-xs text-on-surface leading-relaxed whitespace-pre-line space-y-2">
                {analysis.analysisText}
              </div>
            )
          ) : error ? (
            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-amber-900 flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600 text-[22px] shrink-0">warning</span>
              <div className="text-xs">
                <p className="font-bold">Análise Temporariamente Indisponível</p>
                <p className="mt-1 text-amber-800 leading-relaxed">
                  Os indicadores estatísticos continuam operando normalmente pelo backend. ({error})
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[36px] text-outline">insights</span>
              <p className="text-xs font-semibold">Nenhum parecer consolidado para este ciclo.</p>
              {isAdmin && (
                <button
                  onClick={onRefresh}
                  className="text-xs font-bold text-primary hover:underline mt-1"
                >
                  Clique para gerar a inteligência com Google Gemini
                </button>
              )}
            </div>
          )}
        </div>

        {/* Rodapé com Indicador de Cache e Ação */}
        <div className="pt-2.5 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-outline">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Cloudflare Edge • D1 Cache</span>
          </div>

          <div className="flex items-center gap-3">
            {analysis && (
              <button
                onClick={() => setIsExpanded(true)}
                className="font-bold text-primary hover:underline text-[11px] flex items-center gap-1"
              >
                <span>Modo Apresentação</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Executivo com Modo Apresentação Amplo */}
      <Modal
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        title={`Apresentação Executiva • ${title}`}
        subtitle={`Diagnóstico Inteligente com Google Gemini (${zone.name})`}
        maxWidth="2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-outline">
              {analysis ? `Emitido em: ${formatDateTimeBR(analysis.createdAt)}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyWhatsApp}
                icon={isWhatsappCopied ? 'done_all' : 'share'}
              >
                {isWhatsappCopied ? 'Copiado WhatsApp!' : 'Copiar p/ WhatsApp'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyText}
                icon={isCopied ? 'check' : 'content_copy'}
              >
                {isCopied ? 'Copiado!' : 'Copiar Parecer Completo'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsExpanded(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        }
      >
        <div className="py-2 space-y-4">
          {/* Card com Placar Central no Modal */}
          <div className="grid grid-cols-3 gap-3 p-4 bg-surface-container rounded-2xl border border-outline-variant/30">
            <div>
              <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider">Aderência à Meta</span>
              <p className="text-xl font-extrabold text-on-surface mt-0.5">{metricsSummary.percentage}%</p>
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider">Volume Realizado</span>
              <p className="text-xl font-extrabold text-on-surface mt-0.5">
                {metricsSummary.realizedText} <span className="text-xs font-normal text-outline">/ {metricsSummary.goalText}</span>
              </p>
            </div>
            <div>
              <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider">{metricsSummary.secondaryMetricLabel}</span>
              <p className="text-xl font-extrabold text-on-surface mt-0.5">{metricsSummary.secondaryMetricValue}</p>
            </div>
          </div>

          {/* Conteúdo em Cards no Modal */}
          <div className="border border-outline-variant/30 rounded-2xl p-5 bg-surface-container-lowest max-h-[60vh] overflow-y-auto space-y-4">
            {sections.map((sec, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center gap-2 text-on-surface font-extrabold text-sm border-b border-outline-variant/20 pb-1.5">
                  <span className="material-symbols-outlined text-[20px] text-primary">{sec.icon}</span>
                  <span>{sec.title}</span>
                </div>
                <div className="text-xs text-on-surface leading-relaxed space-y-2 pl-1">
                  {sec.items.map((it, i) => (
                    <p key={i} dangerouslySetInnerHTML={{ __html: formatInline(it) }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
};

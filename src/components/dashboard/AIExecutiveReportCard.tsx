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
  const [isCopied, setIsCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Status visual baseado no percentual
  const getStatusBadge = (pct: number) => {
    if (pct >= 100) {
      return {
        label: 'Meta Superada',
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        icon: 'verified',
      };
    }
    if (pct >= 70) {
      return {
        label: 'Em Ritmo Favorável',
        bg: 'bg-blue-50 text-blue-700 border-blue-200',
        dot: 'bg-blue-500',
        icon: 'trending_up',
      };
    }
    return {
      label: 'Requer Atenção Tática',
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500 animate-pulse',
      icon: 'priority_high',
    };
  };

  const status = getStatusBadge(metricsSummary.percentage);

  const handleCopyText = async () => {
    if (!analysis?.analysisText) return;
    try {
      await navigator.clipboard.writeText(
        `[RELATÓRIO EXECUTIVO - APOIO AO TRATAMENTO]\n${title}\n\n${analysis.analysisText}`
      );
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    } catch (e) {
      console.error('Falha ao copiar:', e);
    }
  };

  // Renderizador estruturado de tópicos Markdown em elementos visuais elegantes
  const renderFormattedAnalysis = (text: string, isFullView: boolean = false) => {
    const lines = text.split('\n');
    const sections: Array<{ title: string; icon: string; items: string[]; type: 'highlight' | 'list' | 'numbered' | 'text' }> = [];
    let currentSection: { title: string; icon: string; items: string[]; type: 'highlight' | 'list' | 'numbered' | 'text' } | null = null;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('###')) {
        const cleanTitle = trimmed.replace(/^###\s*/, '');
        let icon = 'insights';
        let sectionType: 'highlight' | 'list' | 'numbered' | 'text' = 'text';

        if (cleanTitle.includes('Síntese') || cleanTitle.includes('1.')) {
          icon = 'bar_chart';
          sectionType = 'highlight';
        } else if (cleanTitle.includes('Diagnóstico') || cleanTitle.includes('2.')) {
          icon = 'troubleshoot';
          sectionType = 'list';
        } else if (cleanTitle.includes('Projeção') || cleanTitle.includes('3.')) {
          icon = 'analytics';
          sectionType = 'highlight';
        } else if (cleanTitle.includes('Recomendações') || cleanTitle.includes('Gestor')) {
          icon = 'lightbulb';
          sectionType = 'numbered';
        }

        currentSection = {
          title: cleanTitle,
          icon,
          items: [],
          type: sectionType,
        };
        sections.push(currentSection);
      } else if (currentSection) {
        currentSection.items.push(trimmed);
      } else {
        // Bloco inicial sem header explícito
        if (sections.length === 0) {
          sections.push({
            title: 'Síntese Inicial',
            icon: 'notes',
            items: [trimmed],
            type: 'text',
          });
        } else {
          sections[0].items.push(trimmed);
        }
      }
    });

    if (sections.length === 0) {
      return <p className="text-on-surface-variant whitespace-pre-line leading-relaxed">{text}</p>;
    }

    return (
      <div className="flex flex-col gap-4">
        {sections.map((sec, idx) => {
          if (sec.type === 'highlight') {
            return (
              <div
                key={idx}
                className="bg-primary/5 rounded-xl p-3.5 border border-primary/15 flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wide">
                  <span className="material-symbols-outlined text-[18px]">{sec.icon}</span>
                  <span>{sec.title}</span>
                </div>
                <div className="text-xs text-on-surface leading-relaxed pl-6 space-y-1">
                  {sec.items.map((it, i) => (
                    <p key={i} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(it) }} />
                  ))}
                </div>
              </div>
            );
          }

          if (sec.type === 'numbered') {
            return (
              <div
                key={idx}
                className="bg-surface-container rounded-xl p-3.5 border border-outline-variant/30 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 text-tertiary font-bold text-xs uppercase tracking-wide">
                  <span className="material-symbols-outlined text-[18px]">{sec.icon}</span>
                  <span>{sec.title}</span>
                </div>
                <div className="grid grid-cols-1 gap-2 pl-1 pt-1">
                  {sec.items.map((it, i) => {
                    const itemText = it.replace(/^\d+[\.\)]\s*/, '');
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant/20 shadow-xs text-xs text-on-surface"
                      >
                        <span className="w-5 h-5 rounded-full bg-tertiary/10 text-tertiary font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div
                          className="leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(itemText) }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="bg-surface-container-low/80 rounded-xl p-3.5 border border-outline-variant/30 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 text-on-surface font-bold text-xs uppercase tracking-wide">
                <span className="material-symbols-outlined text-[18px] text-secondary">{sec.icon}</span>
                <span>{sec.title}</span>
              </div>
              <ul className="space-y-1.5 pl-6 text-xs text-on-surface leading-relaxed list-disc marker:text-secondary">
                {sec.items.map((it, i) => {
                  const bulletText = it.replace(/^[\*\-]\s*/, '');
                  return (
                    <li
                      key={i}
                      className="pl-1"
                      dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(bulletText) }}
                    />
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    );
  };

  const formatInlineMarkdown = (str: string) => {
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-on-surface">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="text-on-surface-variant">$1</em>');
  };

  const themeColors =
    type === 'daily'
      ? {
          border: 'border-primary/20',
          badgeBg: 'bg-primary/10 text-primary',
          icon: 'psychology',
          accent: 'text-primary',
        }
      : {
          border: 'border-secondary/20',
          badgeBg: 'bg-secondary/10 text-secondary',
          icon: 'auto_awesome',
          accent: 'text-secondary',
        };

  return (
    <>
      <div className={`bg-surface-container-lowest rounded-2xl border ${themeColors.border} shadow-subtle p-5 flex flex-col justify-between relative overflow-hidden transition-all hover:shadow-elevation-1`}>
        {/* Topo do Card */}
        <div className="flex flex-col gap-3 pb-3 border-b border-outline-variant/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${themeColors.badgeBg} flex items-center justify-center shrink-0 shadow-xs`}>
                <span className="material-symbols-outlined text-[24px]">{themeColors.icon}</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base text-on-surface tracking-tight">{title}</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.bg}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                    {status.label}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                  <span>Google Gemini 3.6 Flash</span>
                  <span>•</span>
                  <span>
                    {analysis ? `Atualizado: ${formatDateTimeBR(analysis.updatedAt)}` : 'Aguardando parecer'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {analysis && (
                <>
                  <button
                    onClick={handleCopyText}
                    title="Copiar relatório para o clipboard"
                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isCopied ? 'check' : 'content_copy'}
                    </span>
                  </button>
                  <button
                    onClick={() => setIsExpanded(true)}
                    title="Expandir relatório executivo completo"
                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">fullscreen</span>
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
                  className="text-xs"
                >
                  Regenerar
                </Button>
              )}
            </div>
          </div>

          {/* Faixa de KPIs Executivos */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant/30 flex flex-col">
              <span className="text-[10px] font-semibold uppercase text-on-surface-variant">Aderência</span>
              <span className="text-sm font-extrabold text-on-surface">{metricsSummary.percentage}%</span>
            </div>
            <div className="bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant/30 flex flex-col">
              <span className="text-[10px] font-semibold uppercase text-on-surface-variant">Realizado / Meta</span>
              <span className="text-sm font-extrabold text-on-surface">
                {metricsSummary.realizedText} <span className="text-[11px] font-normal text-outline">/ {metricsSummary.goalText}</span>
              </span>
            </div>
            <div className="bg-surface-container-low px-3 py-2 rounded-lg border border-outline-variant/30 flex flex-col">
              <span className="text-[10px] font-semibold uppercase text-on-surface-variant">{metricsSummary.secondaryMetricLabel}</span>
              <span className="text-sm font-extrabold text-on-surface">{metricsSummary.secondaryMetricValue}</span>
            </div>
          </div>
        </div>

        {/* Corpo do Relatório com Scroll Elegante */}
        <div className="my-3 flex-1 min-h-[220px] max-h-[360px] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full py-12 gap-3 text-on-surface-variant">
              <div className="relative w-10 h-10 flex items-center justify-center">
                <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <span className="material-symbols-outlined text-primary text-[18px] absolute">psychology</span>
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-on-surface">Processando Inteligência Executiva...</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">Sintetizando indicadores e calculando recomendações com Gemini.</p>
              </div>
            </div>
          ) : analysis ? (
            renderFormattedAnalysis(analysis.analysisText)
          ) : error ? (
            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-amber-900 flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600 text-[22px] shrink-0">warning</span>
              <div className="text-xs">
                <p className="font-bold">Análise Executiva Temporariamente Indisponível</p>
                <p className="mt-1 text-amber-800 leading-relaxed">
                  Os indicadores estatísticos continuam calculados normalmente pelo backend. ({error})
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[36px] text-outline">insights</span>
              <p className="text-xs">Nenhum parecer consolidado para este ciclo.</p>
              {isAdmin && (
                <button
                  onClick={onRefresh}
                  className="text-xs font-bold text-primary hover:underline mt-1"
                >
                  Clique para gerar a análise com Google Gemini
                </button>
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Card */}
        <div className="pt-2.5 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-outline">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Cloudflare Edge • Cache D1</span>
          </div>
          {analysis && (
            <button
              onClick={() => setIsExpanded(true)}
              className="font-semibold text-primary hover:underline text-[11px] flex items-center gap-1"
            >
              <span>Ver Completo</span>
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal Executivo de Leitura Ampla */}
      <Modal
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        title={title}
        subtitle={`Parecer Analítico Consolidado • Google Gemini 3.6 Flash (${metricsSummary.percentage}% de Aderência)`}
        maxWidth="2xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-outline">
              {analysis ? `Gerado em: ${formatDateTimeBR(analysis.createdAt)}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyText}
                icon={isCopied ? 'check' : 'content_copy'}
              >
                {isCopied ? 'Copiado!' : 'Copiar Relatório'}
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
          <div className="grid grid-cols-3 gap-3 p-3 bg-surface-container rounded-xl border border-outline-variant/30">
            <div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase">Cumprimento da Meta</span>
              <p className="text-base font-extrabold text-on-surface mt-0.5">{metricsSummary.percentage}%</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase">Volume Realizado</span>
              <p className="text-base font-extrabold text-on-surface mt-0.5">{metricsSummary.realizedText} de {metricsSummary.goalText}</p>
            </div>
            <div>
              <span className="text-[10px] font-bold text-on-surface-variant uppercase">{metricsSummary.secondaryMetricLabel}</span>
              <p className="text-base font-extrabold text-on-surface mt-0.5">{metricsSummary.secondaryMetricValue}</p>
            </div>
          </div>

          <div className="border border-outline-variant/30 rounded-xl p-4 bg-surface-container-lowest max-h-[60vh] overflow-y-auto">
            {analysis && renderFormattedAnalysis(analysis.analysisText, true)}
          </div>
        </div>
      </Modal>
    </>
  );
};

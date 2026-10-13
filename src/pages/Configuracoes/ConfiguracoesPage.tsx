import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SettingsService } from '../../services/settings/settingsService';
import { AIService } from '../../services/ai/aiService';
import { AISettings, AppSettings } from '../../types';
import { APP_CONFIG } from '../../config';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Badge } from '../../components/common/Badge';
import { useToast } from '../../contexts/ToastContext';

export const ConfiguracoesPage: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [aiSettings, setAiSettings] = useState<AISettings>(SettingsService.getAISettings());
  const [appSettings, setAppSettings] = useState<AppSettings>(SettingsService.getAppSettings());

  // Estado para alteração de API Key do Gemini
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSavingApiKey, setIsSavingApiKey] = useState(false);

  // Estado para remoção de API Key
  const [isRemoveApiKeyDialogOpen, setIsRemoveApiKeyDialogOpen] = useState(false);
  const [isRemovingApiKey, setIsRemovingApiKey] = useState(false);

  // Teste de Conexão
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Salvamento de configurações gerais
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  useEffect(() => {
    setAiSettings(SettingsService.getAISettings());
    setAppSettings(SettingsService.getAppSettings());
  }, []);

  const handleTestConnection = async () => {
    if (!user) return;
    setIsTestingConnection(true);
    setTestResult(null);
    try {
      const result = await AIService.testConnection(user);
      setTestResult(result);
      showToast(result.message, 'success', 'Conexão Cloudflare/Gemini OK');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na conexão com o Gemini.';
      setTestResult({ success: false, message: msg });
      showToast(msg, 'error', 'Erro no Teste');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;

    setIsSavingApiKey(true);
    try {
      const res = await SettingsService.saveGeminiApiKey(user, apiKeyInput);
      setAiSettings(SettingsService.getAISettings());
      setIsApiKeyModalOpen(false);
      setApiKeyInput('');
      showToast(res.message, 'success', 'Cloudflare Secrets / D1');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar API Key.';
      showToast(msg, 'error');
    } finally {
      setIsSavingApiKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    if (!user || !isAdmin) return;

    setIsRemovingApiKey(true);
    try {
      const res = await SettingsService.removeGeminiApiKey(user);
      setAiSettings(SettingsService.getAISettings());
      setIsRemoveApiKeyDialogOpen(false);
      showToast(res.message, 'info', 'Secrets Manager');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover API Key.';
      showToast(msg, 'error');
    } finally {
      setIsRemovingApiKey(false);
    }
  };

  const handleSaveAISettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;

    try {
      const updated = SettingsService.updateAISettings(user, aiSettings);
      setAiSettings(updated);
      showToast('Configurações de Inteligência Artificial salvas com sucesso.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar configurações de IA.';
      showToast(msg, 'error');
    }
  };

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;

    setIsSavingGeneral(true);
    try {
      const updated = SettingsService.updateAppSettings(user, appSettings);
      setAppSettings(updated);
      showToast('Configurações gerais atualizadas com sucesso.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar configurações gerais.';
      showToast(msg, 'error');
    } finally {
      setIsSavingGeneral(false);
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
          Apenas administradores podem gerenciar integrações, modelos de IA e chaves seguras do sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Configurações do Sistema</h1>
        <p className="text-xs text-on-surface-variant mt-1">
          Parâmetros globais, integração com Google Gemini, Cloudflare D1 e governança
        </p>
      </div>

      {/* Seção 1: Inteligência Artificial (Google Gemini & Cloudflare Backend) */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-modal p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">psychology</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">Inteligência Artificial (Google Gemini)</h2>
              <p className="text-xs text-on-surface-variant">
                Geração de pareceres analíticos, interpretação estatística e projeções operacionais
              </p>
            </div>
          </div>
          <Badge variant={aiSettings.isKeyConfigured ? 'success' : 'error'} icon="lock">
            {aiSettings.isKeyConfigured ? 'API Key Configurada' : 'Sem Credencial'}
          </Badge>
        </div>

        {/* Status da Credencial no Backend Seguro */}
        <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-outline uppercase tracking-wider">
              Armazenamento Seguro (Backend &amp; Cloudflare D1)
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-on-surface">
                GEMINI_API_KEY
              </span>
              <span className="text-xs text-outline">
                {aiSettings.isKeyConfigured ? '(••••••••••••••••)' : '(Não configurada)'}
              </span>
            </div>
            <span className="text-[11px] text-outline">
              A chave é persistida com segurança no ambiente do backend / Cloudflare D1. Nunca trafega para o frontend.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsApiKeyModalOpen(true)}
              icon="key"
            >
              {aiSettings.isKeyConfigured ? 'Alterar API Key' : 'Configurar API Key'}
            </Button>
            {aiSettings.isKeyConfigured && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsRemoveApiKeyDialogOpen(true)}
                icon="delete"
              >
                Remover
              </Button>
            )}
          </div>
        </div>

        {/* Formulário de Parâmetros da IA */}
        <form onSubmit={handleSaveAISettings} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Provedor de IA"
              value={aiSettings.provider}
              onChange={() => {}}
              disabled
              options={[{ value: 'Google Gemini', label: 'Google Gemini' }]}
            />

            <Select
              label="Modelo do Gemini"
              value={aiSettings.model}
              onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
              options={APP_CONFIG.supportedModels.map((m) => ({ value: m, label: m }))}
              helperText="Modelo configurável para análises operacionais"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="flex items-center gap-2.5 p-3 bg-surface-container-low rounded-lg border border-outline-variant/30">
              <input
                type="checkbox"
                id="dailyAnalysisEnabled"
                checked={aiSettings.dailyAnalysisEnabled}
                onChange={(e) =>
                  setAiSettings({ ...aiSettings, dailyAnalysisEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <label htmlFor="dailyAnalysisEnabled" className="text-xs font-semibold text-on-surface cursor-pointer">
                Habilitar Análise Diária de Indicadores
              </label>
            </div>

            <div className="flex items-center gap-2.5 p-3 bg-surface-container-low rounded-lg border border-outline-variant/30">
              <input
                type="checkbox"
                id="monthlyAnalysisEnabled"
                checked={aiSettings.monthlyAnalysisEnabled}
                onChange={(e) =>
                  setAiSettings({ ...aiSettings, monthlyAnalysisEnabled: e.target.checked })
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <label htmlFor="monthlyAnalysisEnabled" className="text-xs font-semibold text-on-surface cursor-pointer">
                Habilitar Análise Mensal Consolidada
              </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-outline-variant/20">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              isLoading={isTestingConnection}
              loadingText="Testando Secrets Manager & Gemini..."
              icon="network_ping"
            >
              Testar Conexão Gemini
            </Button>

            <Button type="submit" variant="primary" size="sm" icon="save">
              Salvar Configurações de IA
            </Button>
          </div>

          {/* Resultado do Teste de Conexão */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 animate-in fade-in ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {testResult.success ? 'check_circle' : 'error'}
              </span>
              <span>{testResult.message}</span>
            </div>
          )}
        </form>
      </div>

      {/* Seção 2: Configurações Gerais & Drogaria */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-modal p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex items-center gap-3 border-b border-outline-variant/20 pb-4">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
            <span className="material-symbols-outlined text-[24px]">storefront</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-on-surface">Configurações do Estabelecimento</h2>
            <p className="text-xs text-on-surface-variant">
              Identificação institucional, fuso horário oficial e permissões de visualização
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveGeneralSettings} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nome do Estabelecimento"
              value={appSettings.storeName}
              onChange={(e) => setAppSettings({ ...appSettings, storeName: e.target.value })}
              required
              icon="store"
            />
            <Input
              label="Nome do Sistema"
              value={appSettings.systemName}
              onChange={(e) => setAppSettings({ ...appSettings, systemName: e.target.value })}
              required
              icon="badge"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Timezone Padrão"
              value={appSettings.timezone}
              onChange={(e) => setAppSettings({ ...appSettings, timezone: e.target.value })}
              required
              icon="schedule"
              helperText="Padrão oficial: America/Sao_Paulo (UTC-3)"
            />

            <div className="flex items-center gap-2.5 p-3 bg-surface-container-low rounded-lg border border-outline-variant/30 self-end">
              <input
                type="checkbox"
                id="allowAttendantViewIndividualPerformance"
                checked={appSettings.allowAttendantViewIndividualPerformance}
                onChange={(e) =>
                  setAppSettings({
                    ...appSettings,
                    allowAttendantViewIndividualPerformance: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
              />
              <label
                htmlFor="allowAttendantViewIndividualPerformance"
                className="text-xs font-semibold text-on-surface cursor-pointer"
              >
                Permitir que atendentes visualizem seu desempenho individual no Dashboard
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-outline-variant/20">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSavingGeneral}
              icon="save"
            >
              Salvar Alterações Gerais
            </Button>
          </div>
        </form>
      </div>

      {/* Modal Configurar / Alterar API Key do Gemini */}
      {isApiKeyModalOpen && (
        <Modal
          isOpen={isApiKeyModalOpen}
          onClose={() => setIsApiKeyModalOpen(false)}
          title="Configurar API Key do Google Gemini"
          subtitle="A credencial será persistida com segurança no Cloudflare D1 / backend."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsApiKeyModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveApiKey}
                isLoading={isSavingApiKey}
                loadingText="Salvando..."
              >
                Salvar Credencial Segura
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveApiKey} className="flex flex-col gap-4 text-xs">
            <p className="text-on-surface-variant leading-relaxed">
              Insira sua chave obtida no Google AI Studio (ou defina a variável GEMINI_API_KEY no arquivo .env do Docker Compose). O backend protege a credencial e nenhum usuário ou código frontend terá acesso em texto plano.
            </p>

            <Input
              label="Google Gemini API Key"
              type="password"
              placeholder="AIzaSy..."
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              required
              icon="key"
            />
          </form>
        </Modal>
      )}

      {/* Confirmação de Remoção de API Key (Regra 58) */}
      {isRemoveApiKeyDialogOpen && (
        <ConfirmDialog
          isOpen={isRemoveApiKeyDialogOpen}
          onClose={() => setIsRemoveApiKeyDialogOpen(false)}
          onConfirm={handleRemoveApiKey}
          title="Remover a API Key?"
          variant="destructive"
          confirmLabel="Remover do Secrets Manager"
          isLoading={isRemovingApiKey}
          description="As análises por IA deixarão de funcionar até que uma nova chave seja configurada. O segredo será desativado e o evento registrado na auditoria."
        />
      )}
    </div>
  );
};

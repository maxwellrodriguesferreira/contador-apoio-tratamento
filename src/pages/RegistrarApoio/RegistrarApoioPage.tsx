import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { SupportService } from '../../services/supports/supportService';
import { RoutineService } from '../../services/routine/routineService';
import { AttendantService } from '../../services/attendants/attendantService';
import { Attendant } from '../../types';
import { getTodayISODate } from '../../utils/calculations';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { useToast } from '../../contexts/ToastContext';
import { CloudSyncService } from '../../services/api/cloudSyncService';

interface RegistrarApoioPageProps {
  onNavigate: (path: string) => void;
}

export const RegistrarApoioPage: React.FC<RegistrarApoioPageProps> = ({ onNavigate }) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [serviceType, setServiceType] = useState<'APOIO' | 'ROTINA'>('APOIO');
  const [date, setDate] = useState<string>(getTodayISODate());
  const [attendantId, setAttendantId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [observation, setObservation] = useState<string>('');
  
  const [activeAttendants, setActiveAttendants] = useState<Attendant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSavedInfo, setLastSavedInfo] = useState<string | null>(null);

  useEffect(() => {
    const list = AttendantService.getActive();
    setActiveAttendants(list);
    if (list.length > 0 && !attendantId) {
      setAttendantId(list[0].id);
    }
    CloudSyncService.syncAllFromCloud().then(() => {
      const refreshed = AttendantService.getActive();
      setActiveAttendants(refreshed);
      if (refreshed.length > 0 && !attendantId) {
        setAttendantId(refreshed[0].id);
      }
    });
  }, []);

  const handleIncrement = (amount: number) => {
    setQuantity((prev) => Math.max(1, prev + amount));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) {
      showToast('Apenas administradores podem registrar novos atendimentos.', 'error');
      return;
    }

    if (!attendantId) {
      showToast('Selecione um atendente ativo.', 'warning');
      return;
    }

    if (quantity < 1 || !Number.isInteger(quantity)) {
      showToast('A quantidade deve ser um número inteiro maior ou igual a 1.', 'warning');
      return;
    }

    setIsSubmitting(true);

    try {
      await new Promise((r) => setTimeout(r, 450));

      const selectedAttendant = activeAttendants.find((a) => a.id === attendantId);
      const serviceName = serviceType === 'APOIO' ? 'Apoio ao Tratamento' : 'Na Rotina';

      if (serviceType === 'APOIO') {
        await SupportService.create(user, {
          date,
          attendantId,
          quantity,
          observation: observation.trim() || undefined,
        });
      } else {
        await RoutineService.create(user, {
          date,
          attendantId,
          quantity,
          observation: observation.trim() || undefined,
        });
      }

      showToast(`✓ ${serviceName} registrado com sucesso.`, 'success', 'Lançamento Concluído');

      setLastSavedInfo(
        `Último registro: ${quantity} ${serviceName} para ${selectedAttendant?.name} na data ${date}.`
      );

      // Limpar somente quantidade (volta para 1) e observação; MANTER data e atendente
      setQuantity(1);
      setObservation('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao registrar atendimento.';
      showToast(msg, 'error', 'Falha no Registro');
    } finally {
      setIsSubmitting(false);
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
          Usuários com perfil Atendente possuem acesso exclusivamente para visualização de indicadores no Dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Cabeçalho da Página */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Registrar Apoio</h1>
          <p className="text-xs text-on-surface-variant mt-1">
            Lançamento de Apoios ao Tratamento vinculados aos atendentes farmacêuticos
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('lancamentos')}
          icon="list_alt"
        >
          Ver Lançamentos
        </Button>
      </div>

      {/* Card do Formulário */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-modal p-6 sm:p-8">
        {lastSavedInfo && (
          <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 font-medium animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
              <span>{lastSavedInfo}</span>
            </div>
            <button
              onClick={() => setLastSavedInfo(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Seletor do Tipo de Serviço */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Tipo de Serviço Farmacêutico <span className="text-error">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3 p-1 bg-surface-container-low rounded-xl border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setServiceType('APOIO')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  serviceType === 'APOIO'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">health_and_safety</span>
                Apoio ao Tratamento
              </button>
              <button
                type="button"
                onClick={() => setServiceType('ROTINA')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  serviceType === 'ROTINA'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
                Na Rotina
              </button>
            </div>
            <span className="text-[11px] text-outline">
              {serviceType === 'APOIO'
                ? 'Acompanhamento farmacoterapêutico de adesão (possui metas diárias e mensais).'
                : 'Atendimento clínico e operacional de balcão (sem metas obrigatórias).'}
            </span>
          </div>

          {/* Data do Lançamento */}
          <Input
            label={serviceType === 'APOIO' ? 'Data do Apoio' : 'Data do Atendimento'}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            icon="calendar_today"
          />

          {/* Seleção do Atendente */}
          <Select
            label="Atendente Farmacêutico"
            value={attendantId}
            onChange={(e) => setAttendantId(e.target.value)}
            required
            icon="support_agent"
            options={
              activeAttendants.length > 0
                ? activeAttendants.map((a) => ({
                    value: a.id,
                    label: `[Cód. ${a.code}] ${a.name}`,
                  }))
                : [{ value: '', label: 'Nenhum atendente ativo cadastrado' }]
            }
          />

          {/* Campo de Quantidade com Botões Rápidos */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              {serviceType === 'APOIO' ? 'Quantidade de Apoios' : 'Quantidade de Atendimentos Na Rotina'}{' '}
              <span className="text-error">*</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="w-10 h-10 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface font-bold text-lg border border-outline-variant/40 transition-colors"
                title="Diminuir 1"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 h-10 text-center font-bold text-lg rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <button
                type="button"
                onClick={() => setQuantity((prev) => prev + 1)}
                className="w-10 h-10 rounded-lg bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface font-bold text-lg border border-outline-variant/40 transition-colors"
                title="Aumentar 1"
              >
                +
              </button>

              {/* Botões rápidos +1, +5, +10, +20 */}
              <div className="flex items-center gap-1.5 ml-2">
                {[1, 5, 10, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleIncrement(num)}
                    className="px-2.5 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs transition-colors border border-primary/20"
                  >
                    +{num}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-[11px] text-on-surface-variant">
              Mínimo: 1. Valores inteiros e positivos.
            </span>
          </div>

          {/* Observação Opcional */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Observação <span className="text-outline text-[10px] font-normal">(Opcional)</span>
            </label>
            <textarea
              rows={3}
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder={
                serviceType === 'APOIO'
                  ? 'Ex.: Cliente orientado sobre adesão e posologia farmacêutica...'
                  : 'Ex.: Atendimento de rotina clínica realizado no balcão...'
              }
              className="w-full p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/50 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Botão de Submissão com prevenção contra duplo clique */}
          <div className="pt-3">
            <Button
              type="submit"
              variant={serviceType === 'APOIO' ? 'primary' : 'secondary'}
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
              loadingText="Salvando..."
              icon={serviceType === 'APOIO' ? 'health_and_safety' : 'assignment_turned_in'}
            >
              {serviceType === 'APOIO' ? 'Registrar Apoio ao Tratamento' : 'Registrar Na Rotina'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

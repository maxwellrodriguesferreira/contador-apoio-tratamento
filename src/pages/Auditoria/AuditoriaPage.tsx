import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AuditService } from '../../services/audit/auditService';
import { AttendantService } from '../../services/attendants/attendantService';
import { AuditLog, TreatmentSupportAudit, Attendant } from '../../types';
import { formatDateTimeBR, formatDateBR } from '../../utils/calculations';
import { Badge } from '../../components/common/Badge';
import { Input } from '../../components/common/Input';
import { Select } from '../../components/common/Select';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { CloudSyncService } from '../../services/api/cloudSyncService';
import { useToast } from '../../contexts/ToastContext';

export const AuditoriaPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'supports' | 'system'>('supports');
  const [supportAudits, setSupportAudits] = useState<TreatmentSupportAudit[]>([]);
  const [systemLogs, setSystemLogs] = useState<AuditLog[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const [viewingAudit, setViewingAudit] = useState<TreatmentSupportAudit | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<'current' | 'all'>('current');
  const [isClearing, setIsClearing] = useState(false);

  const loadData = useCallback(() => {
    setSupportAudits(AuditService.getSupportAudits());
    setSystemLogs(AuditService.getAllSystemLogs());
    setAttendants(AttendantService.getAll());
  }, []);

  useEffect(() => {
    loadData();
    const unsubscribe = CloudSyncService.subscribe(loadData);
    return unsubscribe;
  }, [loadData]);

  const getAttendantName = (id?: string) => {
    if (!id) return '-';
    const found = attendants.find((a) => a.id === id);
    return found ? `${found.name} (${found.code})` : id;
  };

  const filteredSupportAudits = supportAudits.filter((a) => {
    if (actionFilter && a.action !== actionFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchUser = a.userName.toLowerCase().includes(q);
      const matchAction = a.action.toLowerCase().includes(q);
      const matchId = a.treatmentSupportId.toLowerCase().includes(q);
      if (!matchUser && !matchAction && !matchId) return false;
    }
    return true;
  });

  const filteredSystemLogs = systemLogs.filter((l) => {
    if (actionFilter && l.action !== actionFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchUser = l.userName.toLowerCase().includes(q);
      const matchAction = l.action.toLowerCase().includes(q);
      const matchEntity = l.entityType.toLowerCase().includes(q);
      if (!matchUser && !matchAction && !matchEntity) return false;
    }
    return true;
  });

  const handleConfirmClear = async () => {
    setIsClearing(true);
    try {
      if (clearTarget === 'all') {
        await AuditService.clearAllLogs();
        showToast('Todos os logs de auditoria foram limpos com sucesso.', 'success');
      } else if (activeTab === 'supports') {
        await AuditService.clearSupportAudits();
        showToast('Histórico de auditoria de apoios limpo com sucesso.', 'success');
      } else {
        await AuditService.clearSystemLogs();
        showToast('Histórico de logs do sistema limpo com sucesso.', 'success');
      }
      loadData();
      setIsClearModalOpen(false);
    } catch {
      showToast('Erro ao limpar histórico de logs.', 'error');
    } finally {
      setIsClearing(false);
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
          A trilha de auditoria e conformidade é confidencial e restrita aos administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Auditoria & Rastreabilidade</h1>
        <p className="text-xs text-on-surface-variant mt-1">
          Trilha imutável de eventos, histórico de alterações de apoios e logs de conformidade
        </p>
      </div>

      {/* Seletor de Visão e Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-2 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle">
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setActiveTab('supports');
              setActionFilter('');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'supports'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">edit_note</span>
            <span>Auditoria de Apoios ({supportAudits.length})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('system');
              setActionFilter('');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'system'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">shield</span>
            <span>Logs do Sistema ({systemLogs.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-48">
            <Input
              placeholder="Buscar no log..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon="search"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={loadData} icon="refresh">
            Atualizar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setClearTarget('current');
              setIsClearModalOpen(true);
            }}
            icon="delete_sweep"
            disabled={activeTab === 'supports' ? supportAudits.length === 0 : systemLogs.length === 0}
            title="Limpar histórico de registros de logs"
          >
            Limpar Logs
          </Button>
        </div>
      </div>

      {/* Tabela de Auditoria de Apoios */}
      {activeTab === 'supports' && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
                <tr>
                  <th className="px-5 py-3">Data/Hora</th>
                  <th className="px-5 py-3">Ação</th>
                  <th className="px-5 py-3">Usuário Responsável</th>
                  <th className="px-5 py-3">ID do Apoio</th>
                  <th className="px-5 py-3 text-center">Antes → Depois</th>
                  <th className="px-5 py-3 text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
                {filteredSupportAudits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-on-surface-variant">
                      Nenhum registro de auditoria de apoio localizado.
                    </td>
                  </tr>
                ) : (
                  filteredSupportAudits.map((audit) => {
                    const isUpdate = audit.action === 'UPDATE';
                    const isDelete = audit.action === 'DELETE';
                    const isRestore = audit.action === 'RESTORE';
                    const isCreate = audit.action === 'CREATE';

                    return (
                      <tr key={audit.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap text-outline">
                          {formatDateTimeBR(audit.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          {isCreate && <Badge variant="success">CREATE</Badge>}
                          {isUpdate && <Badge variant="warning">UPDATE</Badge>}
                          {isDelete && <Badge variant="error">DELETE</Badge>}
                          {isRestore && <Badge variant="secondary">RESTORE</Badge>}
                        </td>
                        <td className="px-5 py-3 font-bold text-on-surface">{audit.userName}</td>
                        <td className="px-5 py-3 font-mono text-[11px] text-outline">
                          {audit.treatmentSupportId}
                        </td>
                        <td className="px-5 py-3 text-center whitespace-nowrap">
                          {isUpdate && audit.oldValue && audit.newValue ? (
                            <span className="font-bold">
                              Qtd: <span className="text-rose-700">{audit.oldValue.quantity}</span> →{' '}
                              <span className="text-emerald-700">{audit.newValue.quantity}</span>
                            </span>
                          ) : isCreate ? (
                            <span className="text-emerald-700 font-bold">
                              Qtd: {audit.newValue?.quantity}
                            </span>
                          ) : isDelete ? (
                            <span className="text-rose-700 font-bold">
                              Qtd: {audit.oldValue?.quantity} (Removido)
                            </span>
                          ) : (
                            <span className="text-secondary font-bold">
                              Qtd: {audit.newValue?.quantity} (Restaurado)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingAudit(audit)}
                            icon="visibility"
                          >
                            Ver Tudo
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabela de Logs Globais do Sistema */}
      {activeTab === 'system' && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-low text-on-surface-variant uppercase font-bold text-[11px] border-b border-outline-variant/30">
                <tr>
                  <th className="px-5 py-3">Data/Hora</th>
                  <th className="px-5 py-3">Evento</th>
                  <th className="px-5 py-3">Entidade</th>
                  <th className="px-5 py-3">Usuário</th>
                  <th className="px-5 py-3">Perfil</th>
                  <th className="px-5 py-3">IP / Sessão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20 text-on-surface font-medium">
                {filteredSystemLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-on-surface-variant">
                      Nenhum log do sistema registrado.
                    </td>
                  </tr>
                ) : (
                  filteredSystemLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap text-outline">
                        {formatDateTimeBR(log.createdAt)}
                      </td>
                      <td className="px-5 py-3 font-mono font-bold text-primary">{log.action}</td>
                      <td className="px-5 py-3 text-on-surface-variant">{log.entityType}</td>
                      <td className="px-5 py-3 font-semibold text-on-surface">{log.userName}</td>
                      <td className="px-5 py-3">
                        <span className="text-[10px] font-bold uppercase text-outline">
                          {log.userRole}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-[10px] text-outline">{log.ipAddress}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Detalhes do Registro de Auditoria */}
      {viewingAudit && (
        <Modal
          isOpen={!!viewingAudit}
          onClose={() => setViewingAudit(null)}
          title="Registro de Auditoria de Apoio"
          subtitle={`Evento: ${viewingAudit.action} | ID: ${viewingAudit.id}`}
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-surface-container-low rounded-lg flex justify-between">
              <div>
                <span className="text-outline block">Responsável</span>
                <strong className="text-on-surface">{viewingAudit.userName}</strong>
              </div>
              <div className="text-right">
                <span className="text-outline block">Timestamp</span>
                <strong className="text-on-surface">{formatDateTimeBR(viewingAudit.createdAt)}</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-200">
                <h4 className="font-bold text-rose-800 mb-2">Valor Anterior</h4>
                {viewingAudit.oldValue ? (
                  <div className="flex flex-col gap-1 text-[11px]">
                    <p><strong>Data:</strong> {formatDateBR(viewingAudit.oldValue.date)}</p>
                    <p><strong>Atendente:</strong> {getAttendantName(viewingAudit.oldValue.attendantId)}</p>
                    <p><strong>Quantidade:</strong> {viewingAudit.oldValue.quantity}</p>
                    <p><strong>Observação:</strong> {viewingAudit.oldValue.observation || '-'}</p>
                  </div>
                ) : (
                  <span className="text-outline italic">Nenhum (Criação inicial)</span>
                )}
              </div>

              <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200">
                <h4 className="font-bold text-emerald-800 mb-2">Novo Valor</h4>
                {viewingAudit.newValue ? (
                  <div className="flex flex-col gap-1 text-[11px]">
                    <p><strong>Data:</strong> {formatDateBR(viewingAudit.newValue.date)}</p>
                    <p><strong>Atendente:</strong> {getAttendantName(viewingAudit.newValue.attendantId)}</p>
                    <p><strong>Quantidade:</strong> {viewingAudit.newValue.quantity}</p>
                    <p><strong>Observação:</strong> {viewingAudit.newValue.observation || '-'}</p>
                  </div>
                ) : (
                  <span className="text-outline italic">Nenhum (Exclusão)</span>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de Confirmação para Limpeza de Logs */}
      {isClearModalOpen && (
        <Modal
          isOpen={isClearModalOpen}
          onClose={() => !isClearing && setIsClearModalOpen(false)}
          title="Limpar Histórico de Auditoria"
          subtitle="Atenção: Esta ação é definitiva e removerá permanentemente os registros selecionados."
          maxWidth="md"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => setIsClearModalOpen(false)}
                disabled={isClearing}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmClear}
                isLoading={isClearing}
                loadingText="Limpando..."
                icon="delete_forever"
              >
                Confirmar Limpeza
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-3">
              <span className="material-symbols-outlined text-rose-600 text-[22px] shrink-0">
                warning
              </span>
              <div className="text-rose-800">
                <p className="font-bold">Ação Crítica de Exclusão</p>
                <p className="mt-0.5 text-[11px] text-rose-700 leading-relaxed">
                  Os registros selecionados serão excluídos permanentemente da persistência (Cloudflare D1 / Local) e não poderão ser recuperados.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-bold text-on-surface">O que você deseja limpar?</span>
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-outline-variant/40 hover:bg-surface-container-low cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="clearOption"
                  value="current"
                  checked={clearTarget === 'current'}
                  onChange={() => setClearTarget('current')}
                  className="mt-0.5 text-primary focus:ring-primary cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-on-surface">
                    {activeTab === 'supports'
                      ? `Somente Auditoria de Apoios (${supportAudits.length} registros)`
                      : `Somente Logs do Sistema (${systemLogs.length} registros)`}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    Limpa apenas os registros da visualização ativa no momento.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-outline-variant/40 hover:bg-surface-container-low cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="clearOption"
                  value="all"
                  checked={clearTarget === 'all'}
                  onChange={() => setClearTarget('all')}
                  className="mt-0.5 text-primary focus:ring-primary cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-on-surface">
                    Limpar Ambos os Históricos (Total: {supportAudits.length + systemLogs.length} registros)
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    Expurga tanto os logs de mutação de apoios quanto os logs de acesso e eventos do sistema.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

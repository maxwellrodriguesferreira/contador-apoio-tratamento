import { LocalDatabase } from '../storage/localDatabase';
import { Attendant, UserProfile } from '../../types';
import { attendantSchema } from '../../validators/schemas';
import { AuditService } from '../audit/auditService';
import { CloudSyncService } from '../api/cloudSyncService';

export class AttendantService {
  static getAll(): Attendant[] {
    return LocalDatabase.getAttendants();
  }

  static getActive(): Attendant[] {
    return LocalDatabase.getAttendants().filter((a) => a.active);
  }

  static getById(id: string): Attendant | undefined {
    return LocalDatabase.getAttendants().find((a) => a.id === id);
  }

  static create(currentUser: UserProfile, data: { name: string; code: string; active?: boolean }): Attendant {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem cadastrar atendentes.');
    }

    const validated = attendantSchema.parse(data);
    const attendants = LocalDatabase.getAttendants();

    const codeExists = attendants.some(
      (a) => a.code.toLowerCase().trim() === validated.code.toLowerCase().trim()
    );
    if (codeExists) {
      throw new Error(`O código identificador "${validated.code}" já está em uso por outro atendente.`);
    }

    const newAttendant: Attendant = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: validated.name.trim(),
      code: validated.code.trim(),
      active: validated.active ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    attendants.push(newAttendant);
    LocalDatabase.saveAttendants(attendants);
    CloudSyncService.syncAttendant(newAttendant);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'USER_CREATED',
      'ATTENDANT',
      newAttendant.id,
      { name: newAttendant.name, code: newAttendant.code }
    );

    return newAttendant;
  }

  static update(
    currentUser: UserProfile,
    id: string,
    data: { name: string; code: string; active: boolean }
  ): Attendant {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem editar atendentes.');
    }

    const validated = attendantSchema.parse(data);
    const attendants = LocalDatabase.getAttendants();
    const attendant = attendants.find((a) => a.id === id);

    if (!attendant) {
      throw new Error('Atendente não encontrado.');
    }

    const codeExists = attendants.some(
      (a) => a.id !== id && a.code.toLowerCase().trim() === validated.code.toLowerCase().trim()
    );
    if (codeExists) {
      throw new Error(`O código "${validated.code}" já está em uso por outro atendente.`);
    }

    attendant.name = validated.name.trim();
    attendant.code = validated.code.trim();
    attendant.active = validated.active;
    attendant.updatedAt = new Date().toISOString();

    LocalDatabase.saveAttendants(attendants);
    CloudSyncService.syncAttendant(attendant);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'USER_UPDATED',
      'ATTENDANT',
      attendant.id,
      { updatedName: attendant.name, code: attendant.code, active: attendant.active }
    );

    return attendant;
  }

  static toggleStatus(currentUser: UserProfile, id: string): Attendant {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem alterar o status de atendentes.');
    }

    const attendants = LocalDatabase.getAttendants();
    const attendant = attendants.find((a) => a.id === id);

    if (!attendant) {
      throw new Error('Atendente não encontrado.');
    }

    attendant.active = !attendant.active;
    attendant.updatedAt = new Date().toISOString();
    LocalDatabase.saveAttendants(attendants);
    CloudSyncService.syncAttendant(attendant);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'USER_UPDATED',
      'ATTENDANT',
      attendant.id,
      { active: attendant.active }
    );

    return attendant;
  }

  /**
   * Exclusão de atendente com auditoria
   */
  static delete(currentUser: UserProfile, id: string): void {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Acesso negado: Somente administradores podem excluir atendentes.');
    }

    const attendants = LocalDatabase.getAttendants();
    const index = attendants.findIndex((a) => a.id === id);

    if (index === -1) {
      throw new Error('Atendente não encontrado.');
    }

    const removed = attendants[index];
    attendants.splice(index, 1);
    LocalDatabase.saveAttendants(attendants);
    CloudSyncService.deleteAttendant(removed.id);

    AuditService.logSystemAction(
      currentUser.id,
      currentUser.name,
      currentUser.role,
      'USER_DISABLED',
      'ATTENDANT',
      removed.id,
      { deletedAttendantName: removed.name, code: removed.code }
    );
  }
}

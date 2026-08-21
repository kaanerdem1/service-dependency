/**
 * Talep açma yetkileri (mock oturum kullanıcıları üzerinden).
 * - change: aynı ekip domain’inde lead veya member
 * - new_service: yalnız ekip lideri (+ önerilen paket kendi domain’inde olmalı)
 */
import type { Owner, Service } from './data.js'
import { SESSION_USERS, services } from './data.js'

export function findUser(personId: string): Owner | undefined {
  return SESSION_USERS.find((u) => u.id === personId)
}

/** Mevcut servis için değişiklik talebi — oturum açıksa her serviste. */
export function canOpenChangeRequest(user: Owner, _service: Service): boolean {
  return Boolean(user?.id)
}

/** Katalogda olmayan yeni servis talebi — yalnız lider. */
export function canOpenNewServiceRequest(user: Owner): boolean {
  return Boolean(user.team && user.role === 'lead')
}

/** API create öncesi; hata fırlatır → index.ts 403/400’e çevirir. */
export function assertCanCreateRequest(input: {
  kind: 'change' | 'new_service'
  personId: string
  targetServiceId?: string
  proposedPackageId?: string
}): void {
  const user = findUser(input.personId)
  if (!user) throw new Error('unknown_user')

  if (input.kind === 'change') {
    const svc = input.targetServiceId ? services[input.targetServiceId] : undefined
    if (!svc) throw new Error('target_required')
    if (!canOpenChangeRequest(user, svc)) throw new Error('forbidden_team')
    return
  }

  if (!canOpenNewServiceRequest(user)) throw new Error('forbidden_lead')

  // Paket, kullanıcının ekip domain’inde olmalı
  if (input.proposedPackageId) {
    const inPackage = Object.values(services).filter(
      (s) => s.packageId === input.proposedPackageId,
    )
    const ok = inPackage.some((s) => s.owner?.team === user.team)
    if (inPackage.length > 0 && !ok) throw new Error('forbidden_team')
  }
}

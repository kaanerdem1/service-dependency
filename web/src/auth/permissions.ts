/**
 * UI yetki yardımcıları (server/permissions ile aynı kurallar).
 * Oturum seçicideki kullanıcıya göre “talep aç” butonları.
 */
import type { Owner, Service, TeamRole } from '../types'

export type SessionActor = Pick<Owner, 'id' | 'name' | 'team' | 'role'>

/** Servisin domain ekibi = katalogdaki owner.team */
export function serviceDomainTeam(service: Service): string | undefined {
  return service.owner?.team
}

export function sameDomain(user: SessionActor, service: Service): boolean {
  const domain = serviceDomainTeam(service)
  return Boolean(user.team && domain && user.team === domain)
}

/**
 * Değişiklik talebi: domain ekibindeki lead + member.
 * Servis seçiliyken geçerli.
 */
export function canOpenChangeRequest(user: SessionActor, service: Service): boolean {
  if (!sameDomain(user, service)) return false
  const role: TeamRole | undefined = user.role
  return role === 'lead' || role === 'member'
}

/**
 * Yeni servis talebi (aktif): servis seçili DEĞİLKEN; yalnız ekip lideri.
 * Çalışan için UI’da pasif buton (onayda lider inceleyecek — ileride).
 */
export function canOpenNewServiceRequest(user: SessionActor): boolean {
  return Boolean(user.team && user.role === 'lead')
}

export function roleLabel(role?: TeamRole): string {
  if (role === 'lead') return 'Lider'
  if (role === 'member') return 'Çalışan'
  return '—'
}

/**
 * Süreç haritası düğüm kimlikleri.
 *
 * Ne yapar: Kalabalık “back” kopyalarının (`::near:`) gerçek BPM id’sini çözer.
 * Ne yapmaz: Grafı değiştirmez; yalnızca görsel kopya id’sini okur.
 * İlgili: `ProcessFlowMap` `splitCrowdedBackSinks`.
 */
export function sinkCopyRealId(id: string): string {
  const at = id.indexOf('::near:')
  return at < 0 ? id : id.slice(0, at)
}

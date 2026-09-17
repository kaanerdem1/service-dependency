/**
 * Seçili servis / metod sahne verisi (Faz 1).
 *
 * Ne yapar: `pivotId` değişince servis + komşu + etki grafı; `selectedMethodId`
 *   değişince metod etki grafı. Sahneye kaydırma ve tablo proje filtresini sıfırlar.
 * Ne yapmaz: Pivot seçmez (`useServiceSelection`).
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { getImpactGraph, getMethodImpactGraph, getNeighbors, getService } from '../api/client'
import { renameServiceRecent } from '../stores/serviceRecents'
import type { AffectedService, ImpactGraph, MethodImpactGraph, Service } from '../types'

type Params = {
  pivotId: string | undefined
  selectedMethodId: string | undefined
  service: Service | undefined
  scrollToStageTop: () => void
  setService: Dispatch<SetStateAction<Service | undefined>>
  setAffected: Dispatch<SetStateAction<AffectedService[]>>
  setCallees: Dispatch<SetStateAction<AffectedService[]>>
  setImpact: Dispatch<SetStateAction<ImpactGraph | undefined>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setMethodImpact: Dispatch<SetStateAction<MethodImpactGraph | undefined>>
  setTableProjectFilter: Dispatch<SetStateAction<string | undefined>>
  setFrequentRecents: Dispatch<SetStateAction<{ id: string; name: string }[]>>
}

export function useServiceStageData({
  pivotId,
  selectedMethodId,
  service,
  scrollToStageTop,
  setService,
  setAffected,
  setCallees,
  setImpact,
  setLoading,
  setMethodImpact,
  setTableProjectFilter,
  setFrequentRecents,
}: Params) {
  useEffect(() => {
    if (!pivotId) return
    scrollToStageTop()
  }, [pivotId, selectedMethodId, scrollToStageTop])

  useEffect(() => {
    setTableProjectFilter(undefined)
  }, [pivotId, setTableProjectFilter])

  useEffect(() => {
    if (!selectedMethodId) {
      setMethodImpact(undefined)
      return
    }
    let cancelled = false
    void getMethodImpactGraph(selectedMethodId)
      .then((g) => {
        if (!cancelled) setMethodImpact(g)
      })
      .catch(() => {
        if (!cancelled) setMethodImpact(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [selectedMethodId, setMethodImpact])

  useEffect(() => {
    if (!pivotId) {
      setService(undefined)
      setAffected([])
      setCallees([])
      setImpact(undefined)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void Promise.all([
      getService(pivotId),
      getNeighbors(pivotId),
      getImpactGraph(pivotId),
    ])
      .then(([svc, neighbors, graph]) => {
        if (cancelled) return
        setService(svc)
        setAffected(neighbors.downstream)
        setCallees(neighbors.upstream)
        setImpact(graph)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pivotId, setAffected, setCallees, setImpact, setLoading, setService])

  useEffect(() => {
    if (!service?.id?.startsWith('sd-') || !service.name) return
    setFrequentRecents(
      renameServiceRecent(service.id, service.name).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    )
  }, [service?.id, service?.name, setFrequentRecents])
}

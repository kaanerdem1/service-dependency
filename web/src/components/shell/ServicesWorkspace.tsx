/**
 * Servis kataloğu yüzeyi — sol panel + orta sahne sütunu.
 *
 * Ne yapar: `ModuleSidebar` ve `ServicesMainStage` bir arada.
 * Ne yapmaz: Masthead, DWH, modal ve komut paleti App’te kalır.
 */
import type { ComponentProps, RefObject } from 'react'
import { ModuleSidebar } from './ModuleSidebar'
import { ServicesMainStage } from './ServicesMainStage'

type Props = {
  workspaceRef: RefObject<HTMLDivElement | null>
  sidebar: ComponentProps<typeof ModuleSidebar>
  stage: ComponentProps<typeof ServicesMainStage>
}

export function ServicesWorkspace({ workspaceRef, sidebar, stage }: Props) {
  return (
    <>
      <ModuleSidebar {...sidebar} />
      <div className="workspace-column">
        <div className="workspace" ref={workspaceRef}>
          <ServicesMainStage {...stage} />
        </div>
      </div>
    </>
  )
}

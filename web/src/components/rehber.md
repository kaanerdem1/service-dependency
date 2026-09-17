# `components/` — UI modülleri

Kabuk parçaları `shell/` ve `workflows/` altında; **süreç haritası** dosyalarının çoğu bu klasör **kökünde** (tarihsel nedenle). Süreç akışına özel rehber: [process/rehber.md](./process/rehber.md).

## Kabuk ve navigasyon (App → shell)

| Modül | Bağlandığı yer | Rol |
|-------|----------------|-----|
| `shell/ServicesWorkspace.tsx` | `App.tsx` | Sidebar + orta sütun |
| `shell/useServicesWorkspaceProps.ts` | `App.tsx` | Workspace prop üretimi |
| `shell/useAppShellOverlaysProps.ts` | `App.tsx` | ⌘K, inbox, CR modalları |
| `shell/ModuleSidebar.tsx` | `ServicesWorkspace` | Modül ağacı, Favoriler/İş akışları drawer |
| `shell/ServicesMainStage.tsx` | `ServicesWorkspace` | Welcome / süreç / workflow info / servis sahnesi |
| `shell/ServiceStage.tsx` | `ServicesMainStage` | Sekmeler: harita, tablo, katalog |
| `MapStage.tsx`, `ImpactMap.tsx` | `ServiceStage` | Servis etki haritası (React Flow) |
| `ModuleTree.tsx` | `ModuleSidebar` | Proje → jar → servis ağacı |
| `CommandPalette.tsx` | `AppShellOverlays` | ⌘K arama |

## İş akışları drawer

| Modül | Bağlandığı yer |
|-------|----------------|
| `WorkflowsPanel.tsx` | `ModuleSidebar` — birleştirir |
| `workflows/*` | `WorkflowsPanel` — liste, rotalar, klasör, dialog |

Store: `web/src/workflowStore.ts`, rotalar: `processRouteStore.ts`.

## Süreç (BPM) — kök dosyalar

Tam liste ve layout açıklaması: **[process/rehber.md](./process/rehber.md)**.

| Modül | Rol |
|-------|-----|
| `ProcessFlowPage.tsx` | Tam akış vs rota modu orchestrator |
| `ProcessFlowMap.tsx` | Tam BPM canvas (çoğu süreç **otomatik layout**) |
| `ProcessFlowRouteBuilder.tsx` | Kayıtlı rota modu canvas |
| `ProcessFlowCanvas.tsx` | Eski keşif / daraltılmış görünüm |
| `processFlowReferenceLayout.ts` | **Sadece KTF (105116)** sabit koordinat |
| `useProcessFlowPage.ts` | Graf yükleme, mod seçimi |
| `processUserRoute.ts` | Rota state makinesi |
| `useSaveProcessRoute.ts` | Rota kaydet + PDF |

## Katalog / servis detay

| Modül | Rol |
|-------|-----|
| `ServiceCatalogPanels.tsx` | Ekranlar / süreçler sekmesi verisi |
| `CatalogEntityOverview.tsx` | Grup/jar özeti |
| `RelationshipTable.tsx`, `MethodImpactMap.tsx` | Tablo ve metod haritası |
| `ChangeRequestModal.tsx`, `InboxPanel.tsx` | CR ve gelen kutusu |

## Stil

Süreç haritası CSS: `styles/process-flow.css`. Servis haritası CSS: `App.css` (ileride `service-map.css`). Kabuk: `shell.css`, `workflows-drawer.css`, `cmdk.css`.

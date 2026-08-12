# Service Dependency

Servis bağımlılığı + değişiklik onay ürünü.

## Mimari

```
web/      → React (Vite) UI
server/  → Node (Express) API  ·  mock katalog + talep/flag
```

UI `/api/*` çağırır; Vite dev proxy → `http://127.0.0.1:4000`.

## Çalıştırma

İki terminal:

```bash
# API
cd server
npm install
npm run dev
```

```bash
# UI
cd web
npm install
npm run dev
```

UI: http://127.0.0.1:5173 · API: http://127.0.0.1:4000/api/health

## Notlar

- **Onay** = yalnız 1. katman (doğrudan etkilenenler).
- **Harita / etki yolu** = dinamik katman (bütçe yetiyorsa 2–3); dolaylı zincir görünür.
- Refund örneği: `Refund → SupportDesk → CustomerCare → TicketAnalytics`.

Dokümanlar: `docs/ServiceDependency.md`, `docs/UI_UX_GEREKSINIMLER.md`, `docs/ONAY_ZINCIRI_SENARYOLAR.md`

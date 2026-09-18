# `web/src/api`

HTTP istemci — tek ana dosya: **`client.ts`**.

| Sorumluluk | Nerede |
| --- | --- |
| `/api/*` fetch sarmalayıcıları | `client.ts` |
| Tipler (ProcessFlowGraph, Service, …) | `../types.ts` |
| Vite dev proxy | `web/vite.config.ts` → `127.0.0.1:4000` |

Mock modda API gerçek sunucuya gider (`CATALOG_SOURCE=mock` sunucuda). İstemci tarafı demo veri: [mock/rehber.md](../mock/rehber.md) (nadiren).

Yetki / görünürlük sabitleri: [auth/rehber.md](../auth/rehber.md).

Sunucu uç listesi: [server/src/routes/rehber.md](../../../server/src/routes/rehber.md).

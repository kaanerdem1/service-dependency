# `web/src/api` — sunucuyla **konuşma**

**Ekranda:** Doğrudan bir pencere yok; her liste, harita ve süreç canvas’ı buradaki isteklerle dolar. Dev ortamında Vite `/api` isteklerini `localhost:4000` API’ye yollar.

| Ne | Dosya |
|----|--------|
| Tüm `fetch('/api/...')` sarmalayıcıları | `client.ts` |
| Dönen JSON’un TypeScript karşılığı | `../types.ts` |

Yetki sabitleri (buton göster/gizle): [auth/rehber.md](../auth/rehber.md). Hangi URL’ler var: [server/src/routes/rehber.md](../../../server/src/routes/rehber.md).

Demo mod: sunucuda `CATALOG_SOURCE=mock` — istemci yine gerçek API’yi çağırır.

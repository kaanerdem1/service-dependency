# `server/src/lib` — API **ortak dallanma**

**Ekranda:** Kullanıcı fark etmez; `.env`’de `CATALOG_SOURCE=mock` ise demo veri, `inventory` ise PostgreSQL — aynı ekranlar farklı kaynaktan dolar.

| Dosya | Ne yapar |
|-------|----------|
| `catalogHelpers.ts` | Route’ların “mock mu inventory mi?” sorusuna ortak cevap |

Domain iş kuralları `inventory/` içinde; burada yalnızca ince HTTP yardımcıları.

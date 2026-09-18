# `web/src/auth` — **yetki** (UI tarafı)

**Ekranda:** “Bu düğmeyi göster”, “süreç notunu kaydetmeye izin var mı” gibi kararlar — tam SSO akışı kurumsal gateway’de; burada sabitler ve küçük kontroller.

| Dosya | Ekranda etkisi |
|-------|----------------|
| `permissions.ts` | Rol/aksiyon isimleri (sunucu ile uyumlu) |
| `catalogAccess.ts` | Katalog yazma, CR alanları görünürlüğü |

Oturum kullanıcı listesi API: `server` health/tree uçları.

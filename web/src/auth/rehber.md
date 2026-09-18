# `web/src/auth`

Katalog **UI yetkisi** — sunucu `permissions.ts` ile uyumlu sabitler; oturum SSO bu repoda minimal.

| Dosya | Rol |
| --- | --- |
| `permissions.ts` | Rol / aksiyon sabitleri |
| `catalogAccess.ts` | Bileşenlerde “yazma / CR göster” gibi kontroller |

Gerçek kimlik doğrulama kurumsal gateway / intranet embed senaryosuna bırakılır; API `session-users` uçları [server/src/routes/rehber.md](../../../server/src/routes/rehber.md).

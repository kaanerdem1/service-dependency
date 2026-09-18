# `server/src/lib`

Route handler’ların paylaştığı **ince** yardımcılar. İş kuralı burada değil — `inventory/` ve kök modüllerde.

| Dosya | Rol |
| --- | --- |
| `catalogHelpers.ts` | `CATALOG_SOURCE` (mock vs inventory) için ortak “hangi servis katmanı?” dallanması; route dosyaları import eder |

Yeni ortak route util gerekiyorsa önce burada mı yoksa `inventory/` içinde mi olduğuna karar ver: **DB / domain** → inventory; **yalnızca HTTP katmanı** → lib.

Route listesi: [routes/rehber.md](../routes/rehber.md)

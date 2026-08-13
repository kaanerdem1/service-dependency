# Metod call-graph — test senaryoları (tutarlılık)

Amaç: mock metod kataloğu (`server/src/methods.ts`) ile servis `affectsEdges` aynı hikâyeyi anlatsın; UI lazy ağaç doğru davransın.

Otomatik kontrol: `GET /api/meta/call-graph-consistency` → `{ ok: true }`.

---

## A — Veri tutarlılığı (zorunlu)

| # | Senaryo | Nasıl doğrula | Beklenen |
|---|---------|---------------|----------|
| A1 | Bilinmeyen kenar yok | consistency API | `unknown_caller` / `unknown_callee` = 0 |
| A2 | Çapraz çağrı ⇒ affects | consistency API | `cross_call_missing_affects` = 0. Kural: B, A’yı çağırıyorsa `affectsEdges[A]` ∋ B |
| A3 | Affects ⇒ en az bir metod çağrısı | consistency API | `affects_without_method_call` = 0 |
| A4 | Metod sayısı zengin | PaymentService Metodlar sekmesi | ≥ 15 metod; tüm katalogda ~100+ |
| A5 | Payment ↔ Checkout | Checkout `PaymentClient.chargeOrder` ▸ çağırılanlar | `PaymentFacade.charge` görünür; Payment `charge` ▸ çağıranlar’da Checkout satırı |
| A6 | Identity tüketicileri | Identity `SessionStore.get` ▸ çağıranlar | Checkout / Storefront / Mobile / Payment’tan en az biri |
| A7 | Refund zinciri | SupportDesk `RefundBridge.startRefund` ▸ çağırılanlar | `RefundFacade.requestRefund`; Refund → Payment kenarı da var |
| A8 | Data hattı | FinanceBatch `LedgerImport.fromReports` ▸ çağırılanlar | Reporting metodu; Report → Payment/Billing çağrıları mevcut |

---

## B — UI / lazy (#6 + #7)

| # | Senaryo | Adımlar | Beklenen |
|---|---------|---------|----------|
| B1 | Liste | Payment → Metodlar | Sınıf.metod + imza + `←n · →m` |
| B2 | Filtre | Filtreye `Fraud` yaz | Yalnız FraudGate satırları |
| B3 | Lazy callers | `PaymentFacade.charge` ▸ aç (Çağıranlar) | İstek `/methods/.../callers`; çocuklar yüklenir; kapalıyken istek yok |
| B4 | Lazy callees | Mod: Çağırılanlar → aynı metod ▸ | FraudGate / CardProcessor / … çocuklar |
| B5 | Çapraz pivot | Çocuk satırında başka servis adına tıkla | Pivot o servise geçer; Metodlar listesi yenilenir |
| B6 | Mod sıfırlama | Callers’da açık düğüm → Callees’e geç | Açık ağaçlar kapanır |
| B7 | Blast özeti | Metod seç | “Blast … N metod · M servis” + servis linkleri |

---

## E — Sol ağaç (Project → Package → Service → Method)

| # | Senaryo | Adımlar | Beklenen |
|---|---------|---------|----------|
| E1 | Lazy metod | commerce → payments → PaymentService ▸ aç | Metodlar ağaç altında yüklenir (servis kapalıyken istek yok) |
| E2 | Servis seçimi | Servis satırına tıkla | Pivot servis; metod seçimi yok; harita/etki yolu servis seviyesinde |
| E3 | Metod seçimi | `PaymentFacade.charge` tıkla | Detay **Metodlar** sekmesi açılır; satır seçili / scroll |
| E4 | Hiyerarşi | Ağaçta üst proje/paket görünür | Flat Metodlar listesinden bağımsız keşif yolu net |

---

## F — Gelişmiş harita metod overlay + metod pivot

| # | Senaryo | Adımlar | Beklenen |
|---|---------|---------|----------|
| F1 | Kapalı varsayılan | Gelişmiş → Harita | Metod rozeti yok |
| F2 | Overlay aç | “Bağlı metodları göster” | Her servisin **yanında** `N metod` rozeti (harita zoom’u değişmez) |
| F3 | Rozet aç | Rozete tık | Kaydırılabilir popover (RF node değil); diğer düğümler soluk; FitView tetiklenmez |
| F4 | Popover metod | Listedeki metoda tık | Metod pivot haritası (gelişmiş) açılır |
| F5 | Sol ağaç metod | Ağaçtan metod seç | Varsayılan: **çağıran servisler** haritası |
| F6 | Metod toggle | “Sadece bağlı olduğu metodları göster” | Çağıran metod zinciri; oklar koyu yeşil |
| F7 | Arama metod | Üst aramada metod adına tık | Aynı varsayılan (servis blast) |
| F8 | Katman | 2./3. katmanı aç | Daralt/aç + FitView |
| F9 | Merkez tık | Merkez düğüm | Metod seçimi kalkar / servis haritası |
| F10 | Basit etkilenmez | Basit etki yolu | Overlay yok |

---

## C — Servis etkisi ile hizalama (manuel)

| # | Senaryo | Adımlar | Beklenen |
|---|---------|---------|----------|
| C1 | Downstream ∩ callers | Payment İlişkiler downstream | checkout, billing, refund, report — bunlardan her biri Payment metodunu çağırıyor (A3/A5) |
| C2 | Metod blast ⊂ mantıklı | `PaymentFacade.charge` impact servisleri | Checkout (ve varsa diğer doğrudan çağıran servisler); rastgele servis yok |
| C3 | Yaprak servis | StorefrontApi — az callee, callers Checkout’tan değil Storefront içi + gateway | Storefront downstream boş; metod callers çoğunlukla iç veya üst BFF değil (storefront leaf) |

---

## D — Regresyon komutları

```bash
# API ayaktayken
curl -s http://127.0.0.1:4000/api/meta/call-graph-consistency | jq .
curl -s http://127.0.0.1:4000/api/services/svc-payment/methods | jq 'length'
curl -s http://127.0.0.1:4000/api/methods/m-payment-PaymentFacade-charge/callers | jq '[.[].serviceName]'
```

Sunucu açılışında log: `[call-graph] metod ↔ affectsEdges tutarlı` (veya uyarı sayısı).

---

## Bilinen sınırlar (şimdilik)

- Call-graph **mock**; gerçek Java/framework index değil.
- Metod blast onay listesine henüz bağlı değil (#17 tam entegrasyon sonra).
- web `mock/methods.ts` sunucu kopyası — veri değişince ikisini birlikte güncelle.
- Overlay metod seçimi şimdilik **derece sıralı** (caller+callee); kenar-özel “bağlı metod” örneklemesi sonra sıkılaştırılabilir.
- Basit etki yolu / Bağımlılıklar listesine metod gömülmedi (bilinçli).

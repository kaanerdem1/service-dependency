# Service Dependency — UI Referansları & Şekillenme Notları

> Amaç: Servis → çağırdığı servisler → içindeki metodlar (call-graph / bağımlılık) arayüzü için **örnek alınacak ürünler** ve buradan türetilecek feature’lar.  
> Bu doküman yaşayan bir taslak: aşağıdaki **“Nasıl olmalı?”** bölümüne notlar eklendikçe, referans önerilerden alınacak feature’larla arayüz şekillenecek.  
> İlgili: `URUN_ARASTIRMA_REFERANSLAR.md`, `UI_FIKIRLER_EKRAN_BAZLI.md`, `BUYUK_CODEBASE_URUNLER_NE_KULLANIYOR.md`, `TEKNIK_OZELLIKLER_OLCEKLI_ETKI.md`  
> UI/UX somutlaştırma (ekran, rol, akış, contract): `[UI_UX_GEREKSINIMLER.md](./UI_UX_GEREKSINIMLER.md)`  
> Onay zinciri / hop / çift bildirim senaryoları: `[ONAY_ZINCIRI_SENARYOLAR.md](./ONAY_ZINCIRI_SENARYOLAR.md)`  
> Tarih: 2026-08-12



curl -s [http://127.0.0.1:4000/api/meta/call-graph-consistency](http://127.0.0.1:4000/api/meta/call-graph-consistency)

cd /Users/kaanerdem/Desktop/service-dependency/web

cd /Users/kaanerdem/Desktop/service-dependency/server



---



## 0. Hedef vizyon (kısa)

Bugün (veri katmanı):

```
Tablo / kolon / prosedür / rapor  →  kim okur, kim yazar, etki yarıçapı
```

Hedef genişleme (kod / servis katmanı):

```
Servis A
  └─ Method X
       └─ Method Y
            └─ Method Z
                 └─ (opsiyonel) Table T / API / Queue
```

**Soru:** Büyük codebase’de bir servis veya metod değişince, ucu hangi servislere ve hangi metodlara dokunuyor?

Ürün özeti: **statik katalog + etki analizi** (runtime APM zorunlu değil). UI dili Datadog / Backstage tarzı olabilir; kaynak = bizim katalog (CodeQL / OpenAPI / parser).

---



## 1) Servis ↔ servis haritası (üst katman)


| Ürün                                                                                                                           | Ne gösterir                           | Alınacak UI                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| **[Datadog Service Map](https://docs.datadoghq.com/tracing/services/services_map/)**                                           | Runtime: kim kimi çağırıyor           | Inspect (sadece komşular), collapsed path, kenar animasyonu, team/app gruplama |
| **[Dynatrace Smartscape](https://docs.dynatrace.com/docs/discover-dynatrace/references/semantic-dictionary/model/smartscape)** | Typed ilişkiler (`calls`, `runs_on`…) | İlişki tipi etiketi, çok katmanlı topology                                     |
| **[New Relic Service Map](https://docs.newrelic.com/docs/apm/apm-ui-pages/service-maps/introduction-service-maps/)**           | APM servis grafı                      | Basit ego-network: seçili servis + upstream/downstream                         |
| **[Jaeger / Tempo](https://www.jaegertracing.io/docs/latest/architecture/)** dependency graph                                  | Trace’ten türetilmiş bağımlılık       | Hafif, ok yönü net                                                             |


**Bizde karşılığı (taslak):** bugünkü Diyagram modal’ın **SERVİS** modu — düğüm = servis, kenar = `calls`.

### Datadog görseller (resmi)

- Overview: [https://docs.dd-static.net/images/tracing/visualization/services_map/service_map_overview_3.3b80f55bde2fa4baefdb2bdbdb92d7fb.png?auto=format&fit=max&w=850](https://docs.dd-static.net/images/tracing/visualization/services_map/service_map_overview_3.3b80f55bde2fa4baefdb2bdbdb92d7fb.png?auto=format&fit=max&w=850)  
- Inspect: [https://docs.dd-static.net/images/tracing/visualization/services_map/servicemap.6eb19f8710f9ba56d10c67e639e5ea96.png?auto=format&fit=max&w=850](https://docs.dd-static.net/images/tracing/visualization/services_map/servicemap.6eb19f8710f9ba56d10c67e639e5ea96.png?auto=format&fit=max&w=850)  
- Collapsed: [https://docs.dd-static.net/images/tracing/visualization/services_map/service_map_collapsed.378cf9863db825f89c2c1951718ce83b.png?auto=format&fit=max&w=850](https://docs.dd-static.net/images/tracing/visualization/services_map/service_map_collapsed.378cf9863db825f89c2c1951718ce83b.png?auto=format&fit=max&w=850)  
- Animasyon: [https://docs.dd-static.net/images/tracing/visualization/services_map/servicemap-anim.mp4](https://docs.dd-static.net/images/tracing/visualization/services_map/servicemap-anim.mp4)  
- Docs: [https://docs.datadoghq.com/tracing/services/services_map/](https://docs.datadoghq.com/tracing/services/services_map/)  
- Catalog / dependency: [https://docs.datadoghq.com/internal_developer_portal/use_cases/dependency_management/](https://docs.datadoghq.com/internal_developer_portal/use_cases/dependency_management/)

---



## 2) Catalog + ownership (kimlik / liste)


| Ürün                                                                                                                        | Ne gösterir                        | Alınacak UI                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| **[Backstage Catalog](https://backstage.io/docs/features/software-catalog/)**                                               | Component, `dependsOn`, owner, API | Entity header, ilişkiler sekmesi, deep link        |
| **[Datadog Software Catalog / IDP](https://docs.datadoghq.com/internal_developer_portal/use_cases/dependency_management/)** | Servis kartı + bağımlılık listesi  | “Upstream / Downstream” listeleri (map şart değil) |
| **OpsLevel / Cortex**                                                                                                       | Service scorecard + deps           | Servis sayfası: bağımlılıklar + sahiplik           |


**Bizde karşılığı (taslak):** arama sonucu özet şerit + inspector üst header  
ör. `PaymentService · team X · 12 outbound`.

---



## 3) Metod / call-graph (alt katman — asıl fark)


| Ürün / araç                                                                                                                 | Ne gösterir               | Alınacak UI                                       |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------- |
| **[CodeQL call graph](https://codeql.github.com/docs/codeql-language-guides/navigating-the-call-graph/)**                   | Statik `Method → Method`  | Path breadcrumb, “bu değişirse kim?” reachability |
| **Sourcegraph / SCIP**                                                                                                      | Find refs, call hierarchy | Sol ağaç: metod → çağıranlar / çağırılanlar       |
| **[JetBrains Call Hierarchy](https://www.jetbrains.com/help/idea/viewing-structure-and-hierarchy-of-the-source-code.html)** | IDE call tree             | Lazy ağaç UX (mevcut tablo ağacına çok yakın)     |
| **CodeScene**                                                                                                               | Hotspot + bağımlılık      | Etki / risk boyama                                |
| **IBM Manta** (enterprise)                                                                                                  | Code + data impact        | Blast radius listesi + path                       |


**Bizde karşılığı (taslak):** TABLO ağacı gibi:

```
Servis → MethodX → MethodY → (opsiyonel) Tablo / API
```

---



## 4) Arayüz iskeleti

> §8 sonrası güncel iskelet §7 altındaki ASCII wireframe’dir. Aşağıdaki eski 3-yüzey taslağı referans olarak durur; ürün omurgası artık **modül ağacı + etkilenen servisler + onay gate**.

```
[1] Sol: project → jar/package → service
[2] Sağ: etkilenen servisler listesi | grafik (toggle)
[3] Değişiklik talebi → owner flag’leri → gate
```

---



## 5) Pratik “örnek al” kısa listesi

1. **Datadog Service Map** — servis haritası UX (görsel + inspect)
2. **Backstage** — servis kartı / `dependsOn` listesi
3. **JetBrains Call Hierarchy** — metod ağacı
4. **CodeQL path** — “kim etkilenir?” path / breadcrumb
5. **Dynatrace Smartscape** — kenar tipi (`calls` vs `reads_table` vs `publishes`)

---



## 6) Kaynak ayrımı (ürün konum)


| Kaynak                        | Güçlü yanı       | Zayıf yanı                    |
| ----------------------------- | ---------------- | ----------------------------- |
| APM map (Datadog / Dynatrace) | Gerçek trafik    | Deploy öncesi / nadir yol yok |
| Statik call-graph (CodeQL)    | PR öncesi etki   | HTTP / mesajlaşma kaçabilir   |
| Catalog (Backstage)           | Ownership, beyan | Çağrı kanıtı değil            |


**Biz:** statik katalog + etki (CodeQL / OpenAPI) → UI’da Datadog/Backstage gibi görün; APM opsiyonel tamamlayıcı.

---



## 7) Referanstan alınacak feature’lar (§8’e göre)

> §8 gerekliliklerinden türetilen öncelikli set. Onay/flag akışı dependency haritasının **üstünde** bir ürün katmanı.


| #    | Feature                                             | Nereden                                   | Yüzey              | Öncelik       | Bizde nasıl                                                               |
| ---- | --------------------------------------------------- | ----------------------------------------- | ------------------ | ------------- | ------------------------------------------------------------------------- |
| S.1  | **Modül ağacı:** project → jar/package → service    | Backstage catalog tree / IDE Project view | Sol panel          | **P0**        | `project-jars-packages` tarzı; servis doğru paket altında                 |
| S.2  | Servis tıklanınca **etkilenen servisler** listesi   | Datadog Catalog upstream / Sourcegraph    | Sağ panel veya alt | **P0**        | “Bu değişirse kim etkilenir?” — ayırt edilebilir, okunaklı liste          |
| S.3  | Aynı etkilenenlerin **grafik** görünümü (toggle)    | Datadog Service Map inspect               | Diyagram           | **P0**        | Liste ↔ ego-network; büyük graf değil, seçili servis + etkilenen komşular |
| S.4  | Ownership / sorumlu kişi-ekip rozeti                | Backstage / Datadog                       | Ağaç + kart        | **P0**        | Her serviste owner; onay akışının kimliği                                 |
| S.5  | Impact özeti: etkilenen servis + owner listesi      | CodeQL path / Manta / Atlan blast         | Inspector / talep  | **P0**        | Değişiklik talebi açılınca otomatik doldurulur                            |
| S.6  | **Değişiklik talebi** formu: ne / neden             | (ürün — Backstage scaffolder benzeri)     | Modal / sayfa      | **P0**        | Yetkili kişi talep açar; etkilenenlere bildirim                           |
| S.7  | Etkilenen owner **flag:** kabul / red / beklet      | (ürün — PR review / change advisory)      | Talep detayı       | **P0**        | Yeşil / kırmızı / sarı (beklet) / gri (bekliyor)                          |
| S.8  | **Kapı (gate):** tüm onaylar olmadan değişiklik yok | (ürün — policy)                           | Talep durumu       | **P0**        | Mevcut servis değişikliği **ve** yeni servis ekleme                       |
| S.9  | Arama / filtre (servis, modül, owner)               | Backstage / Datadog fuzzy                 | Üst bar            | **P1**        | Binlerce servis için ölçek                                                |
| S.10 | Metod seviyesi (servis altında call-graph)          | JetBrains / CodeQL                        | Ağaç drill-down    | **P1**        | İleride; ilk MVP servis↔servis olabilir                                   |
| S.11 | Kenar tipi: `calls` / `http` / `queue`              | Dynatrace Smartscape                      | Liste + graf       | **P2**        | DB modeli gelince                                                         |
| S.12 | Dependency DB entegrasyonu                          | (mimari)                                  | Ingest             | **P0 (veri)** | UI şimdi mock/API-agnostic; DB gelince bağlanır                           |
| S.13 | Collapsed / lazy load büyük tree                    | Datadog collapsed / mevcut lazy ağaç      | Sol panel          | **P1**        | Büyük codebase’e uygun                                                    |




### UI iskeleti (§8’e göre revize)

```
┌─────────────────────┬──────────────────────────────────────────┐
│ Modül / paket ağacı │  Seçili servis                           │
│ project             │  · owner · etkilenen N                   │
│  └ jar/package      │                                          │
│      └ Service ★    │  [Liste] Etkilenen servisler             │
│          └ …        │    ServisA (owner)  ServisB …            │
│                     │  [Grafik] ego-network (opsiyonel)        │
│ [ara / filtre]      │                                          │
│                     │  [Değişiklik talebi aç]                   │
│                     │    → etkilenen owner’lara bildirim       │
│                     │    → flag: 🟢 kabul 🔴 red 🟡 beklet ⬜ — │
│                     │    → gate: hepsi 🟢 olmadan deploy yok   │
└─────────────────────┴──────────────────────────────────────────┘
```

---



## 8) Nasıl olmalı? (gereklilikler)

> Ham not (2026-08-12) yapılandırıldı. Ek notlar alt başlıklara eklenebilir.



### Ham not (kaynak)

Ekranın bir tarafında project-jars-packages tarzı modüler kısım olacak; servisler onların altında doğru yerlerinde bulunacak. Buradan bir service’e tıklandığında bu servis değişince **etkilenen** diğer servisler ayırt edilebilir, kolay okunabilir biçimde listelenecek veya grafik hale getirilecek. Bağımlılıklar için veritabanı geldiğinde entegre edilecek.

Ürünün amacı: servisi yetkili kişi değiştirdiğinde / değiştirmek istediğinde, o servisi kullanan diğer servislerin sahiplerinin/sorumlularının bilgilendirme alması. Bilgilendirmede değiştirilecek servisin **neyinin / neden** değiştirildiği yer alacak. Etki gören servisin sorumlusu **kabul / red / bekletip kendi servisini ayarlama** yapacak; talebe flag gönderecek (yeşil / kırmızı / sarı / gri). Değiştiren kişi, etkilenen **tüm** servis sorumlularının onayını almadan değişikliği yapamayacak. Bu kural **yeni servis ekleme** için de geçerli. Büyük codebase (çok servis + metod) UI’ya uygun ölçekte olmalı.

### Genel

- Sol: modüler navigasyon (project → jar/package → service).
- Sağ (veya detay): seçili servis değişince **etkilenen** servisler — liste veya grafik.
- Ürün omurgası = dependency görünümü + **değişiklik onay (CAB-benzeri) gate**.
- Ölçek: binlerce servis/metod varsayımı; lazy / filtre / ego-network (tüm grafı bir anda değil).



### Sol panel (modül ağacı)

- `project-jars-packages` benzeri hiyerarşi.
- Servis, ait olduğu paket/modülün **doğru** altında.
- Tıklanınca detay + etkilenen servisler yüklenir.



### Etkilenen servisler görünümü

- Birincil soru: **“Bu değişirse kim etkilenir?”** (teknik: upstream consumers / bu servisi kullananlar).
- UI dili: **etkilenen servisler** (caller denmez).
- Liste: ayırt edilebilir, okunaklı (owner rozeti şart).
- Alternatif: aynı veri grafik (Datadog inspect / ego-network).
- Toggle: Liste | Grafik.



### Değişiklik talebi & onay flag’leri


| Flag       | Anlam (taslak)                                    |
| ---------- | ------------------------------------------------- |
| 🟢 Yeşil   | Kabul — değişiklikten haberdar, OK                |
| 🔴 Kırmızı | Red — bloklar                                     |
| 🟡 Sarı    | Beklet — kendi servisini ayarlayacak / incelemede |
| ⬜ Gri      | Henüz yanıt yok                                   |


- Talep içeriği: **ne** değişiyor + **neden**.
- Gate: etkilenen tüm owner’lar 🟢 olmadan talep tamamlanamaz / değişiklik yapılamaz.
- Kapsam: mevcut servis değişikliği **ve** yeni servis ekleme.



### Etki analizi (“bu değişirse kim?”)

- Talepten önce veya talep açılırken: etkilenen servis + sorumlu listesi.
- Onay UI’si bu liste üzerinden yürür.



### Veri / ingest

- Dependency DB **gelince** entegre; UI şimdiden API’ye bağlanabilir şekilde tasarlanmalı (mock ile geliştirilebilir).
- Kaynak adayları: statik call-graph / OpenAPI / katalog (APM zorunlu değil).



### Bilinçli olarak yapmayacaklarımız (şimdilik)

- Tüm servislerin tek seferde full-mesh haritası (ölçek kırar) — ego-network tercih.
- Runtime APM zorunluluğu.
- *(eklenecek)*

---



## 9) Karar özeti (§8’e göre)


| Konu                    | Karar                                                                    |
| ----------------------- | ------------------------------------------------------------------------ |
| Runtime APM zorunlu mu? | Hayır (opsiyonel)                                                        |
| Birincil UI omurgası    | Sol modül ağacı + seçili servisin **etkilenenleri** (liste/grafik)       |
| Ürün amacı              | Değişiklik / yeni servis → etkilenen owner’lara bildirim + **onay gate** |
| Onay modeli             | Flag: 🟢 kabul · 🔴 red · 🟡 beklet · ⬜ bekliyor; hepsi 🟢 şart          |
| İlk ekran MVP           | Modül ağacı + etkilenenler listesi (+ basit talep/flag iskeleti)         |
| Grafik                  | İkinci görünüm (inspect / ego-network); full map değil                   |
| Veri                    | DB gelince entegre; UI contract önce                                     |
| Metod derinliği         | P1 — MVP’de servis↔servis yeterli olabilir                               |


---



## 10) Link özeti

- Datadog Service Map: [https://docs.datadoghq.com/tracing/services/services_map/](https://docs.datadoghq.com/tracing/services/services_map/)  
- Datadog dependency management: [https://docs.datadoghq.com/internal_developer_portal/use_cases/dependency_management/](https://docs.datadoghq.com/internal_developer_portal/use_cases/dependency_management/)  
- Dynatrace Smartscape: [https://docs.dynatrace.com/docs/discover-dynatrace/references/semantic-dictionary/model/smartscape](https://docs.dynatrace.com/docs/discover-dynatrace/references/semantic-dictionary/model/smartscape)  
- Backstage Catalog: [https://backstage.io/docs/features/software-catalog/](https://backstage.io/docs/features/software-catalog/)  
- CodeQL call graph: [https://codeql.github.com/docs/codeql-language-guides/navigating-the-call-graph/](https://codeql.github.com/docs/codeql-language-guides/navigating-the-call-graph/)  
- JetBrains hierarchy: [https://www.jetbrains.com/help/idea/viewing-structure-and-hierarchy-of-the-source-code.html](https://www.jetbrains.com/help/idea/viewing-structure-and-hierarchy-of-the-source-code.html)  
- New Relic service maps: [https://docs.newrelic.com/docs/apm/apm-ui-pages/service-maps/introduction-service-maps/](https://docs.newrelic.com/docs/apm/apm-ui-pages/service-maps/introduction-service-maps/)


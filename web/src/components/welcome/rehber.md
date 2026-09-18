# `welcome/` — orta alan boşken

**Ekranda:** Henüz soldan **servis, süreç veya iş akışı seçmediğinde** orta sütunda gördüğün karşılama ekranı — kısa tur adımları ve önizleme kartları.

**Ne zaman kaybolur:** Ağaçtan bir servis seçince veya drawer’dan süreç/iş akışı açınca → `shell/ServicesMainStage` başka modülü gösterir.

| Dosya | Ekranda | Ne işe yarar |
|-------|---------|--------------|
| `WelcomeScreen.tsx` | Tüm karşılama sayfası | Adım listesi, spotlight vurgusu |
| `WelcomePreview.tsx` | Her tur adımının mini görseli | “Şuradan başla” illüstrasyonları |

Burada state yok; yalnızca sunum. Kabuk: [shell/rehber.md](../shell/rehber.md).

# Clean UI — Grup E (primitifler)

Aktif yaklaşım: **UI primitifleri** (`web/src/ui/`).

Geri alınanlar:
- **G — Motion** (modal fade-only, tema glow kaldırma, morph hover kaldırma)
- **F — Tam ekran form** (`ChangeRequestPage` → tekrar `ChangeRequestModal`)

Pilot: `ServiceOverview` (Düzenle modu + bento kartlar).

---

## Test senaryoları — E

1. **Servis işlevi → Düzenle** → `Field` input’ları tutarlı yükseklik ve focus  
2. **İptal / Kaydet** → `Button` primitifi (ghost / primary)  
3. **Kimlik kartı** → spotlight animasyonu geri (G geri alındı)  
4. **Değişiklik talebi** → modal açılır (F geri alındı); eski `btn` sınıfları  
5. **Mixed tema** → primitif formlar okunaklı  

### Hızlı duman

1. Servis seç → Servis işlevi → Düzenle → alan stili ✓  
2. Değişiklik talebi → **modal** (tam sayfa değil) ✓  
3. Sidebar pin → morph hover ✓  
4. Tema switch → glow + ikon animasyonu ✓  

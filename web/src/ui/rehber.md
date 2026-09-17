# `ui/` — paylaşılan form / kart bileşenleri

Hafif tasarım sistemi; DWH ve bazı modallarda kullanılır. Stil: `ui/ui.css`.

| Dosya | Rol |
|-------|-----|
| `Button.tsx` | Birincil / ikincil düğme |
| `Field.tsx` | Label + input sarmalayıcı |
| `Card.tsx`, `Section.tsx` | Blok düzeni |
| `index.ts` | Re-export |

Servis kabuğu çoğunlukla kendi sınıflarını (`App.css`, `shell.css`) kullanır; `ui/` zorunlu değildir her ekranda. Bileşen grupları: [components/rehber.md](../components/rehber.md).

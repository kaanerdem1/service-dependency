etki özeti için hangi servisin üzerine gelirsem onun özetini gösterecek bir tasarım düşünülebilir ? 





## Yapılması gereken ana değişiklik

`web/src/impact/mapLayout.ts` içindeki:

```
export function radialLabelSidePrefs(
```

angle: number,

isCenter: boolean,

): RadialLabelSide[] {

fonksiyonunu değiştir.

Şu anki:

```
export function radialLabelSidePrefs(
```

angle: number,

isCenter: boolean,

): RadialLabelSide[] {

if (isCenter) return ['below', 'above', 'east', 'west']

const c = Math.cos(angle)

const s = Math.sin(angle)

const preferred: RadialLabelSide =

c > 0.35 ? 'east' : c < -0.35 ? 'west' : s >= 0 ? 'below' : 'above'

return [preferred]

}

yerine bunu kullan:

```
export function radialLabelSidePrefs(
```

angle: number,

isCenter: boolean,

): RadialLabelSide[] {

if (isCenter) {

return ['below', 'above', 'east', 'west']

  }

const c = Math.cos(angle)

const s = Math.sin(angle)

if (c > 0.35) {

return ['east', 'above', 'below', 'west']

  }

if (c < -0.35) {

return ['west', 'above', 'below', 'east']

  }

if (s >= 0) {

return ['below', 'east', 'west', 'above']

  }

return ['above', 'east', 'west', 'below']

}

## Bunun etkisi ne olacak?

Mesela bir node'un doğal yönü sağ tarafsa:

```
1. east  → dene
```

   ↓ çakıştı

2. above → dene

   ↓ çakıştı

3. below → dene

   ↓ çakıştı

4. west  → dene

İlk boş alanı kullanacak.

Senin mevcut `placeRadialLabels()` fonksiyonun zaten:

-  başka label ile çakışmayı, 
-  başka node/dot ile çakışmayı, 
-  edge ile çakışmayı 

kontrol edecek altyapıya sahip. Yani **bu fonksiyon zaten doğru yönde yazılmış**, ama `radialLabelSidePrefs()` ona tek seçenek verdiği için sistem tam çalışmıyor. 

---

## Ama %100 garanti için ikinci bir problem daha var

Kod şu anda edge-label çakışmasını kontrol ederken edge'i esas olarak **düz bir çizgi segmenti gibi** hesaplıyor:

```
segHitsRect(pa.x, pa.y, pb.x, pb.y, box, 3)
```

Fakat ekranda çizdiğin gerçek radial edge düz değil; `radialEdgeGeometry()` ile quadratic curve çiziyorsun:

```
M x0,y0 Q c1x,c1y x3,y3
```

Yani layout:

> "Label bu düz çizgiye değmiyor."

diyebiliyor.

Ama gerçek render edilen eğri biraz dışarı kıvrıldığı için:

> "Ekranda okun üstünden geçiyor."

durumu oluşabiliyor. Senin screenshot'taki bazı çakışmaların ikinci sebebi de bu. Edge'in gerçek çizim geometrisi ile collision geometrisi birebir aynı değil. 

---

# Benim önerdiğim çözüm sırası

### 1. Önce mutlaka alternatif label side'larını ekle

Bu en önemli düzeltme:

```
return [preferred]
```

yerine sıralı alternatifler dön.

Bu tek değişiklik büyük ihtimalle screenshot'taki sorunun önemli kısmını çözecek.

### 2. Label gap'i biraz artır

Şu anda radial label gap:

```
export const RADIAL_LABEL_GAP = 14
```

Bunu:

```
export const RADIAL_LABEL_GAP = 20
```

yapabilirsin.

Bu doğrudan çözüm değil ama node noktasına ve edge başlangıç/bitişlerine daha fazla nefes alanı verir. 

### 3. En sağlam çözüm: curved edge collision

`segHitsRect()` yerine radial edge'in quadratic eğrisini örnekleyip yaklaşık 10–16 küçük segment halinde collision kontrolü yap.

Mantık:

```
gerçek curved edge
```

       ↓

12 noktaya böl

       ↓

her küçük segment

       ↓

label bounding box'a değiyor mu?

Böylece layout motorunun gördüğü edge ile kullanıcının ekranda gördüğü edge aynı olur.

---

## Kısaca teşhis

**Şu an sistemde collision detection var ama label reposition sistemi eksik çalışıyor.**

Özellikle bu satır mantıksal bug:

```
return [preferred]
```

Çünkü `placeRadialLabels()` alternatif pozisyonları denemek için yazılmış, fakat ona alternatif verilmemiş. Bunun düzeltilmesi ilk yapılması gereken değişiklik. Sonrasında curved edge collision eklenirse **isimlerin ne node'ların ne de okların üzerine gelmemesini çok daha sağlam şekilde garanti edebilirsin**. 
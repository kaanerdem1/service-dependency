import type { ProcessFlowGraph, ProcessFlowNodeKind } from '../types'

export type HlKind = ProcessFlowNodeKind | 'group'

export type HlBlock = {
  id: string
  xmlIds: string[]
  title: string
  hint?: string
  kind: HlKind
}

export type HlArm = {
  label: string
  blocks: HlPiece[]
}

export type HlFork = {
  type: 'fork'
  gate: HlBlock
  arms: HlArm[]
}

export type HlGroup = {
  type: 'group'
  title: string
  hint?: string
  blocks: HlPiece[]
}

export type HlPiece = HlBlock | HlFork | HlGroup

export type HlLane = {
  id: string
  title: string
  tone: 'sistem' | 'akış' | 'yetki' | 'bolge' | 'revize' | 'sonuc'
  pieces: HlPiece[]
}

export type HlOverview = {
  title: string
  note: string
  lanes: HlLane[]
}

function b(
  xmlId: string,
  title: string,
  kind: HlKind,
  hint?: string,
  extraIds: string[] = [],
): HlBlock {
  return { id: xmlId, xmlIds: [xmlId, ...extraIds], title, hint, kind }
}

/** 105116 — PNG’deki poster dili; sıra XML’deki mutlu yola göre (Başlatan Kontrol start değil). */
export function ktfHighLevel(): HlOverview {
  return {
    title: 'KTF Düzenleme — yüksek seviye',
    note: 'Özet XML’den türetilir; 63 adım / 137 geçişin hepsi burada yok. Kutuya tıklayınca gerçek adım açılır.',
    lanes: [
      {
        id: 'sistem',
        title: 'Sistem',
        tone: 'sistem',
        pieces: [b('start', 'Başlangıç', 'start', 'start-state')],
      },
      {
        id: 'akis',
        title: 'Ana akış',
        tone: 'akış',
        pieces: [
          {
            type: 'fork',
            gate: b('Takip müşterisi mi?', 'Takip müşterisi mi?', 'decision'),
            arms: [
              {
                label: 'Evet',
                blocks: [
                  b('Şube Onayı', 'Şube Onayı', 'task', 'PY / YPY / SBM öncesi şube'),
                  b(
                    'YTYET veya YTMUD veya KİBŞK onayı',
                    'YTYET / YTMUD / KİBŞK',
                    'task',
                  ),
                ],
              },
              {
                label: 'Hayır',
                blocks: [
                  {
                    type: 'fork',
                    gate: b('Otomatik KTF mi?', 'Otomatik KTF mi?', 'decision'),
                    arms: [
                      {
                        label: 'true',
                        blocks: [b('end2', 'Tamamlandı', 'end', 'end2')],
                      },
                      {
                        label: 'false',
                        blocks: [
                          b(
                            'Ürün-Kampanya Kontrolleri',
                            'Ürün-Kampanya Kontrolleri',
                            'decision',
                            '1 / 2 / 3 / 200 → Oran Vade',
                          ),
                          b('Oran Vade Kontrol', 'Oran Vade Kontrol', 'service'),
                          b('PY veya YPY veya SBM Onay', 'PY / YPY / SBM Onay', 'task'),
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'yetki',
        title: 'Onay / yetki',
        tone: 'yetki',
        pieces: [
          {
            type: 'fork',
            gate: b(
              'Kredi kullandırılacak firmanın tahsisi Finansal Kurumlar tarafından mı yapılmış?',
              'Finansal Kurumlar tarafından mı?',
              'decision',
            ),
            arms: [
              {
                label: 'Evet',
                blocks: [b('Finansal Kurumlar Onayı', 'Finansal Kurumlar Onayı', 'task')],
              },
              {
                label: 'Hayır',
                blocks: [
                  {
                    type: 'fork',
                    gate: b('Özel Maliyet mi?', 'Özel Maliyet mi?', 'decision'),
                    arms: [
                      {
                        label: 'true',
                        blocks: [b('Fon Yönetimi', 'Fon Yönetimi', 'task')],
                      },
                      {
                        label: 'false',
                        blocks: [
                          {
                            type: 'group',
                            title: 'Yetki ve segment kontrolleri',
                            hint: 'XML’de sıralı karar zinciri; burada tek blok',
                            blocks: [
                              b(
                                'Fiyatlama _ Risk Vadesi _ Mektup_ Metni _ Muhattap_Amir Risk Şube Yetkisinde mi?',
                                'Fiyatlama / risk / mektup şube yetkisi',
                                'decision',
                              ),
                              b('Fiyatlama Şube Yetkisinde mi?', 'Fiyatlama şube yetkisi', 'decision'),
                              b('Masraf Şube Yetkisinde mi?', 'Masraf şube yetkisi', 'decision'),
                              b(
                                'Amir Risk ve Kullandırım, Amir Risk Bölge İşlem Limiti üzerinde mi?',
                                'Amir risk / bölge limiti',
                                'decision',
                              ),
                              b('Müşteri Segmenti2', 'Müşteri segmenti', 'decision'),
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'bolge',
        title: 'Bölge / şube',
        tone: 'bolge',
        pieces: [
          {
            type: 'group',
            title: 'Segment ve bölge onayları',
            hint: 'Aynı anda tek yol; XML’de ayrı task-node’lar',
            blocks: [
              b('KTF KOBİPAZMUD Onayı', 'KTF KOBİPAZMUD', 'task'),
              b('KTF TİBPMUD Onayı', 'KTF TİBPMUD', 'task'),
              b('KTF İBPMUD Onayı', 'KTF İBPMUD', 'task'),
              b('KTF TRMBPMUD Onayı', 'KTF TRMBPMUD', 'task'),
              b('KTF KBPFYET Onayı', 'KTF KBPFYET', 'task'),
              b('KTF PBSMUD Onayı', 'KTF PBSMUD Onayı', 'task'),
              b('TARYET', 'TARYET', 'task'),
              b('KRDY', 'KRDY', 'task'),
              b('PKİŞL-PKONAY', 'PKİŞL-PKONAY', 'task'),
            ],
          },
          {
            type: 'fork',
            gate: b('Yapılandırma KTF simi?', 'Yapılandırma KTF mi?', 'decision'),
            arms: [
              {
                label: 'Evet',
                blocks: [
                  b('Ticari şube mi?(IZL)', 'Ticari şube mi? (IZL)', 'decision'),
                  b('BOPAZ(IZL)', 'BOPAZ (IZL)', 'task'),
                  b(
                    'YTYET veya YTMUD veya KİBŞK onayı2',
                    'YTYET / YTMUD / KİBŞK (2)',
                    'task',
                  ),
                ],
              },
              {
                label: 'Hayır',
                blocks: [b('runActionServices', 'runActionServices', 'service')],
              },
            ],
          },
        ],
      },
      {
        id: 'revize',
        title: 'Revize',
        tone: 'revize',
        pieces: [
          b(
            'Ürün-Kampanya Kontrolleri - Şube Havuzu',
            'Değişiklik Yap',
            'decision',
            'Onaylardan Şube Havuzu kampanyasına dönüş',
          ),
          b('Şube Havuzu', 'Şube Havuzu', 'task'),
          b(
            'Başlatan Kontrol',
            'Başlatan Kontrol',
            'task',
            'Start değil; bölge tahsisten sonra Oran Vade’ye döner',
          ),
        ],
      },
      {
        id: 'sonuc',
        title: 'Sonuç',
        tone: 'sonuc',
        pieces: [
          b('Reddet', 'Reddet', 'service', 'Paylaşılan uç · 25 giriş'),
          b('runActionServices', 'runActionServices', 'service', 'Onay sonrası'),
          b('end1', 'Tamamlandı', 'end', 'end1'),
          b('Programatik Reddet', 'Programatik Reddet', 'end', 'XML’de bağlantısız'),
          b('Manuel Reddet', 'Manuel Reddet', 'end', 'XML’de bağlantısız'),
          b('Otomatik Reddet', 'Otomatik Reddet', 'end', 'XML’de bağlantısız'),
          b('İptal Et', 'İptal', 'end'),
        ],
      },
    ],
  }
}

function isDummy(id: string) {
  return id.startsWith('d:')
}

/** Küçük POC süreçleri: tek şerit + sonuç. */
export function genericHighLevel(graph: ProcessFlowGraph): HlOverview {
  const reals = graph.nodes.filter((n) => n.kind !== 'dummy')
  const incoming = new Map<string, number>()
  for (const n of reals) incoming.set(n.id, 0)
  for (const e of graph.edges) {
    if (isDummy(e.from) || isDummy(e.to)) continue
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1)
  }
  const sinks = reals.filter((n) => {
    const nm = n.name.toLowerCase()
    return (
      n.kind === 'end' ||
      nm === 'reddet' ||
      nm === 'runactionservices' ||
      (incoming.get(n.id) === 0 && n.kind !== 'start')
    )
  })
  const sinkIds = new Set(sinks.map((n) => n.id))
  const main = reals.filter((n) => !sinkIds.has(n.id) || n.kind === 'start')
  return {
    title: `${graph.label || graph.no} — yüksek seviye`,
    note: 'Küçük süreç: adımlar özet şeritte. Büyük süreçlerdeki poster 105116 için XML’den derlendi.',
    lanes: [
      {
        id: 'akis',
        title: 'Süreç',
        tone: 'akış',
        pieces: main.map((n) => b(n.id, n.name, n.kind)),
      },
      {
        id: 'sonuc',
        title: 'Sonuç',
        tone: 'sonuc',
        pieces: sinks.filter((n) => n.kind !== 'start').map((n) => b(n.id, n.name, n.kind)),
      },
    ],
  }
}

export function highLevelFor(graph: ProcessFlowGraph): HlOverview {
  if (graph.no === '105116') return ktfHighLevel()
  return genericHighLevel(graph)
}

export function lookupNodes(graph: ProcessFlowGraph, xmlIds: string[]) {
  return xmlIds
    .map((id) => graph.nodes.find((n) => n.id === id))
    .filter((n): n is ProcessFlowGraph['nodes'][number] => !!n)
}

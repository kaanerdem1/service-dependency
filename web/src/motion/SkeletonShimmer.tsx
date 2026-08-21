import { motion } from 'motion/react'

type Props = {
  className?: string
  lines?: number
}

export function SkeletonShimmer({ className = 'skeleton block', lines = 1 }: Props) {
  return (
    <div className="motion-skeleton" data-motion="skeleton-shimmer" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <motion.div
          key={i}
          className={className}
          initial={{ opacity: 0.45 }}
          animate={{ opacity: [0.45, 0.85, 0.45] }}
          transition={{
            duration: 1.35,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.08,
          }}
        />
      ))}
    </div>
  )
}

export function MapLoadingSkeleton() {
  return (
    <div className="map-loading-skeleton" data-motion="map-skeleton" aria-hidden>
      <SkeletonShimmer className="map-skeleton-node" lines={5} />
      <p className="map-loading-skeleton-label">Harita yükleniyor…</p>
    </div>
  )
}

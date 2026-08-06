const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #3b82f6, #2563eb)',
  'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #ef4444, #dc2626)',
  'linear-gradient(135deg, #06b6d4, #0891b2)',
  'linear-gradient(135deg, #ec4899, #db2777)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
]

// 稳定哈希：同一公司永远同一个颜色
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return h
}

interface Props {
  name: string
  id?: string
  size?: 'sm' | 'md'
}

/** 公司首字渐变色块，作为无 logo 时代的形象标识 */
export default function CompanyAvatar({ name, id, size = 'sm' }: Props) {
  const gradient = AVATAR_GRADIENTS[hash(id ?? name) % AVATAR_GRADIENTS.length]
  const letter = (name.trim().charAt(0) || '?').toUpperCase()
  return (
    <span className={`avatar avatar-${size}`} style={{ background: gradient }} aria-hidden="true">
      {letter}
    </span>
  )
}

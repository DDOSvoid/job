interface Props {
  title: string
  hint?: string
}

export default function EmptyState({ title, hint }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🗂️</div>
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  )
}

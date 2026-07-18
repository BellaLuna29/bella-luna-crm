interface TopbarProps {
  title: string
  subtitle: string
}

function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="h-18 bg-white border-b border-border flex items-center px-8 shrink-0">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="text-sm text-text-muted mt-0.5">{subtitle}</div>
      </div>
    </header>
  )
}

export default Topbar

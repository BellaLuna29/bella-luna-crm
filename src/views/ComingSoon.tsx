interface ComingSoonProps {
  title: string
}

function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="bg-white border border-border rounded-2xl p-10 text-center">
      <h3 className="font-serif text-xl font-semibold text-sage-dark">{title}</h3>
      <p className="mt-2 text-sm text-text-muted">Bientôt disponible.</p>
    </div>
  )
}

export default ComingSoon

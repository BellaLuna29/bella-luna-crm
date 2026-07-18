function ClerkSetupNeeded() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="bg-white border border-border rounded-2xl px-10 py-10 max-w-md text-center shadow-sm">
        <div className="w-14 h-14 rounded-full bg-gold-pale flex items-center justify-center mx-auto mb-5">
          <span className="font-serif font-semibold text-xl text-sage-dark">!</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold text-sage-dark">
          Connexion à Clerk à finaliser
        </h1>
        <p className="mt-4 text-sm text-text-muted leading-relaxed">
          La clé Clerk n'est pas encore renseignée. Ajoute ta clé publique dans
          le fichier <code className="px-1.5 py-0.5 rounded bg-sage-pale text-sage-dark">.env.local</code> à
          la racine du projet, sous la variable{' '}
          <code className="px-1.5 py-0.5 rounded bg-sage-pale text-sage-dark">
            VITE_CLERK_PUBLISHABLE_KEY
          </code>
          , puis relance <code className="px-1.5 py-0.5 rounded bg-sage-pale text-sage-dark">npm run dev</code>.
        </p>
      </div>
    </div>
  )
}

export default ClerkSetupNeeded

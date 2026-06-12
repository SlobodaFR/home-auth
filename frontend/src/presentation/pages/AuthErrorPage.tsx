import { useSearchParams } from 'react-router-dom';

const MESSAGES: Record<string, { title: string; description: string }> = {
  forbidden: {
    title: 'Acces non autorise',
    description: "Votre compte n'a pas acces a cette application. Contactez un administrateur pour en demander l'acces.",
  },
  unknown_client: {
    title: 'Application inconnue',
    description: "Cette application n'est pas enregistree auprès du service d'authentification.",
  },
  invalid_request: {
    title: 'Requete invalide',
    description: 'La demande de connexion est invalide ou incomplete. Revenez sur l\'application et reessayez.',
  },
};

const DEFAULT_MESSAGE = {
  title: 'Une erreur est survenue',
  description: 'Impossible de poursuivre la connexion. Revenez sur l\'application et reessayez.',
};

export function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason') ?? '';
  const client = searchParams.get('client');

  const { title, description } = MESSAGES[reason] ?? DEFAULT_MESSAGE;

  return (
    <main className="bg-soft-cloud min-h-screen flex items-center justify-center p-margin-mobile md:p-margin-desktop">
      <div className="bg-canvas border border-hairline rounded-xl p-xl shadow-soft text-center max-w-[440px] w-full">
        <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-lg">
          <span className="material-symbols-outlined !text-[32px]">block</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-ink mb-md tracking-tight">{title}</h1>
        <p className="font-body-md text-body-md text-mute mb-xl leading-relaxed">{description}</p>
        {client && (
          <p className="font-caption text-caption text-mute mb-xl break-all">
            Application : <span className="text-charcoal">{client}</span>
          </p>
        )}
        <a
          href="/"
          className="font-button-md text-button-md text-primary hover:underline transition-colors"
        >
          Retour a l'accueil
        </a>
      </div>
    </main>
  );
}

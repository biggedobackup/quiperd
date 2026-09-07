import { Toaster, toast } from 'sonner'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { icone } from '@/lib/icones'

/** Conteneur des toasts (une fois, dans la racine). Bloc arrondi, filet fin, ombre douce. */
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-start gap-3 rounded-xl border border-trait bg-papier px-4 py-3 text-encre shadow-carte-forte font-texte text-legende',
          title: 'font-bold text-corps leading-tight',
          description: 'text-muet',
          success: 'border-gain',
          error: 'border-perte',
          info: 'border-info',
          warning: 'border-alerte',
        },
      }}
      icons={{
        success: <FontAwesomeIcon icon={icone.succes} className="mt-0.5 text-gain" />,
        error: <FontAwesomeIcon icon={icone.erreur} className="mt-0.5 text-perte" />,
        info: <FontAwesomeIcon icon={icone.info} className="mt-0.5 text-info" />,
        warning: <FontAwesomeIcon icon={icone.attention} className="mt-0.5 text-alerte" />,
        loading: <FontAwesomeIcon icon={icone.chargement} className="mt-0.5 animate-rotation" />,
      }}
    />
  )
}

export function toastSucces(titre: string, description?: string) {
  toast.success(titre, { description })
}

export function toastErreur(titre: string, description?: string) {
  toast.error(titre, { description })
}

export function toastInfo(titre: string, description?: string) {
  toast.info(titre, { description })
}

export function toastAttention(titre: string, description?: string) {
  toast.warning(titre, { description })
}

import { ReactNode, useEffect, useId, useRef } from 'react';

/**
 * Modal built on the native <dialog>: showModal() gives the focus trap, the inert background
 * and Escape-to-close for free. Mounted = open; the parent unmounts it in onClose.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // The content fills the dialog box, so a click on the dialog itself is a backdrop click.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="w-[calc(100%-2rem)] max-w-lg max-h-[85vh] p-0 rounded-xl border border-hairline bg-canvas text-ink shadow-lg backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-lg p-lg">
        <div className="flex items-center justify-between gap-md">
          <h2
            id={titleId}
            className="font-body-strong text-body-strong text-ink min-w-0 truncate"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg text-mute hover:bg-soft-cloud transition-all"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

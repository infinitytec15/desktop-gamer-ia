import {
  type ReactNode,
  type ReactElement,
  type MouseEvent,
  useEffect,
  useRef,
  useId,
  cloneElement,
  isValidElement,
} from "react";
import { Zap, X, LoaderCircle, Inbox } from "lucide-react";
import { navigate } from "./lib";
export function Link({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  function click(e: MouseEvent<HTMLAnchorElement>) {
    if (
      e.button === 0 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();
      navigate(to);
    }
  }
  return (
    <a href={to} className={className} onClick={click}>
      {children}
    </a>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <Zap fill="currentColor" size={20} />
      </span>
      {!compact && (
        <span>
          gameforge<span className="brand-ai">ai</span>
        </span>
      )}
    </Link>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" />
      <p>Carregando dados…</p>
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <p>{children}</p>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
            }>,
            { id, "aria-describedby": hint ? id + "-hint" : undefined },
          )
        : children}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const before = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => {
      d?.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="modal"
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button onClick={onClose} className="icon-button" aria-label="Fechar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

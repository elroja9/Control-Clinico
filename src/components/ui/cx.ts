/** Une clases CSS ignorando valores falsos. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Props DOM genéricas. El proyecto no instala @types/react (React 19 sin tipos), así que
 * `ComponentPropsWithRef<'button'>` y similares no resuelven; este tipo deja pasar className,
 * children y cualquier atributo nativo (onClick, aria-*, ref...) hacia el elemento. */
export type DomProps = {
  className?: string;
  children?: import('react').ReactNode;
  [prop: string]: any;
};

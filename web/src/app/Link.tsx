import type { Route } from "@hauntology/shared/app/types";
import { pathFor } from "@hauntology/shared/app/routes";
import type { MouseEvent, ReactNode } from "react";
import { useShell } from "./context";

/**
 * A link to a route. A plain click goes through the router (no reload); a click with a modifier key,
 * a middle click or a link that opens elsewhere keeps the browser's own behaviour. It is a real
 * `<a href>`, so it works from the keyboard and in a new tab.
 */
export function Link({ to, className, children }: { to: Route; className?: string; children: ReactNode }) {
  const { router } = useShell();
  const href = pathFor(to);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    router.navigate(to);
  };
  return (
    <a className={className} href={href} onClick={onClick}>
      {children}
    </a>
  );
}

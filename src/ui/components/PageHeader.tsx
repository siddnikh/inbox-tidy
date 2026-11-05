import type { ComponentChildren } from "preact";

export function PageHeader({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="page-header">
      <h1 class="large-title">{title}</h1>
      {children && <div class="page-header-actions">{children}</div>}
    </div>
  );
}

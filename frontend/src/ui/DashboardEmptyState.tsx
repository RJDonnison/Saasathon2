import type { ReactNode } from "react";
import Heading from "./Heading.tsx";
import { CARD } from "./styles.ts";

type DashboardEmptyStateProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
  notice?: ReactNode;
  children?: ReactNode;
};

export default function DashboardEmptyState({
  eyebrow,
  title,
  description,
  icon,
  action,
  notice,
  children,
}: DashboardEmptyStateProps) {
  return (
    <div className="flex min-h-[calc(100dvh-11rem)] items-center justify-center py-6">
      <section className={`${CARD} w-full max-w-2xl p-6 sm:p-10`}>
        {notice}
        <div className="mx-auto flex max-w-lg flex-col items-center gap-5 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent/20 text-ink">
            {icon}
          </span>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-[0.12em] text-muted">
              {eyebrow}
            </span>
            <Heading as="h1" variant="title" className="text-[30px]! sm:text-[36px]!">
              {title}
            </Heading>
            <p className="m-0! text-[15px]! leading-6! text-muted">
              {description}
            </p>
          </div>
          {action}
          {children}
        </div>
      </section>
    </div>
  );
}

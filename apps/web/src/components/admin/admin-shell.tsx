import Link from "next/link";

type AdminShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

const links = [
  { href: "/ingesta", label: "Ingesta" },
];

export function AdminShell({ title, description, children }: AdminShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-line bg-surface px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
          Operaciones de datos
        </p>
        <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-700 sm:text-base">{description}</p>
        <nav className="mt-4 flex flex-wrap gap-2">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

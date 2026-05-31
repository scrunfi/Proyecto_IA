type PdfSummaryButtonProps = {
  businessId: string;
};

export function PdfSummaryButton({ businessId }: PdfSummaryButtonProps) {
  return (
    <a
      href={`/negocio/${encodeURIComponent(businessId)}?summary=pdf`}
      className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100"
    >
      Informe
    </a>
  );
}

import { Spinner } from "@/components/ui";

export default function RootLoading() {
  return (
    <div
      className="animate-in"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <Spinner size={28} style={{ color: "var(--accent)" }} />
      <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontWeight: 545 }}>Loading…</span>
    </div>
  );
}

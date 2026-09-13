export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        position: "relative",
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        className="auth-orb"
        style={{
          width: 420,
          height: 420,
          top: "-12%",
          left: "-10%",
          background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)",
          opacity: 0.35,
        }}
      />
      <div
        aria-hidden="true"
        className="auth-orb"
        style={{
          width: 380,
          height: 380,
          bottom: "-14%",
          right: "-8%",
          background: "radial-gradient(circle, var(--success) 0%, transparent 70%)",
          opacity: 0.22,
          animationDelay: "-6s",
          animationDirection: "reverse",
        }}
      />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 400 }}>{children}</div>
    </main>
  );
}

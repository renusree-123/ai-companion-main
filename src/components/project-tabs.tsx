"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "Overview", icon: "🧭" },
  { slug: "materials", label: "Materials", icon: "📄" },
  { slug: "tutor", label: "AI Tutor", icon: "🤖" },
  { slug: "quiz", label: "Quiz", icon: "❓" },
  { slug: "flashcards", label: "Flashcards", icon: "🧠" },
  { slug: "growth", label: "Growth", icon: "📈" },
  { slug: "analytics", label: "Analytics", icon: "📊" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav
      style={{
        display: "flex",
        gap: 2,
        borderBottom: "1px solid var(--border)",
        overflowX: "auto",
      }}
    >
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = tab.slug ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={tab.slug}
            href={href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              fontSize: 13,
              fontWeight: 545,
              whiteSpace: "nowrap",
              color: active ? "var(--text)" : "var(--text-muted)",
              borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

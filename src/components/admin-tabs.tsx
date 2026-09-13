"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview", icon: "🧭", exact: true },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/spaces", label: "Spaces", icon: "🗂️" },
  { href: "/admin/projects", label: "Projects", icon: "📦" },
  { href: "/admin/activity", label: "Activity", icon: "🕒" },
  { href: "/admin/analytics", label: "Learning analytics", icon: "📊" },
  { href: "/admin/ai", label: "AI usage", icon: "🤖" },
  { href: "/admin/evaluation", label: "AI evaluation", icon: "🧪" },
  { href: "/admin/health", label: "System health", icon: "❤️" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              fontSize: 12.8,
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

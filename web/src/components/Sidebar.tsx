"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_GROUPS, type NavEntry, type NavLeaf } from "@/lib/nav";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

function Leaf({ item, child, pathname }: { item: NavLeaf; child?: boolean; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={`navitem${child ? " navitem--child" : ""}${active ? " navitem--active" : ""}`}
      title={item.roleKey ?? undefined}
    >
      {!child && <span className="navitem__icon">{item.icon ?? "·"}</span>}
      <span>{item.label}</span>
    </Link>
  );
}

function Submenu({ entry, pathname }: { entry: Extract<NavEntry, { kind: "submenu" }>; pathname: string }) {
  const containsActive = entry.children.some((child) => isActive(pathname, child.href));
  const [open, setOpen] = useState(Boolean(entry.defaultOpen) || containsActive);
  const expanded = open || containsActive;

  return (
    <div>
      <button
        type="button"
        className={`navitem${containsActive ? " navitem--active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="navitem__icon">{entry.icon ?? "·"}</span>
        <span>{entry.label}</span>
        <span className="navitem__chevron">{expanded ? "▼" : "▶"}</span>
      </button>
      {expanded &&
        entry.children.map((child) => <Leaf key={child.key} item={child} child pathname={pathname} />)}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">AS</span>
        <span>Archisketch</span>
      </div>
      <nav className="sidebar__nav">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? `g${groupIndex}`}>
            {group.label && <div className="sidebar__group-label">{group.label}</div>}
            {group.items.map((entry) =>
              entry.kind === "leaf" ? (
                <Leaf key={entry.key} item={entry} pathname={pathname} />
              ) : (
                <Submenu key={entry.key} entry={entry} pathname={pathname} />
              ),
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}

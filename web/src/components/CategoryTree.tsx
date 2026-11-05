"use client";

import Link from "next/link";
import { useState } from "react";

export type TreeNodeData = {
  id: string;
  name: string;
  productCount: number;
  descendantProductCount: number;
  children: TreeNodeData[];
};

function Node({
  node,
  selectedId,
  openIds,
  toggle,
  hrefFor,
  depth,
}: {
  node: TreeNodeData;
  selectedId: string;
  openIds: Set<string>;
  toggle: (id: string) => void;
  hrefFor: (id: string) => string;
  depth: number;
}) {
  const hasChildren = node.children.length > 0;
  const open = openIds.has(node.id);
  const selected = node.id === selectedId;

  return (
    <div>
      <div className={`tree-row${selected ? " tree-row--selected" : ""}`}>
        <button
          type="button"
          className="tree-row__toggle"
          onClick={() => hasChildren && toggle(node.id)}
          aria-label={hasChildren ? (open ? "접기" : "펼치기") : undefined}
          aria-expanded={hasChildren ? open : undefined}
        >
          {hasChildren ? (open ? "▼" : "▶") : ""}
        </button>
        <Link href={hrefFor(node.id)} className="tree-row__link" title={node.name}>
          <span aria-hidden>{hasChildren ? (open ? "📂" : "📁") : "📄"}</span>
          <span className="tree-row__name">{node.name}</span>
          <span className="tree-row__count">
            {node.descendantProductCount.toLocaleString("ko-KR")}
          </span>
        </Link>
      </div>
      {hasChildren && open && (
        <div className="tree-children">
          {node.children.map((child) => (
            <Node
              key={child.id}
              node={child}
              selectedId={selectedId}
              openIds={openIds}
              toggle={toggle}
              hrefFor={hrefFor}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryTree({
  root,
  selectedId,
  expandedIds,
  basePath,
  title = "카테고리",
  newLabel = "새로운 카테고리",
}: {
  root: TreeNodeData;
  selectedId: string;
  /** ids on the path to the selection - opened on first render */
  expandedIds: string[];
  basePath: string;
  title?: string;
  newLabel?: string;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set([root.id, ...expandedIds]));

  const toggle = (id: string) =>
    setOpenIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hrefFor = (id: string) =>
    id === root.id ? basePath : `${basePath}?category=${encodeURIComponent(id)}`;

  return (
    <div className="library__tree">
      <div className="library__tree-head">
        <strong style={{ fontSize: 12.5 }}>{title}</strong>
        <button type="button" className="btn btn--sm btn--disabled" title="클론에서는 동작하지 않습니다">
          + {newLabel}
        </button>
      </div>
      <Node
        node={root}
        selectedId={selectedId}
        openIds={openIds}
        toggle={toggle}
        hrefFor={hrefFor}
        depth={0}
      />
    </div>
  );
}

/**
 * Sidebar menu, transcribed from spec section 4 (the bundle's own menu
 * definition). Group order and item order match the table.
 * The original renders <button> + router.push; the clone uses <Link> so the
 * nav is actually navigable.
 */

export type NavLeaf = {
  key: string;
  label: string;
  href: string;
  roleKey?: string;
  icon?: string;
};

export type NavEntry =
  | (NavLeaf & { kind: "leaf" })
  | {
      kind: "submenu";
      key: string;
      label: string;
      icon?: string;
      roleKey?: string;
      defaultOpen?: boolean;
      children: NavLeaf[];
    };

export type NavGroup = {
  /** undefined = ungrouped block at the top */
  label?: string;
  items: NavEntry[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { kind: "leaf", key: "homePage", label: "시작하기", href: "/ko/home-page", roleKey: "page/HOME_PAGE", icon: "◆" },
      { kind: "leaf", key: "Agent", label: "Archisketch AI", href: "/ko/agent", icon: "✦" },
      { kind: "leaf", key: "Avo", label: "AI 마감재", href: "/ko/avo", roleKey: "page/AVO", icon: "◇" },
    ],
  },
  {
    label: "프로젝트",
    items: [
      // 내 프로젝트 / 프로젝트 / 공유 프로젝트 are dropped on purpose - only the
      // enterprise-wide list (원본 /ko/projects/team) is kept, at top level.
      { kind: "leaf", key: "allProjects", label: "전체 프로젝트", href: "/ko/projects/team", icon: "▣" },
    ],
  },
  // The 견적/상담 group (상담 관리 /v3/order, 전체 상담 관리 /v3/order/all,
  // 고객 관리 /v3/customers, 채팅 /chat) is intentionally omitted from this
  // clone, heading included.
  {
    label: "라이브러리",
    items: [
      {
        kind: "leaf",
        key: "personalLibrary",
        label: "개인 라이브러리",
        href: "/ko/personal-library/model",
        roleKey: "page/PERSONAL_LIBRARY_FURNITURE",
        icon: "▥",
      },
      {
        kind: "submenu",
        key: "enterpriseLibrary",
        label: "기업 라이브러리",
        icon: "▦",
        roleKey: "page/ENTERPRISE_LIBRARY",
        defaultOpen: true,
        children: [
          { key: "furniture", label: "가구", href: "/ko/enterprise-library/products/furniture", roleKey: "page/ENTERPRISE_LIBRARY" },
          { key: "finishes", label: "마감재", href: "/ko/enterprise-library/products/finishes", roleKey: "page/ENTERPRISE_LIBRARY" },
          { key: "textureLibrary", label: "텍스처", href: "/ko/enterprise-library/products/texture-library", roleKey: "page/ENTERPRISE_LIBRARY" },
        ],
      },
      {
        kind: "submenu",
        key: "customFurnitureLibrary",
        label: "기업 라이브러리 - 파트",
        icon: "▧",
        roleKey: "page/SALE_LIBRARY",
        children: [
          { key: "sale", label: "제품", href: "/ko/enterprise-library/part/sale", roleKey: "page/SALE_LIBRARY" },
          { key: "component", label: "컴포넌트", href: "/ko/enterprise-library/part/component", roleKey: "page/SALE_LIBRARY" },
          { key: "modeling", label: "모델링", href: "/ko/enterprise-library/part/modeling", roleKey: "page/SALE_LIBRARY" },
          { key: "parameter", label: "파라미터", href: "/ko/enterprise-library/part/parameter", roleKey: "page/SALE_LIBRARY" },
        ],
      },
      {
        kind: "leaf",
        key: "advancedSettings",
        label: "고급 라이브러리 설정",
        href: "/ko/enterprise-library/advanced-settings",
        roleKey: "page/ENTERPRISE_ADVANCED_SETTINGS",
        icon: "▨",
      },
    ],
  },
  {
    label: "인테리어 템플릿",
    items: [
      { kind: "leaf", key: "templateList", label: "내 템플릿", href: "/ko/templates/list", icon: "▩" },
      { kind: "leaf", key: "manageTemplates", label: "템플릿 관리", href: "/ko/templates/manage", icon: "▩" },
      { kind: "leaf", key: "templateTags", label: "템플릿 태그", href: "/ko/templates/tags", icon: "▩" },
    ],
  },
  {
    label: "도면 관리",
    items: [
      {
        kind: "leaf",
        key: "floorplanManagement",
        label: "도면 관리",
        href: "/ko/floorplan",
        roleKey: "page/FLOORPLAN_MANAGEMENT",
        icon: "▭",
      },
    ],
  },
  {
    label: "운영 관리",
    items: [
      {
        kind: "leaf",
        key: "accountManagement",
        label: "계정 관리",
        href: "/ko/account-management",
        roleKey: "page/ACCOUNT_MANAGEMENT",
        icon: "▬",
      },
    ],
  },
  {
    label: "지원 서비스",
    items: [
      {
        kind: "leaf",
        key: "3dModelingService",
        label: "3D 모델링 서비스",
        href: "/ko/product-order",
        roleKey: "page/MODELING_SERVICE",
        icon: "▰",
      },
      { kind: "leaf", key: "renderStudio", label: "렌더 스튜디오", href: "/ko/render-studio", roleKey: "page/RENDER_STUDIO", icon: "▰" },
    ],
  },
  {
    label: "설정",
    items: [
      { kind: "leaf", key: "customizations", label: "커스터마이징", href: "/ko/settings/customize", roleKey: "page/CUSTOMIZE", icon: "⚙" },
    ],
  },
];

/** Screens the clone actually implements. Everything else lands on "준비 중". */
export const IMPLEMENTED_PATHS = new Set<string>([
  "/ko/home-page",
  "/ko/enterprise-library/products/furniture",
  "/ko/enterprise-library/products/finishes",
  "/ko/enterprise-library/products/texture-library",
  "/ko/templates/list",
  "/ko/templates/manage",
  "/ko/templates/tags",
  "/ko/projects/team",
]);

/** Human label for an unimplemented route, looked up from the nav table. */
export function labelForPath(pathname: string): string | null {
  for (const group of NAV_GROUPS) {
    for (const entry of group.items) {
      if (entry.kind === "leaf") {
        if (entry.href === pathname) return entry.label;
      } else {
        for (const child of entry.children) if (child.href === pathname) return child.label;
      }
    }
  }
  return null;
}

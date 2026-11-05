"use client";

import { useEffect, useState } from "react";

/**
 * Thumbnail with a remote fallback: the asset download is still running, so a
 * local PNG may not exist yet. Plain <img> on purpose - next/image would try to
 * optimize a 5 GB local tree and the remote CDN.
 */
export default function Thumb({
  src,
  fallback,
  alt,
  className = "prodcard__thumb",
  missingLabel = "이미지 없음",
}: {
  src: string | null;
  fallback?: string | null;
  alt: string;
  className?: string;
  missingLabel?: string;
}) {
  const [current, setCurrent] = useState<string | null>(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrent(src);
    setFailed(false);
  }, [src]);

  if (!current || failed) {
    return <div className="thumb-missing">{missingLabel}</div>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={current}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (fallback && current !== fallback) setCurrent(fallback);
        else setFailed(true);
      }}
    />
  );
}

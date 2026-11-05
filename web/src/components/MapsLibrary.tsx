"use client";

import { useState } from "react";
import Thumb from "./Thumb";

export type MapItemEntry = { key: string; label: string; url: string | null; remote: string | null };

export type MapItem = {
  id: string;
  name: string;
  thumbnail: string | null;
  thumbnailFallback: string | null;
  subtitle: string;
  /** corner badge on the thumbnail, e.g. "PBR 3/4" */
  badge?: string | null;
  maps: MapItemEntry[];
  meta: Array<[string, string]>;
  missingMaps: string[];
  /** note shown above the map grid in the modal */
  missingNote?: string | null;
};

/**
 * Card grid + detail modal shared by the finishes and texture libraries.
 * Missing PBR maps are shown as an explicit placeholder rather than hidden -
 * 12 of the 51 finishes are incomplete because the CDN 403s those objects.
 */
export default function MapsLibrary({ items }: { items: MapItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((item) => item.id === openId) ?? null;

  return (
    <>
      <div className="grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="prodcard"
            style={{ textAlign: "left", padding: 0, border: "1px solid var(--border)", cursor: "pointer" }}
            onClick={() => setOpenId(item.id)}
          >
            <span className="prodcard__thumbwrap">
              <Thumb src={item.thumbnail} fallback={item.thumbnailFallback} alt={item.name} />
              {item.badge && (
                <span className="prodcard__badges">
                  <span className="prodcard__badge">{item.badge}</span>
                </span>
              )}
            </span>
            <span className="prodcard__body">
              <span className="prodcard__name" title={item.name}>
                {item.name}
              </span>
              <span className="prodcard__meta">{item.subtitle}</span>
            </span>
          </button>
        ))}
      </div>

      {open && (
        <div className="modal__backdrop" role="dialog" aria-modal onClick={() => setOpenId(null)}>
          <div className="modal__box" onClick={(event) => event.stopPropagation()}>
            <div className="section__head">
              <span className="section__title">{open.name}</span>
              <span className="section__actions">
                <button type="button" className="btn btn--sm" onClick={() => setOpenId(null)}>
                  닫기
                </button>
              </span>
            </div>

            <dl className="kv">
              {open.meta.map(([label, value]) => (
                <span key={label} style={{ display: "contents" }}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </span>
              ))}
            </dl>

            <div className="section__body">
              {open.missingNote && (
                <p className="badge-warn" style={{ display: "inline-block", marginTop: 0 }}>
                  {open.missingNote}
                </p>
              )}
              <div className="maps">
                {open.maps.map((entry) => (
                  <div className="map" key={entry.key}>
                    {entry.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="map__img" src={entry.url} alt={entry.label} loading="lazy" />
                    ) : (
                      <div className="map__missing">미수집</div>
                    )}
                    <div className="map__foot">
                      <span className="map__name">{entry.label}</span>
                      <span className="filterbar__spacer" />
                      {entry.url ? (
                        <a className="btn btn--sm" href={`${entry.url}?download=1`} download>
                          ⬇
                        </a>
                      ) : entry.remote ? (
                        <a className="btn btn--sm" href={entry.remote} target="_blank" rel="noreferrer">
                          CDN ↗
                        </a>
                      ) : (
                        <span className="faint">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

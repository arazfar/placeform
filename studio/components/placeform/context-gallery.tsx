'use client';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { contextGallery, type ContextGalleryItem } from '@/lib/context-gallery';

function ReferenceCard({ item }: { item: ContextGalleryItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="context-reference-card">
      <a
        className="context-reference-image"
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`View ${item.title} at its source (opens in a new tab)`}
      >
        {failed ? (
          <output>
            Image unavailable · View source <ArrowUpRight size={16} />
          </output>
        ) : (
          <img
            src={item.imageUrl}
            alt={item.alt}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </a>
      <figcaption>
        <h4>{item.title}</h4>
        <p>{item.caption}</p>
        {item.credit && <small>{item.credit}</small>}
        {item.note && <small>{item.note}</small>}
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">
          View source <ArrowUpRight size={14} />
          <span className="sr-only">
            {' '}
            for {item.title} (opens in a new tab)
          </span>
        </a>
      </figcaption>
    </figure>
  );
}
export default function ContextGallery() {
  return (
    <section
      className="context-reference-gallery"
      aria-label="Research reference images"
    >
      <p className="context-reference-intro">
        Context and architectural references from the supplied collections.
        These are not photographs of the drawn parcel or promises of model
        geometry.
      </p>
      {(
        [
          [
            'presidio',
            'Presidio context & inspiration',
            'https://www.are.na/oscar-hong/watt-wonder-presidio-design-inspiration',
          ],
          [
            'infrastructure',
            'Infrastructure precedents',
            'https://infrastructure-forms.ohong2.chatgpt.site/',
          ],
        ] as const
      ).map(([collection, title, url]) => (
        <section key={collection} aria-labelledby={`references-${collection}`}>
          <div className="context-reference-heading">
            <h3 id={`references-${collection}`}>{title}</h3>
            <a href={url} target="_blank" rel="noreferrer">
              View collection <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="context-reference-grid">
            {contextGallery
              .filter((item) => item.collection === collection)
              .map((item) => (
                <ReferenceCard key={item.id} item={item} />
              ))}
          </div>
        </section>
      ))}
    </section>
  );
}

import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

type AdminReviewMediaProps = {
  src?: string | null;
  alt: string;
  fallback?: ReactNode;
  className?: string;
};

export function AdminReviewMedia({ src, alt, fallback, className }: AdminReviewMediaProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={
          className ? `${className} admin-review-media-fallback` : "admin-review-media-fallback"
        }
      >
        <ImageOff aria-hidden="true" />
        {fallback ?? <span>Preview unavailable</span>}
      </span>
    );
  }

  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}

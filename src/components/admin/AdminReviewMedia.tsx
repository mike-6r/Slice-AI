import { ImageOff } from "lucide-react";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type AdminReviewMediaProps = {
  src?: string | null;
  alt: string;
  fallback?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function AdminReviewMedia({ src, alt, fallback, className, style }: AdminReviewMediaProps) {
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

  return <img className={className} style={style} src={src} alt={alt} onError={() => setFailed(true)} />;
}

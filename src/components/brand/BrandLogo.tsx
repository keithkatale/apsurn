import Image from "next/image";
import Link from "next/link";

const LOGO_SRC = "/branding/apsurn-gtm.png";

export function BrandLogo({
  href = "/",
  size = 24,
  withWordmark = true,
  priority = false,
  className = "",
  onClick,
}: {
  href?: string;
  size?: number;
  withWordmark?: boolean;
  priority?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const mark = (
    <Image
      src={LOGO_SRC}
      alt="apsurn"
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      priority={priority}
    />
  );

  if (!href) {
    return withWordmark ? (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        {mark}
        <span className="font-heading text-base font-semibold tracking-tight text-neutral-950">apsurn</span>
      </span>
    ) : (
      mark
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex items-center gap-2 shrink-0 transition-opacity hover:opacity-85 ${className}`}
    >
      {mark}
      {withWordmark && (
        <span className="font-heading text-base font-semibold tracking-tight text-neutral-950">apsurn</span>
      )}
    </Link>
  );
}

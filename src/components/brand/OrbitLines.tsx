/** Loose overlapping circles in ember and orchid that bleed off the bottom corners. Decorative; keep behind content. */
export function OrbitLines({ className }: { className?: string }) {
  const circles = (
    <>
      <circle cx="210" cy="210" r="150" stroke="#e8713a" />
      <circle cx="260" cy="170" r="120" stroke="#e68be6" />
      <circle cx="170" cy="250" r="95" stroke="#e8713a" />
    </>
  );
  return (
    <div className={`ap-orbits ${className ?? ""}`} aria-hidden>
      <svg className="left" viewBox="0 0 420 420">
        {circles}
      </svg>
      <svg className="right" viewBox="0 0 420 420" style={{ transform: "scaleX(-1)" }}>
        {circles}
      </svg>
    </div>
  );
}

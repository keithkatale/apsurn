export function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 p-2.5 sm:p-5">
      <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-[#C5DBFF] bg-gradient-to-b from-white from-[40%] via-[#A8C8FF] via-[78%] to-[#4379EE] sm:rounded-[40px]">
        <div
          className="absolute inset-x-0 bottom-0 h-[62%] bg-[radial-gradient(rgba(255,255,255,0.55)_0.85px,transparent_0.85px)] [background-size:18px_18px] sm:[background-size:20px_20px]"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 38%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 38%)",
          }}
        />
      </div>
    </div>
  );
}

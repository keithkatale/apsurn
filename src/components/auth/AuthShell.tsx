export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen overflow-hidden bg-white text-neutral-900"
      style={{ colorScheme: "light" }}
    >
      <div className="pointer-events-none absolute inset-0 p-2.5 sm:p-5">
        <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-[#E8EFFB] bg-gradient-to-b from-white from-[55%] to-[rgba(207,226,252,0.85)] sm:rounded-[40px]">
          <div
            className="absolute inset-x-0 bottom-0 h-[50%] bg-[radial-gradient(#000000_0.85px,transparent_0.85px)] opacity-20 [background-size:18px_18px] sm:opacity-25 sm:[background-size:20px_20px]"
            style={{
              maskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
            }}
          />
        </div>
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        {children}
      </div>
    </div>
  );
}

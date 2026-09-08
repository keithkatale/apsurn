export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full max-w-[400px] overflow-hidden rounded-[20px] border border-[#E6E6E6] bg-gradient-to-t from-[#FAFAFA] to-[#F4F4F4] p-4">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[270px] rounded-b-[20px] bg-[radial-gradient(#000000_0.85px,transparent_0.85px)] opacity-20 [background-size:17px_17px] sm:opacity-25" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

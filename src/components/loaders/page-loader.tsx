import { cn } from "@/lib/cn";
import { SpinLoader } from "./spin-loader";

export function PageLoader({
  fullScreen = true,
  className,
}: {
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-white",
        fullScreen ? "min-h-screen" : "min-h-[50vh]",
        className,
      )}
    >
      <SpinLoader size="lg" iconClassName="text-sky-600" />
    </div>
  );
}

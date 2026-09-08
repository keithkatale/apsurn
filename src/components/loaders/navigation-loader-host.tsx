"use client";

import { Suspense } from "react";
import { NavigationLoader } from "@/components/loaders/navigation-loader";

export function NavigationLoaderHost() {
  return (
    <Suspense fallback={null}>
      <NavigationLoader />
    </Suspense>
  );
}

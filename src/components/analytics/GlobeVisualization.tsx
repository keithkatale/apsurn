"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import polylabel from "polylabel";
import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  MeshPhongMaterial,
} from "three";
import type { GlobeMethods } from "react-globe.gl";
import type { LiveVisitor } from "@/lib/analytics/types";

const LIGHT_BG = "#FAFAFA";
const OCEAN = "#dce6f2";

const Globe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#FAFAFA] text-sm text-neutral-500">
      Loading globe…
    </div>
  ),
});

interface CountryFeature {
  geometry?: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
  properties?: { NAME?: string; name?: string };
}

function centroid(feature: CountryFeature) {
  if (!feature.geometry) return { lat: 0, lng: 0 };
  let polygon: number[][][] = [];
  if (feature.geometry.type === "Polygon") {
    polygon = feature.geometry.coordinates as number[][][];
  } else if (feature.geometry.type === "MultiPolygon") {
    const polys = feature.geometry.coordinates as number[][][][];
    polygon = polys.reduce(
      (largest, current) => (current[0].length > (largest[0]?.length ?? 0) ? current : largest),
      polys[0] ?? []
    );
  }
  if (!polygon.length) return { lat: 0, lng: 0 };
  const center = polylabel(polygon, 1.0);
  return { lng: center[0], lat: center[1] };
}

function makeOceanMaterial() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, 32, 32);
  }
  const map = new CanvasTexture(canvas);
  map.needsUpdate = true;
  return new MeshPhongMaterial({
    map,
    color: "#ffffff",
    emissive: "#f4f7fb",
    emissiveIntensity: 0.9,
    shininess: 2,
    specular: "#ffffff",
  });
}

function applyLightScene(globe: GlobeMethods) {
  const renderer = globe.renderer();
  renderer.setClearColor(new Color(LIGHT_BG), 1);
  renderer.setClearAlpha(1);
  globe.scene().background = new Color(LIGHT_BG);
  const key = new DirectionalLight(0xffffff, 0.28);
  key.position.set(-0.25, 1.1, 0.7);
  globe.lights([
    new AmbientLight(0xffffff, 3.4),
    new HemisphereLight(0xffffff, 0xe8eef6, 1.35),
    key,
  ]);
}

export function GlobeVisualization({
  visitors,
  autoRotate = true,
}: {
  visitors: LiveVisitor[];
  autoRotate?: boolean;
}) {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const [countries, setCountries] = useState<{ features: CountryFeature[] }>({ features: [] });
  const [oceanMaterial, setOceanMaterial] = useState<MeshPhongMaterial>();

  useEffect(() => {
    const material = makeOceanMaterial();
    setOceanMaterial(material);
    return () => {
      material.map?.dispose();
      material.dispose();
    };
  }, []);

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson")
      .then((res) => res.json())
      .then(setCountries)
      .catch(() => setCountries({ features: [] }));
  }, []);

  const visitorsWithAvatars = useMemo(
    () =>
      visitors.map((visitor) => ({
        ...visitor,
        avatarUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${visitor.id}&backgroundColor=f5f5f5`,
      })),
    [visitors]
  );

  useEffect(() => {
    if (!globeEl.current) return;
    const controls = globeEl.current.controls();
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.45;
    controls.enableZoom = true;
    controls.minDistance = 160;
    controls.maxDistance = 420;
  }, [autoRotate, oceanMaterial]);

  if (!oceanMaterial) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#FAFAFA] text-sm text-neutral-500">
        Loading globe…
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#FAFAFA]">
      <Globe
        ref={globeEl}
        globeImageUrl={null}
        bumpImageUrl={null}
        backgroundImageUrl={null}
        globeMaterial={oceanMaterial}
        backgroundColor={LIGHT_BG}
        showAtmosphere
        atmosphereColor="#e3eefc"
        atmosphereAltitude={0.12}
        polygonsData={countries.features}
        polygonCapColor={() => "#ffffff"}
        polygonSideColor={() => "rgba(220, 230, 242, 0.55)"}
        polygonStrokeColor={() => "rgba(190, 198, 210, 0.7)"}
        polygonAltitude={0.004}
        labelsData={countries.features}
        labelLat={(d) => centroid(d as CountryFeature).lat}
        labelLng={(d) => centroid(d as CountryFeature).lng}
        labelText={(d) => (d as CountryFeature).properties?.NAME || (d as CountryFeature).properties?.name || ""}
        labelSize={0.5}
        labelDotRadius={0.15}
        labelColor={() => "rgba(82, 82, 82, 0.65)"}
        labelResolution={2}
        labelAltitude={0.012}
        labelIncludeDot={false}
        htmlElementsData={visitorsWithAvatars}
        htmlLat={(d) => (d as LiveVisitor).lat}
        htmlLng={(d) => (d as LiveVisitor).lng}
        htmlElement={(d) => {
          const visitor = d as LiveVisitor & { avatarUrl: string };
          const el = document.createElement("div");
          el.innerHTML = `
            <div style="position:relative;transform:translate(-50%,-50%);">
              <div style="width:28px;height:28px;border-radius:50%;overflow:hidden;border:2px solid #fff;background:#f5f5f5;box-shadow:0 4px 12px rgba(0,0,0,0.12);">
                <img src="${visitor.avatarUrl}" style="width:100%;height:100%;object-fit:cover;" alt="" />
              </div>
              <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:#fff;color:#171717;border:1px solid #EEEEEE;padding:1px 6px;border-radius:8px;font-size:10px;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,0.06);">
                ${visitor.city}
              </div>
            </div>`;
          return el;
        }}
        onGlobeReady={() => {
          if (!globeEl.current) return;
          applyLightScene(globeEl.current);
          const controls = globeEl.current.controls();
          controls.autoRotate = autoRotate;
          controls.autoRotateSpeed = 0.45;
          controls.enableZoom = true;
          controls.minDistance = 160;
          controls.maxDistance = 420;
        }}
      />
    </div>
  );
}

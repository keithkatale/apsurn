"use client";

import { useEffect } from "react";
import { Mail, MapPin } from "lucide-react";
import { landingVideoUrl } from "@/lib/landing/videos";

export function ContactSection() {
  useEffect(() => {
    type CalFn = ((...args: unknown[]) => void) & {
      loaded?: boolean;
      ns?: Record<string, CalFn>;
      q?: unknown[];
      config?: { forwardQueryParams?: boolean };
    };

    const w = window as Window & { Cal?: CalFn };

    // Cal.com embed bootstrap
    (function (C: Window & { Cal?: CalFn }, A: string, L: string) {
      const p = (a: { q?: unknown[] }, ar: unknown[]) => {
        a.q = a.q || [];
        a.q.push(ar);
      };
      const d = C.document;
      C.Cal =
        C.Cal ||
        (function (...ar: unknown[]) {
          const cal = C.Cal!;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            d.head.appendChild(d.createElement("script")).src = A;
            cal.loaded = true;
          }
          if (ar[0] === L) {
            const api = ((...apiArgs: unknown[]) => {
              p(api, apiArgs);
            }) as CalFn;
            api.q = api.q || [];
            const namespace = ar[1];
            if (typeof namespace === "string") {
              cal.ns = cal.ns || {};
              cal.ns[namespace] = cal.ns[namespace] || api;
              p(cal.ns[namespace], ar);
              p(cal, ["initNamespace", namespace]);
            } else {
              p(cal, ar);
            }
            return;
          }
          p(cal, ar);
        } as CalFn);
    })(w, "https://app.cal.com/embed/embed.js", "init");

    const Cal = w.Cal!;
    Cal("init", "30min", { origin: "https://app.cal.com" });
    Cal.config = Cal.config || {};
    Cal.config.forwardQueryParams = true;

    Cal.ns!["30min"]("inline", {
      elementOrSelector: "#my-cal-inline-30min",
      config: {
        layout: "month_view",
        useSlotsViewOnSmallScreen: "true",
        theme: "light",
      },
      calLink: "keith-katale/30min",
    });

    Cal.ns!["30min"]("ui", {
      theme: "light",
      cssVarsPerTheme: { dark: { "cal-brand": "#5382f1" } },
      hideEventTypeDetails: false,
      layout: "month_view",
    });
  }, []);

  return (
    <section
      id="contact"
      className="overflow-hidden border-t border-[#EEEEEE] bg-[#FAFAFA]/50 py-16 sm:py-28"
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-14">
          <div className="flex flex-col gap-6 sm:gap-8 lg:col-span-5">
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <h2 className="font-heading text-2xl font-bold leading-tight tracking-tight text-neutral-950 sm:text-4xl lg:text-[44px]">
                Let&apos;s start a conversation
              </h2>
              <p className="text-base font-normal leading-relaxed text-neutral-600 sm:text-lg">
                Have questions or need a personalized demo for your sales organization? Book a time
                with our team.
              </p>
            </div>

            <div className="relative size-36 sm:size-52">
              <video
                src={landingVideoUrl("contactform.mp4")}
                autoPlay
                loop
                muted
                playsInline
                className="size-full object-contain"
                aria-label="Contact illustration"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="flex flex-col gap-2 rounded-2xl border border-[#EEEEEE] bg-white p-4 shadow-xs sm:p-5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-[#4096FF] sm:size-9">
                  <Mail className="size-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Email
                </span>
                <span className="text-sm font-bold text-neutral-900">hello@apsurn.com</span>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-[#EEEEEE] bg-white p-4 shadow-xs sm:p-5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-[#4096FF] sm:size-9">
                  <MapPin className="size-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Office
                </span>
                <span className="text-sm font-bold text-neutral-900">San Francisco, CA</span>
              </div>
            </div>
          </div>

          <div className="w-full lg:col-span-7">
            <div className="overflow-hidden rounded-2xl border border-[#EEEEEE] bg-white shadow-sm sm:rounded-3xl">
              <div
                id="my-cal-inline-30min"
                className="h-[620px] w-full overflow-auto sm:h-[700px]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

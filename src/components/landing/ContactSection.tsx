"use client";

import { useState } from "react";
import Image from "next/image";
import { Mail, MapPin, CheckCircle2 } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export function ContactSection() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    setSubmitted(true);
  };

  return (
    <section id="contact" className="py-16 sm:py-28 bg-[#FAFAFA]/50 border-t border-[#EEEEEE] overflow-hidden">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-start">
          {/* Left Column: Heading, illustration, cards */}
          <div className="lg:col-span-5 flex flex-col gap-6 sm:gap-8">
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <h2 className="text-2xl sm:text-4xl lg:text-[44px] font-bold tracking-tight text-neutral-950 font-heading leading-tight">
                Let&apos;s start a{" "}
                <span className="relative inline-block">
                  conversation
                  <span className="absolute -bottom-1.5 sm:-bottom-2 left-0 right-0 h-2.5 sm:h-3 pointer-events-none">
                    <Image
                      src="/landing/conversation-underline.svg"
                      alt=""
                      width={228}
                      height={30}
                      className="w-full h-auto object-contain"
                    />
                  </span>
                </span>
              </h2>
              <p className="text-base sm:text-lg text-neutral-600 font-normal leading-relaxed">
                Have questions or need a personalized demo for your sales organization? Get in touch with our team.
              </p>
            </div>

            {/* Illustration */}
            <div className="relative size-36 sm:size-52">
              <video
                src="/landing-video/contactform.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="size-full object-contain"
                aria-label="Contact illustration"
              />
            </div>

            {/* Contact info cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-2xl border border-[#EEEEEE] bg-white p-4 sm:p-5 shadow-xs flex flex-col gap-2">
                <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-blue-50 text-[#4096FF]">
                  <Mail className="size-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Email</span>
                <span className="text-sm font-bold text-neutral-900">hello@apsurn.com</span>
              </div>

              <div className="rounded-2xl border border-[#EEEEEE] bg-white p-4 sm:p-5 shadow-xs flex flex-col gap-2">
                <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-blue-50 text-[#4096FF]">
                  <MapPin className="size-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Office</span>
                <span className="text-sm font-bold text-neutral-900">San Francisco, CA</span>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div className="lg:col-span-7 w-full">
            <div className="rounded-2xl sm:rounded-3xl border border-[#EEEEEE] bg-white p-5 sm:p-8 lg:p-10 shadow-sm">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-10 sm:py-12 text-center gap-4">
                  <div className="flex size-12 sm:size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="size-7 sm:size-8" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-neutral-950 font-heading">Thank you!</h3>
                  <p className="text-sm sm:text-base text-neutral-600 max-w-sm">
                    We&apos;ve received your message and our SDR operations team will get back to you within 2 hours.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setFormData({ name: "", email: "", company: "", message: "" });
                    }}
                    className="mt-2 text-sm font-semibold text-[#4096FF] hover:underline cursor-pointer"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-neutral-900">Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Your name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="h-11 rounded-xl border border-neutral-200 px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-neutral-900">Email</label>
                      <input
                        type="email"
                        required
                        placeholder="you@company.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="h-11 rounded-xl border border-neutral-200 px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-semibold text-neutral-900">Company</label>
                      <input
                        type="text"
                        placeholder="Company name"
                        value={formData.company}
                        onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        className="h-11 rounded-xl border border-neutral-200 px-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-neutral-900">Message</label>
                    <textarea
                      rows={4}
                      placeholder="Tell us about your team size, target market, or what you're looking for..."
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="rounded-xl border border-neutral-200 p-3.5 sm:p-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none resize-none"
                    />
                  </div>

                  <div className="mt-1">
                    <ThreeDButton type="submit" variant="solid" size="lg" className="w-full rounded-xl">
                      <span>Send inquiry</span>
                    </ThreeDButton>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

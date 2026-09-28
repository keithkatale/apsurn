"use client";

import { useEffect, useRef, useState } from "react";
import "./FeatureSimulations.css";

const BLUEPRINT_HOLDS = [1100, 900, 900, 900, 4200];

function useSimPhase(holds: readonly number[]) {
  const [phase, setPhase] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase(holds.length - 1);
      return;
    }

    let timer = 0;
    let current = 0;
    let running = false;

    const tick = () => {
      current = (current + 1) % holds.length;
      setPhase(current);
      timer = window.setTimeout(tick, holds[current]);
    };

    const start = () => {
      if (running) return;
      running = true;
      current = 0;
      setPhase(0);
      timer = window.setTimeout(tick, holds[0]);
    };

    const stop = () => {
      running = false;
      window.clearTimeout(timer);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) start();
        else stop();
      },
      { threshold: 0.45 },
    );
    observer.observe(root);
    return () => {
      stop();
      observer.disconnect();
    };
  }, [holds]);

  return { phase, ref };
}

export function BlueprintSim() {
  const { phase, ref } = useSimPhase(BLUEPRINT_HOLDS);
  const domain = "northwind.io";
  const typed = phase === 0 ? domain.slice(0, 6) : domain;

  return (
    <div ref={ref} className="feature-sim" aria-hidden>
      <div className="sim-top">
        <span className="sim-kicker">From your site</span>
        <span className={`sim-live ${phase >= 4 ? "is-done" : "is-run"}`}>{phase >= 4 ? "Blueprint ready" : "Reading site"}</span>
      </div>
      <div className="sim-url">
        <span>{typed}</span>
        {phase === 0 ? <i className="sim-caret" /> : null}
      </div>
      <div className={`sim-block ${phase >= 1 ? "is-on" : ""}`}>
        <p>Who to target</p>
        <strong>VP Sales and Heads of Growth</strong>
        <span>B2B SaaS, 20–200 people, already selling</span>
      </div>
      <div className={`sim-block ${phase >= 2 ? "is-on" : ""}`}>
        <p>Where to find them</p>
        <strong>Teams hiring their first SDRs</strong>
        <span>Job posts, LinkedIn, and company sites</span>
      </div>
      <div className={`sim-block ${phase >= 3 ? "is-on" : ""}`}>
        <p>How to win</p>
        <strong>They need meetings this quarter</strong>
        <span>Ask for 15 minutes, then show the product</span>
      </div>
    </div>
  );
}

const LEADS = [
  { name: "Maya Chen", role: "VP Sales · Linear", why: "Hiring SDRs now. Pipeline is the job.", photo: "https://randomuser.me/api/portraits/women/44.jpg" },
  { name: "Jordan Lee", role: "Head of Growth · Vanta", why: "Outbound is still manual. They should buy.", photo: "https://randomuser.me/api/portraits/men/32.jpg" },
  { name: "Priya Shah", role: "Founder · Census", why: "Just raised. Building the first sales motion.", photo: "https://randomuser.me/api/portraits/women/65.jpg" },
  { name: "Alex Nguyen", role: "CRO · Notion", why: "Team needs more meetings this quarter.", photo: "https://randomuser.me/api/portraits/men/75.jpg" },
  { name: "Elena Rossi", role: "Head of Sales · Figma", why: "Offer matches a team that lives in outbound.", photo: "https://randomuser.me/api/portraits/women/21.jpg" },
  { name: "Chris Patel", role: "VP Growth · Stripe", why: "Looking for a way to book more calls.", photo: "https://randomuser.me/api/portraits/men/41.jpg" },
  { name: "Sam Ortiz", role: "Founder · Ramp", why: "No signal they buy outbound.", photo: "https://randomuser.me/api/portraits/men/22.jpg", skip: true },
] as const;

function LeadFace({ name, photo }: { name: string; photo: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="sim-avatar">{name.slice(0, 1)}</span>;
  return <img src={photo} alt="" className="sim-face" onError={() => setFailed(true)} />;
}

function LeadRow({ lead }: { lead: (typeof LEADS)[number] }) {
  const skipped = "skip" in lead && lead.skip;
  return (
    <li className={`sim-lead is-on ${skipped ? "is-skip" : ""}`}>
      <LeadFace name={lead.name} photo={lead.photo} />
      <span className="sim-who">
        <strong>{lead.name}</strong>
        <em>{lead.role}</em>
      </span>
      <span className="sim-why">{lead.why}</span>
      <span className={`sim-pill ${skipped ? "is-skip" : ""}`}>{skipped ? "Skipped" : "Should buy"}</span>
    </li>
  );
}

export function ContactsSim() {
  return (
    <div className="feature-sim" aria-hidden>
      <div className="sim-top">
        <span className="sim-kicker">Customers</span>
        <span className="sim-live is-done">6 should buy</span>
      </div>
      <div className="sim-scroller">
        <ul className="sim-rows sim-rows-scroll">
          {LEADS.map((lead) => (
            <LeadRow key={lead.name} lead={lead} />
          ))}
          {LEADS.map((lead) => (
            <LeadRow key={`${lead.name}-next`} lead={lead} />
          ))}
        </ul>
      </div>
    </div>
  );
}

const MAYA_PHOTO = "https://randomuser.me/api/portraits/women/44.jpg";
const EMAIL_SUBJECT = "15 minutes on Linear’s pipeline this week?";
const EMAIL_BODY =
  "Maya — you’re hiring SDRs, so pipeline is probably the job right now. I can show how we turn that search into booked calls, then send the product page before we talk. Does Thursday at 2:00 work?";
const EMAIL_REPLY = "Thursday 2:00 works. Send the product page over and I’ll look before we meet.";

function useEmailDraft() {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [replyCount, setReplyCount] = useState(0);
  const total = EMAIL_SUBJECT.length + EMAIL_BODY.length;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setCount(total);
      setReplyCount(EMAIL_REPLY.length);
      return;
    }

    let timer = 0;
    let hold = 0;
    let cursor = 0;
    let running = true;

    const typeNext = () => {
      if (!running) return;
      if (cursor < total) {
        cursor += 1;
        setCount(cursor);
        timer = window.setTimeout(typeNext, cursor <= EMAIL_SUBJECT.length ? 16 : 7);
        return;
      }
      if (cursor < total + EMAIL_REPLY.length) {
        cursor += 1;
        setReplyCount(cursor - total);
        timer = window.setTimeout(typeNext, 12);
        return;
      }
      hold = window.setTimeout(() => {
        if (!running) return;
        cursor = 0;
        setCount(0);
        setReplyCount(0);
        timer = window.setTimeout(typeNext, 280);
      }, 2200);
    };

    timer = window.setTimeout(typeNext, 180);

    const observer = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      if (visible && !running) {
        running = true;
        timer = window.setTimeout(typeNext, 16);
      } else if (!visible && running) {
        running = false;
        window.clearTimeout(timer);
        window.clearTimeout(hold);
      }
    });
    observer.observe(root);
    return () => {
      running = false;
      window.clearTimeout(timer);
      window.clearTimeout(hold);
      observer.disconnect();
    };
  }, [total]);

  const subject = EMAIL_SUBJECT.slice(0, Math.min(count, EMAIL_SUBJECT.length));
  const body = EMAIL_BODY.slice(0, Math.max(0, count - EMAIL_SUBJECT.length));
  const reply = EMAIL_REPLY.slice(0, replyCount);
  const writingSubject = count > 0 && count < EMAIL_SUBJECT.length;
  const writingBody = count >= EMAIL_SUBJECT.length && count < total;
  const writingReply = count >= total && replyCount < EMAIL_REPLY.length;

  return { ref, subject, body, reply, writingSubject, writingBody, writingReply, showReply: count >= total };
}

export function SequenceSim() {
  const { ref, subject, body, reply, writingSubject, writingBody, writingReply, showReply } = useEmailDraft();

  return (
    <div ref={ref} className="feature-sim feature-sim-outreach" aria-hidden>
      <div className="sim-top">
        <span className="sim-kicker">AI writing</span>
        <span className={`sim-live ${showReply ? "is-done" : "is-run"}`}>{showReply ? "Replied" : "Writing"}</span>
      </div>
      <article className="sim-mail is-on">
        <header className="sim-person">
          <img src={MAYA_PHOTO} alt="" className="sim-face" />
          <span>
            <strong>Maya Chen</strong>
            <em>VP Sales · Linear</em>
          </span>
        </header>
        <p className="sim-field">
          <em>Subject</em>
          <span>
            {subject}
            {writingSubject ? <i className="sim-caret" /> : null}
          </span>
        </p>
        <p className="sim-body is-on">
          {body}
          {writingBody ? <i className="sim-caret" /> : null}
        </p>
        <button type="button" className="sim-send" tabIndex={-1}>
          Send
        </button>
      </article>
      {showReply ? (
        <article className="sim-reply is-on">
          <img src={MAYA_PHOTO} alt="" className="sim-face" />
          <div>
            <span>Maya Chen</span>
            <p>
              {reply}
              {writingReply ? <i className="sim-caret" /> : null}
            </p>
          </div>
        </article>
      ) : null}
    </div>
  );
}

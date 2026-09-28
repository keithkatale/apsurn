"use client";

import { useLayoutEffect, useRef, useCallback, type ReactNode } from "react";
import Lenis from "lenis";
import "./ScrollStack.css";

export function ScrollStackItem({
  children,
  itemClassName = "",
}: {
  children: ReactNode;
  itemClassName?: string;
}) {
  return <div className={`scroll-stack-card ${itemClassName}`.trim()}>{children}</div>;
}

type ScrollStackProps = {
  children: ReactNode;
  className?: string;
  itemDistance?: number;
  itemScale?: number;
  itemStackDistance?: number;
  stackPosition?: string;
  scaleEndPosition?: string;
  baseScale?: number;
  scaleDuration?: number;
  rotationAmount?: number;
  blurAmount?: number;
  useWindowScroll?: boolean;
  onStackComplete?: () => void;
};

export default function ScrollStack({
  children,
  className = "",
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = "20%",
  scaleEndPosition = "10%",
  baseScale = 0.85,
  scaleDuration = 0.5,
  rotationAmount = 0,
  blurAmount = 0,
  useWindowScroll = false,
  onStackComplete,
}: ScrollStackProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stackCompletedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const cardsRef = useRef<HTMLElement[]>([]);
  const cardTopsRef = useRef<number[]>([]);
  const endTopRef = useRef(0);
  const lastTransformsRef = useRef(new Map<number, { translateY: number; scale: number; rotation: number; blur: number }>());

  const calculateProgress = useCallback((scrollTop: number, start: number, end: number) => {
    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / (end - start);
  }, []);

  const parsePercentage = useCallback((value: string | number, containerHeight: number) => {
    if (typeof value === "string" && value.includes("%")) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return parseFloat(String(value));
  }, []);

  const getScrollData = useCallback(() => {
    if (useWindowScroll) {
      return {
        scrollTop: window.scrollY,
        containerHeight: window.innerHeight,
      };
    }
    const scroller = scrollerRef.current;
    return {
      scrollTop: scroller?.scrollTop ?? 0,
      containerHeight: scroller?.clientHeight ?? 0,
    };
  }, [useWindowScroll]);

  const getElementOffset = useCallback((element: HTMLElement) => {
    if (!useWindowScroll) return element.offsetTop;
    const previous = element.style.transform;
    element.style.transform = "none";
    const top = element.getBoundingClientRect().top + window.scrollY;
    element.style.transform = previous;
    return top;
  }, [useWindowScroll]);

  const measureCards = useCallback(() => {
    cardTopsRef.current = cardsRef.current.map((card) => getElementOffset(card));
    const endElement = scrollerRef.current?.querySelector<HTMLElement>(".scroll-stack-end");
    endTopRef.current = endElement ? getElementOffset(endElement) : 0;
  }, [getElementOffset]);

  const updateCardTransforms = useCallback(() => {
    if (!cardsRef.current.length) return;

    const { scrollTop, containerHeight } = getScrollData();
    const stackPositionPx = parsePercentage(stackPosition, containerHeight);
    const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight);
    const endElementTop = endTopRef.current;
    const cardTops = cardTopsRef.current;

    cardsRef.current.forEach((card, i) => {
      if (!card) return;

      const cardTop = cardTops[i] ?? 0;
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i;
      const triggerEnd = cardTop - scaleEndPositionPx;
      const pinStart = cardTop - stackPositionPx - itemStackDistance * i;
      const pinEnd = endElementTop - containerHeight / 2;

      const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd);
      const targetScale = baseScale + i * itemScale;
      const scale = 1 - scaleProgress * (1 - targetScale);
      const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0;

      let blur = 0;
      if (blurAmount) {
        let topCardIndex = 0;
        for (let j = 0; j < cardTops.length; j++) {
          const jTriggerStart = cardTops[j] - stackPositionPx - itemStackDistance * j;
          if (scrollTop >= jTriggerStart) topCardIndex = j;
        }
        if (i < topCardIndex) {
          blur = Math.max(0, (topCardIndex - i) * blurAmount);
        }
      }

      let translateY = 0;
      if (!useWindowScroll) {
        const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isPinned) {
          translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i;
        } else if (scrollTop > pinEnd) {
          translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i;
        }
      }

      const newTransform = {
        translateY: Math.round(translateY * 100) / 100,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100,
      };

      const lastTransform = lastTransformsRef.current.get(i);
      const hasChanged =
        !lastTransform ||
        Math.abs(lastTransform.translateY - newTransform.translateY) > 0.5 ||
        Math.abs(lastTransform.scale - newTransform.scale) > 0.002 ||
        Math.abs(lastTransform.rotation - newTransform.rotation) > 0.1 ||
        Math.abs(lastTransform.blur - newTransform.blur) > 0.1;

      if (hasChanged) {
        const rotate = newTransform.rotation ? ` rotate(${newTransform.rotation}deg)` : "";
        card.style.transform = useWindowScroll
          ? `scale(${newTransform.scale})${rotate}`
          : `translate3d(0, ${newTransform.translateY}px, 0) scale(${newTransform.scale})${rotate}`;
        if (blurAmount) {
          card.style.filter = newTransform.blur > 0 ? `blur(${newTransform.blur}px)` : "";
        }
        lastTransformsRef.current.set(i, newTransform);
      }

      if (i === cardsRef.current.length - 1) {
        const isInView = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isInView && !stackCompletedRef.current) {
          stackCompletedRef.current = true;
          onStackComplete?.();
        } else if (!isInView && stackCompletedRef.current) {
          stackCompletedRef.current = false;
        }
      }
    });
  }, [
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    onStackComplete,
    calculateProgress,
    parsePercentage,
    getScrollData,
    useWindowScroll,
  ]);

  const handleScroll = useCallback(() => {
    updateCardTransforms();
  }, [updateCardTransforms]);

  const setupLenis = useCallback(() => {
    if (useWindowScroll) {
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }

    const scroller = scrollerRef.current;
    const content = scroller?.querySelector<HTMLElement>(".scroll-stack-inner");
    if (!scroller || !content) return;

    const lenis = new Lenis({
      wrapper: scroller,
      content,
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: true,
      syncTouchLerp: 0.075,
      lerp: 0.1,
    });

    lenis.on("scroll", handleScroll);

    const raf = (time: number) => {
      lenis.raf(time);
      animationFrameRef.current = requestAnimationFrame(raf);
    };
    animationFrameRef.current = requestAnimationFrame(raf);
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
    };
  }, [handleScroll, useWindowScroll]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const cards = Array.from(
      useWindowScroll
        ? document.querySelectorAll<HTMLElement>(".scroll-stack-card")
        : scroller.querySelectorAll<HTMLElement>(".scroll-stack-card"),
    );

    cardsRef.current = cards;
    const transformsCache = lastTransformsRef.current;

    cards.forEach((card, i) => {
      if (i < cards.length - 1) {
        card.style.marginBottom = `${itemDistance}px`;
      }
      card.style.willChange = "transform";
      card.style.transformOrigin = "top center";
      card.style.backfaceVisibility = "hidden";
      card.style.transform = "none";
      if (useWindowScroll) {
        card.style.position = "sticky";
        card.style.top = `calc(${stackPosition} + ${itemStackDistance * i}px)`;
        card.style.zIndex = String(i + 1);
      }
    });

    const cleanupScroll = setupLenis();
    measureCards();
    updateCardTransforms();

    const onResize = () => {
      measureCards();
      updateCardTransforms();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      cleanupScroll?.();
      lenisRef.current = null;
      stackCompletedRef.current = false;
      cardsRef.current = [];
      cardTopsRef.current = [];
      transformsCache.clear();
    };
  }, [
    itemDistance,
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    scaleDuration,
    rotationAmount,
    blurAmount,
    useWindowScroll,
    onStackComplete,
    setupLenis,
    measureCards,
    updateCardTransforms,
  ]);

  return (
    <div
      className={`scroll-stack-scroller ${useWindowScroll ? "scroll-stack-scroller--window" : ""} ${className}`.trim()}
      ref={scrollerRef}
    >
      <div className="scroll-stack-inner">
        {children}
        <div className="scroll-stack-end" />
      </div>
    </div>
  );
}

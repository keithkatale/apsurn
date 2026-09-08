;(function (window, document) {
    "use strict";

    const script = document.querySelector("script[data-site-id]");
    const scriptSrc = script ? script.src : "";
    const apiBase = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;

    const CONFIG = {
        apiEndpoint: apiBase + "/api/ingest",
        autoTrack: true,
    };

    function generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getOrCreatePersistentId(key) {
        var id = localStorage.getItem(key);
        if (!id) {
            id = generateUUID();
            localStorage.setItem(key, id);
        }
        return id;
    }

    var SESSION_KEY = "apsurn_analytics_session";
    var VISITOR_KEY = "apsurn_analytics_visitor";
    var SESSION_DURATION = 30 * 60 * 1000;

    function getSession() {
        var now = Date.now();
        var session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");

        if (!session || now - session.lastActive > SESSION_DURATION) {
            session = { id: generateUUID(), startTime: now, lastActive: now };
        } else {
            session.lastActive = now;
        }

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    }

    async function trackPageView() {
        var session = getSession();
        var visitorId = getOrCreatePersistentId(VISITOR_KEY);
        var tag = document.querySelector("script[data-site-id]");
        var siteId = tag ? tag.getAttribute("data-site-id") : null;

        if (!siteId) {
            console.warn("Apsurn analytics: no data-site-id found");
            return;
        }

        var payload = {
            type: "pageview",
            siteId: siteId,
            visitorId: visitorId,
            sessionId: session.id,
            sessionStartTime: session.startTime,
            url: window.location.href,
            path: window.location.pathname,
            referrer: document.referrer,
            title: document.title,
            width: window.screen.width,
            height: window.screen.height,
            language: navigator.language,
            userAgent: navigator.userAgent,
        };

        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon(CONFIG.apiEndpoint, new Blob([JSON.stringify(payload)], { type: "application/json" }));
            } else {
                await fetch(CONFIG.apiEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    keepalive: true,
                });
            }
        } catch (error) {
            console.error("Apsurn analytics: failed to send event", error);
        }
    }

    function handleHistoryChange(type) {
        var original = history[type];
        return function () {
            var result = original.apply(this, arguments);
            trackPageView();
            return result;
        };
    }

    function init() {
        if (!CONFIG.autoTrack) return;
        trackPageView();
        history.pushState = handleHistoryChange("pushState");
        history.replaceState = handleHistoryChange("replaceState");
        window.addEventListener("popstate", function () { trackPageView(); });
    }

    window.trackify = { track: trackPageView, init: init };

    if (document.readyState === "complete") {
        init();
    } else {
        window.addEventListener("load", init);
    }
})(window, document);

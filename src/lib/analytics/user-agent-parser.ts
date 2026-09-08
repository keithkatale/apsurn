export interface UserAgentInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: "mobile" | "tablet" | "desktop";
}

export function parseUserAgent(uaString: string): UserAgentInfo {
  const ua = uaString.toLowerCase();

  let device: UserAgentInfo["device"] = "desktop";
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    device = "tablet";
  } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)os|Opera M(obi|ini)/.test(uaString)) {
    device = "mobile";
  }

  let browser = "Unknown";
  let browserVersion = "";
  if (ua.includes("firefox")) {
    browser = "Firefox";
    browserVersion = ua.match(/firefox\/([\d.]+)/)?.[1] ?? "";
  } else if (ua.includes("samsungbrowser")) {
    browser = "Samsung Internet";
    browserVersion = ua.match(/samsungbrowser\/([\d.]+)/)?.[1] ?? "";
  } else if (ua.includes("opera") || ua.includes("opr")) {
    browser = "Opera";
    browserVersion = ua.match(/(?:opera|opr)\/([\d.]+)/)?.[1] ?? "";
  } else if (ua.includes("trident")) {
    browser = "Internet Explorer";
    browserVersion = ua.match(/rv:([\d.]+)/)?.[1] ?? "";
  } else if (ua.includes("edge") || ua.includes("edg")) {
    browser = "Edge";
    browserVersion = ua.match(/(?:edge|edg)\/([\d.]+)/)?.[1] ?? "";
  } else if (ua.includes("chrome")) {
    browser = "Chrome";
    browserVersion = ua.match(/chrome\/([\d.]+)/)?.[1] ?? "";
  } else if (ua.includes("safari")) {
    browser = "Safari";
    browserVersion = ua.match(/version\/([\d.]+)/)?.[1] ?? "";
  }

  let os = "Unknown";
  let osVersion = "";
  if (ua.includes("windows")) {
    os = "Windows";
  } else if (ua.includes("android")) {
    os = "Android";
    osVersion = ua.match(/android ([\d.]+)/)?.[1] ?? "";
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
    osVersion = ua.match(/os ([\d_]+)/)?.[1]?.replace(/_/g, ".") ?? "";
  } else if (ua.includes("mac")) {
    os = "macOS";
    osVersion = ua.match(/mac os x ([\d_]+)/)?.[1]?.replace(/_/g, ".") ?? "";
  } else if (ua.includes("linux")) {
    os = "Linux";
  }

  return { browser, browserVersion, os, osVersion, device };
}

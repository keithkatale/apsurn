import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "apsurn",
  // SDK v4 defaults to cloud mode. Local Next development must explicitly
  // target the keyless Dev Server instead of requiring a cloud event key.
  isDev: process.env.INNGEST_DEV === "1" || process.env.NODE_ENV === "development",
});

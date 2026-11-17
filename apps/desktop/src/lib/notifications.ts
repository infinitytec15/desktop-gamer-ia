import { isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
const KEY = "gameforge.notifications";
export async function enableNotifications(): Promise<boolean> {
  if (!isTauri())
    throw new Error("Abra o aplicativo desktop para permitir notificações.");
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  localStorage.setItem(KEY, granted ? "enabled" : "disabled");
  return granted;
}
export function disableNotifications() {
  localStorage.setItem(KEY, "disabled");
}
export async function notifyEvent(title: string) {
  if (!isTauri() || localStorage.getItem(KEY) !== "enabled") return;
  try {
    if (await isPermissionGranted())
      sendNotification({ title: "GameForge AI", body: title });
  } catch {
    /* OS policy may suppress a notification; task status remains in the application. */
  }
}

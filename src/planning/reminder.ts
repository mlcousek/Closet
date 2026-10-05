import * as Notifications from 'expo-notifications';

import { getReminderTime, setReminderTime, type ReminderTime } from './settings';

const REMINDER_ID = 'daily-outfit-reminder';

/**
 * Makes reminders appear while the app is open and take the user to Home when
 * tapped. Returns a function that undoes the tap handling.
 */
export function installReminderHandling(openHome: () => void): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.notification.request.identifier === REMINDER_ID) openHome();
  });
  return () => subscription.remove();
}

/** Reads "7:30" or "07:30" as a time of day, or null when it is not one. */
export function parseTime(text: string): ReminderTime | null {
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export function formatTime(time: ReminderTime): string {
  return `${time.hour}:${String(time.minute).padStart(2, '0')}`;
}

type Scheduler = {
  allowed(): Promise<boolean>;
  schedule(time: ReminderTime, title: string, body: string): Promise<void>;
  cancel(): Promise<void>;
};

const deviceScheduler: Scheduler = {
  allowed: async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  },
  schedule: async (time, title, body) => {
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
      },
    });
  },
  cancel: () => Notifications.cancelScheduledNotificationAsync(REMINDER_ID),
};

/**
 * Turns the daily reminder on at a time, or off with null. Returns false,
 * leaving the reminder off, when notifications are not allowed. The reminder
 * is a local notification, so it needs no server and no push entitlement.
 */
export async function setReminder(
  time: ReminderTime | null,
  text: { title: string; body: string },
  scheduler: Scheduler = deviceScheduler,
  store: (time: ReminderTime | null) => void = setReminderTime,
): Promise<boolean> {
  await scheduler.cancel();
  if (!time) {
    store(null);
    return true;
  }
  if (!(await scheduler.allowed())) {
    store(null);
    return false;
  }
  await scheduler.schedule(time, text.title, text.body);
  store(time);
  return true;
}

/**
 * Schedules the stored reminder again on app start. Reinstalling a sideloaded
 * build drops scheduled notifications, and this puts the reminder back.
 */
export async function restoreReminder(
  text: { title: string; body: string },
  scheduler: Scheduler = deviceScheduler,
  read: () => ReminderTime | null = getReminderTime,
): Promise<void> {
  const time = read();
  if (!time) return;
  try {
    await scheduler.cancel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) await scheduler.schedule(time, text.title, text.body);
  } catch {
    // The reminder is a convenience; failing to restore it must not affect app start.
  }
}

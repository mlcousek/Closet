import * as Battery from 'expo-battery';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { getStartWhileCharging } from './settings';

/**
 * Opens the display when the phone is charging while the app is open, if the
 * user turned that on. It opens once per time on the charger, so leaving the
 * display does not bring it straight back.
 */
export function useDisplayAutoStart() {
  const router = useRouter();
  useEffect(() => {
    let opened = false;
    const react = (state: Battery.BatteryState) => {
      const charging =
        state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
      if (!charging) {
        opened = false;
        return;
      }
      if (opened || !getStartWhileCharging()) return;
      opened = true;
      router.push('/display');
    };
    // A device that cannot report its battery simply never starts the display by itself.
    Battery.getBatteryStateAsync().then(react, () => {});
    const subscription = Battery.addBatteryStateListener(({ batteryState }) => react(batteryState));
    return () => subscription.remove();
  }, [router]);
}

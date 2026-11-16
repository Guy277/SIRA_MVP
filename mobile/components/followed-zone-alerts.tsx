// Watches the travellers' reports, live, while SIRA is open: a new one inside a zone the traveller
// follows raises an alert (and SIRA says it). No notification once the app is closed: the server
// does not follow zones yet. Mounted once, in the root layout; draws nothing.
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useLiveReports } from '@/lib/reports';
import { useFollowedZones, zonesContaining } from '@/lib/followed-zones';
import { notify } from '@/lib/notify';
import { say } from '@/lib/voice';

// Reports already known: the list at start-up is not « new », and each report alerts once.
const seen = new Set<string>();
let primed = false;

export function FollowedZoneAlerts() {
  const router = useRouter();
  const { reports, updatedAt } = useLiveReports();
  const zones = useFollowedZones();

  useEffect(() => {
    if (!updatedAt) return;
    if (!primed) {
      reports.forEach((report) => seen.add(report.id));
      primed = true;
      return;
    }
    for (const report of reports) {
      if (seen.has(report.id)) continue;
      seen.add(report.id);
      const createdAt = Date.parse(report.createdAt);
      const zone = zonesContaining(zones, { latitude: report.lat, longitude: report.lon })
        .find((item) => !Number.isFinite(createdAt) || createdAt >= item.addedAt);
      if (!zone) continue;
      const message = `${report.title} signalé ${report.location ? `à ${report.location}` : 'près de ta zone'}, dans ta zone suivie « ${zone.label} ».`;
      void say(message, 'alert');
      notify('Zone suivie', message, [
        { text: 'Voir sur la carte', onPress: () => router.push({ pathname: '/traffic', params: { incident: report.id } }) },
        { text: 'OK', onPress: () => {} },
      ]);
    }
  }, [reports, updatedAt, zones, router]);

  return null;
}

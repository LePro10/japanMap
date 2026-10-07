import type { DriveSystem } from "@/game/DriveSystem";
import { createBodyContacts } from "@/game/CollisionWorld";
import { walkSpawnZone } from "@/config/walker.config";

/** Nur explizites Rufen verschiebt den Wagen, nie ein Reiterwechsel. */
export function callPlayerCar(drive: DriveSystem): string {
  if (!drive.walking) return "Step out of the car before calling it.";
  if (drive.race.state !== "idle")
    return "Finish or leave your event before calling the car.";
  const player = drive.walker.position;
  const currentDistance = Math.hypot(
    drive.vehicle.position.x - player.x,
    drive.vehicle.position.z - player.z,
  );
  if (currentDistance <= 6)
    return "Your car is already beside you. Choose Enter car to get in.";
  const spec = drive.vehicle.spec.chassis;
  const margin = Math.max(spec.bodyLength, spec.bodyWidth) / 2 + 1;
  const contacts = createBodyContacts();
  // Straßen statt willkürlicher Bodenpunkte: keine Paddys, Wasser oder Hänge.
  for (const distance of [8, 14, 22, 32]) {
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const commons = walkSpawnZone();
      const slotX = player.x + Math.sin(angle) * distance;
      const slotZ = player.z + Math.cos(angle) * distance;
      const inCourt = Math.hypot(slotX - commons.x, slotZ - commons.z) < 48;
      const hit = inCourt ? { x: slotX, z: slotZ, forwardX: 1, forwardZ: 0 } : drive.roads?.closestPoint(
        player.x + Math.sin(angle) * distance,
        player.z + Math.cos(angle) * distance,
        12,
      );
      if (
        !hit ||
        Math.hypot(hit.x - player.x, hit.z - player.z) < margin + 2 ||
        Math.hypot(hit.x - player.x, hit.z - player.z) > 45
      )
        continue;
      const height = drive.height(hit.x, hit.z);
      if (
        !Number.isFinite(height) ||
        height < 0.5 ||
        drive.waterDepth(hit.x, hit.z) > 0.02
      )
        continue;
      if (
        drive.collision.queryBody(
          hit.x,
          hit.z,
          hit.forwardX,
          hit.forwardZ,
          spec.bodyLength / 2 + 0.5,
          spec.bodyWidth / 2 + 0.5,
          height + 0.1,
          height + 3,
          contacts,
        ) > 0
      )
        continue;
      let safe = true;
      for (const [dx, dz] of [
        [0, 0],
        [-margin, -margin],
        [margin, -margin],
        [-margin, margin],
        [margin, margin],
      ]) {
        const x = hit.x + dx!,
          z = hit.z + dz!,
          h = drive.height(x, z);
        if (
          !Number.isFinite(h) ||
          drive.waterDepth(x, z) > 0.02 ||
          Math.abs(h - height) > 0.7 ||
          drive.collision.query(x, h + 1, z, 1).depth > 0
        ) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;
      drive.placeAt(hit.x, hit.z, Math.atan2(hit.forwardX, hit.forwardZ));
      return `Your car is parked ${Math.round(Math.hypot(hit.x - player.x, hit.z - player.z))} m away${inCourt ? " in the court" : " on the road"}.`;
    }
  }
  return "No clear parking space nearby. Move closer to an open road and call again.";
}

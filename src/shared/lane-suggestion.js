/**
 * A PROPOSAL of the lane each pick of a side was played in, drawn only from what the site already knows:
 * the lanes each hero is listed for (Camp's own data, with the staff's corrections). Nothing is invented:
 * a lane is proposed only when it is forced.
 *
 *  - a hero that can only be played in one of the lanes still free gets that lane;
 *  - once the five heroes are known, a lane that only one of them could take goes to that hero;
 *  - when two heroes are stuck on the same single lane, neither is given it;
 *  - a lane already entered is never touched, and a hero with no list of lanes stays empty.
 *
 * The result is a starting point: the editor shows it and the administrator changes it by dragging.
 * `slots` is five `{ heroId, heroLanes, lane }` (heroId null for an empty slot); `lanes` is the list of
 * the five lanes of the game. Returns the lanes of the five slots (`null` where nothing is proposed).
 */
export function suggestLanes(slots, lanes) {
  const result = slots.map(slot => slot.lane ?? null);
  const taken = new Set(result.filter(Boolean));
  const full = slots.length === lanes.length && slots.every(slot => slot.heroId);
  const open = slots
    .map((slot, index) => (slot.heroId && !result[index] ? index : -1))
    .filter(index => index >= 0);
  const choices = index => {
    const known = slots[index].heroLanes ?? [];
    return lanes.filter(lane => known.includes(lane) && !taken.has(lane));
  };
  for (let progress = true; progress;) {
    progress = false;
    const waiting = open.filter(index => !result[index]);
    // a hero with a single lane left, unless another hero is stuck on that same lane
    for (const index of waiting) {
      const options = choices(index);
      if (options.length !== 1) {
        continue;
      }
      const rivals = waiting.filter(
        other => other !== index && choices(other).includes(options[0])
      );
      const stuck = rivals.some(other => choices(other).length === 1);
      if (!stuck) {
        result[index] = options[0];
        taken.add(options[0]);
        progress = true;
        break;
      }
    }
    if (progress) {
      continue;
    }
    // a lane that only one waiting hero could take: only when the five picks are known, because with
    // fewer heroes a lane may simply not have been played yet
    for (const lane of full ? lanes : []) {
      if (taken.has(lane)) {
        continue;
      }
      const candidates = waiting.filter(index => choices(index).includes(lane));
      if (candidates.length === 1) {
        result[candidates[0]] = lane;
        taken.add(lane);
        progress = true;
        break;
      }
    }
  }
  return result;
}

import { awareness } from '../config';

/** Local-midnight moment the October content stops showing. */
export const awarenessEndsAt = `${awareness.endsOn}T00:00:00`;

/**
 * Whether this build renders the campaign at all. Pages built before the end
 * date also hide it in the browser once `awarenessEndsAt` passes (BaseLayout),
 * so it comes down on time without a redeploy.
 */
export const awarenessActive =
  awareness.enabled && Date.now() < new Date(awarenessEndsAt).getTime();

/** "pink-ribbon pins, awareness socks, gift bags, and more" */
export const giveawayList = `${awareness.giveaway.join(', ')}, and more`;

import { isFlowborn } from "../heroes/hero-domain.js";

export const flowbornIdsOf = heroes => heroes.filter(isFlowborn).map(hero => hero.id);

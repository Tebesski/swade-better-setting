const BASIC_SWADE_PACKS = new Set(["swade.skills", "swade.edges", "swade.hindrances", "swade.powers"]);

export const isBasicSwadePack = pack => BASIC_SWADE_PACKS.has(pack.collection);

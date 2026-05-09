import { Dex } from "@pkmn/dex";

/* Parent directory for storing user data */
export const DATA_DIR = 'data/';
/* Directory for sets */
export const SETS_DIR = DATA_DIR + 'sets/';
export const CONSTRAINTS_DIR = DATA_DIR + 'constraints/'

/* Current generation of Pokemon */
export const CURRENT_GEN = Dex.forGen(9).gen;

export const MAXIMUM_EVS_TOTAL = 510;
export const MAXIMUM_EVS_PER_STAT = 252;

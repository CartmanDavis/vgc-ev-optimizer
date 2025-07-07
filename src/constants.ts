import { Dex } from "@pkmn/dex";

/* Parent directory for storing user data */
export const DATA_DIR = 'data/';
/* Directory for sets */
export const SETS_DIR = DATA_DIR + 'sets/';
export const PARAM_DIR = DATA_DIR + 'parameters/'

/* Current generation of Pokemon */
export const CURRENT_GEN = Dex.forGen(9).gen; 

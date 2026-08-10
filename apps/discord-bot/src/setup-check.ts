import { ROLE_DEFINITIONS, CATEGORY_DEFINITIONS, CHANNEL_DEFINITIONS, SLICE_DISCORD_SETUP_VERSION } from './setup/manifest.js';
import { loadPresentationConfig } from './presentation-config.js';
const yaml = loadPresentationConfig();
if (!ROLE_DEFINITIONS.length || !CATEGORY_DEFINITIONS.length || !CHANNEL_DEFINITIONS.length || SLICE_DISCORD_SETUP_VERSION < 1) throw new Error('Setup manifest is internally inconsistent'); process.stdout.write(`Setup manifest v${SLICE_DISCORD_SETUP_VERSION} valid: ${ROLE_DEFINITIONS.length} roles, ${CATEGORY_DEFINITIONS.length} categories, ${CHANNEL_DEFINITIONS.length} channels; ${Object.keys(yaml).length} YAML files validated.\n`);

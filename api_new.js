// api_new.js — thin API layer over localAI.js (the online storyteller client).

import { getLocalAIJSONResponse } from './localAI.js';
import * as Config from './config.js';


/** JSON AI request; resolves with the parsed object. */
export async function getAIResponseJSON(messages, schema, options = {}) {
    const log = window.displayVisualError || console.log;
    try {
        return await getLocalAIJSONResponse(messages, schema, options);
    } catch (error) {
        log(`API: JSON response failed: ${error.message}`);
        throw error;
    }
}

/**
 * "Is the AI ready?" before a game starts. Online providers have no health
 * endpoint, so a saved key is the contract; the first real request verifies
 * reachability (with clear errors for bad keys, quota and network).
 */
export async function testLocalAI() {
    const log = window.displayVisualError || console.log;
    const backend = Config.getActiveBackendConfig();
    if (!Config.getCloudApiKey()) {
        throw new Error('No AI key saved yet. Open "AI Settings" on the main menu and paste your free key.');
    }
    log(`AI ready: ${backend.providerName || backend.modelName} (key saved).`);
    return true;
}

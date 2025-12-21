
"use strict";

// const utils = require('../../../utils');

/**
 * @param {Object} defaultFuncs
 * @param {Object} api
 * @param {Object} ctx
 */
module.exports = function (defaultFuncs, api, ctx) {
	/**
	 * Sends a typing indicator to a specific thread.
	 * @param {boolean|string} sendTyping - True to show typing indicator, false to hide, or threadID if only one parameter.
	 * @param {string} [threadID] - The ID of the thread to send the typing indicator to.
	 * @param {Function} [callback] - An optional callback function.
	 * @returns {Promise<void>}
	 */
	return async function sendTypingIndicatorV2(sendTyping, threadID, callback) {
		// Handle flexible parameter calling:
		// api.sendTypingIndicator(threadID) -> show typing
		// api.sendTypingIndicator(true/false, threadID) -> control typing
		let actualThreadID;
		let actualSendTyping;
		
		if (typeof sendTyping === 'string' || typeof sendTyping === 'number') {
			// Called with just threadID: sendTypingIndicator(threadID)
			actualThreadID = sendTyping;
			actualSendTyping = true; // Default to showing typing
			// threadID parameter becomes callback
			if (typeof threadID === 'function') {
				callback = threadID;
			}
		} else {
			// Called with both parameters: sendTypingIndicator(boolean, threadID)
			actualSendTyping = sendTyping;
			actualThreadID = threadID;
		}
		
		// Validate threadID
		if (!actualThreadID) {
			const error = new Error('sendTypingIndicator: threadID is required');
			if (callback) {
				return callback(error);
			}
			throw error;
		}
		
		let count_req = 0;
		const wsContent = {
			app_id: 2220391788200892,
			payload: JSON.stringify({
				label: 3,
				payload: JSON.stringify({
					thread_key: actualThreadID.toString(),
					is_group_thread: +(actualThreadID.toString().length >= 16),
					is_typing: +actualSendTyping,
					attribution: 0
				}),
				version: 5849951561777440
			}),
			request_id: ++count_req,
			type: 4
		};
		
		try {
			await new Promise((resolve, reject) => ctx.mqttClient.publish('/ls_req', JSON.stringify(wsContent), {}, (err, _packet) => err ? reject(err) : resolve()));
			if (callback) {
				callback();
			}
		} catch (error) {
			if (callback) {
				callback(error);
			} else {
				throw error;
			}
		}
	};
};

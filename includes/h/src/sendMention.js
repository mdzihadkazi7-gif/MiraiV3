"use strict";

var utils = require("../utils");
var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  /**
   * Send a message with mentions using MQTT API
   * This function is specifically designed for text-only messages with mentions
   * For messages with attachments, use sendMessage instead
   * 
   * @param {string|Object} msg - The message to send. Can be:
   *   - String: Plain text message
   *   - Object: { body: string, mentions: Array<{tag: string, id: string}> }
   * @param {string} threadID - The ID of the thread to send the message to
   * @param {function} callback - Optional callback function
   * @param {string} replyToMessage - Optional message ID to reply to
   * @returns {Promise} Promise that resolves when message is sent
   */
  return function sendMention(msg, threadID, callback, replyToMessage) {
    if (!ctx.mqttClient || !ctx.mqttClient.connected) {
      const err = { error: "MQTT client not connected. sendMention requires MQTT connection." };
      if (callback) callback(err);
      throw err;
    }

    if (typeof threadID === "function") {
      return threadID({ error: "Pass a threadID as a second argument." });
    }

    if (typeof callback === "string" && !replyToMessage) {
      replyToMessage = callback;
      callback = undefined;
    }

    var resolveFunc = function () { };
    var rejectFunc = function () { };
    var returnPromise = new Promise(function (resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    if (!callback) {
      callback = function (err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    // Coerce message to object format
    var msgType = utils.getType(msg);
    if (msgType !== "String" && msgType !== "Object") {
      return callback({
        error: "Message should be of type string or object and not " + msgType + "."
      });
    }

    const m = msgType === "String" ? { body: msg } : msg;
    const baseBody = m.body != null ? String(m.body) : "";

    // Check if attachment is present
    const hasAttachment = m.attachment != null;
    
    // If attachment is present, skip mentions and just send attachment
    if (hasAttachment) {
      log.info("sendMention", "Attachment detected - skipping mentions, sending attachment only");
      // Use sendMessage for attachments (it will handle it properly)
      // Import sendMessage function or use api.sendMessage
      // Since we're in the same module system, we can use api.sendMessage
      const attachmentMsg = { ...m };
      delete attachmentMsg.mentions; // Remove mentions when attachment is present
      
      // Use the standard sendMessage API for attachments
      if (api.sendMessage) {
        return api.sendMessage(attachmentMsg, threadID, callback, replyToMessage);
      } else {
        return callback({
          error: "sendMessage API not available. Cannot send attachment."
        });
      }
    }

    // Validate mentions (only if no attachment)
    if (!m.mentions || !Array.isArray(m.mentions) || m.mentions.length === 0) {
      return callback({
        error: "sendMention requires mentions array. Use sendMessage for messages without mentions."
      });
    }

    // Build mention data
    const mentionData = buildMentionData(m, baseBody);
    if (!mentionData) {
      return callback({
        error: "Failed to build mention data. Check mentions format."
      });
    }

    const reqID = Math.floor(100 + Math.random() * 900);
    const epoch = (BigInt(Date.now()) << 22n).toString();

    const payload0 = {
      thread_id: String(threadID),
      otid: utils.generateOfflineThreadingID(),
      source: 2097153,
      send_type: 1, // Text message with mentions
      sync_group: 1,
      mark_thread_read: 1,
      text: baseBody === "" ? null : baseBody,
      initiating_source: 0,
      skip_url_preview_gen: 0,
      text_has_links: hasLinks(baseBody) ? 1 : 0,
      multitab_env: 0,
      metadata_dataclass: JSON.stringify({ media_accessibility_metadata: { alt_text: null } }),
      mention_data: mentionData // Add mention data
    };

    if (replyToMessage) {
      payload0.reply_metadata = {
        reply_source_id: replyToMessage,
        reply_source_type: 1,
        reply_type: 0
      };
    }

    const content = {
      app_id: "2220391788200892",
      payload: {
        tasks: [
          {
            label: "46",
            payload: payload0,
            queue_name: String(threadID),
            task_id: 400,
            failure_count: null
          },
          {
            label: "21",
            payload: {
              thread_id: String(threadID),
              last_read_watermark_ts: Date.now(),
              sync_group: 1
            },
            queue_name: String(threadID),
            task_id: 401,
            failure_count: null
          }
        ],
        epoch_id: epoch,
        version_id: "24804310205905615",
        data_trace_id: "#" + Buffer.from(String(Math.random())).toString("base64").replace(/=+$/g, "")
      },
      request_id: reqID,
      type: 3
    };

    content.payload.tasks.forEach(t => (t.payload = JSON.stringify(t.payload)));
    content.payload = JSON.stringify(content.payload);

    // Publish to MQTT and wait for response
    return publishWithAck(content, baseBody, reqID, callback);
  };

  // Helper function to check for links
  function hasLinks(s) {
    return typeof s === "string" && /(https?:\/\/|www\.|t\.me\/|fb\.me\/|youtu\.be\/|facebook\.com\/|youtube\.com\/)/i.test(s);
  }

  // Build mention data from mentions array
  function buildMentionData(msg, baseBody) {
    if (!msg.mentions || !Array.isArray(msg.mentions) || !msg.mentions.length) return null;
    
    const base = typeof baseBody === "string" ? baseBody : "";
    const ids = [];
    const offsets = [];
    const lengths = [];
    const types = [];
    let cursor = 0;
    
    for (const m of msg.mentions) {
      const raw = String(m.tag || "").trim();
      const name = raw.replace(/^@+/, "").trim();
      
      if (!name || name.length === 0) {
        log.warn("sendMention", "Skipping empty mention tag");
        continue;
      }
      
      const start = Number.isInteger(m.fromIndex) ? m.fromIndex : cursor;
      
      // Try multiple search strategies to find the name in the body
      let idx = -1;
      let adj = 0;
      
      // Strategy 1: Exact match with @ symbol
      if (raw.startsWith("@")) {
        idx = base.indexOf(raw, start);
        if (idx !== -1) {
          adj = raw.length - name.length;
        }
      }
      
      // Strategy 2: Exact match of name only (without @)
      if (idx === -1) {
        idx = base.indexOf(name, start);
        adj = 0;
      }
      
      // Strategy 3: Case-insensitive search
      if (idx === -1) {
        const lowerBase = base.toLowerCase();
        const lowerName = name.toLowerCase();
        idx = lowerBase.indexOf(lowerName, start);
        adj = 0;
      }
      
      // Strategy 4: Find name that's surrounded by spaces or special chars
      if (idx === -1) {
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const match = base.substring(start).match(regex);
        if (match) {
          idx = start + match.index;
          adj = 0;
        }
      }
      
      // If still not found, try to find any occurrence
      if (idx < 0) {
        idx = base.lastIndexOf(name);
        if (idx === -1) {
          // Last resort: use cursor position
          idx = Math.max(cursor, base.length);
        }
        adj = 0;
      }
      
      const off = Math.max(0, idx + adj);
      const nameLen = name.length;
      
      ids.push(String(m.id || 0));
      offsets.push(off);
      lengths.push(nameLen);
      types.push("p");
      cursor = off + nameLen;
    }
    
    if (ids.length === 0) return null;
    
    return {
      mention_ids: ids.join(","),
      mention_offsets: offsets.join(","),
      mention_lengths: lengths.join(","),
      mention_types: types.join(",")
    };
  }

  // Publish to MQTT and wait for acknowledgment
  function publishWithAck(content, text, reqID, callback) {
    const mqttClient = ctx.mqttClient;
    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        mqttClient.removeListener("message", handleRes);
      };
      
      const handleRes = (topic, message) => {
        if (topic !== "/ls_resp") return;
        let jsonMsg;
        try {
          jsonMsg = JSON.parse(message.toString());
          jsonMsg.payload = JSON.parse(jsonMsg.payload);
        } catch {
          return;
        }
        if (jsonMsg.request_id !== reqID) return;
        
        const { threadID, messageID } = extractIdsFromPayload(jsonMsg.payload);
        const bodies = { body: text || null, messageID, threadID };
        cleanup();
        callback && callback(undefined, bodies);
        resolve(bodies);
      };
      
      mqttClient.on("message", handleRes);
      mqttClient.publish("/ls_req", JSON.stringify(content), { qos: 1, retain: false }, err => {
        if (err) {
          cleanup();
          callback && callback(err);
          reject(err);
        }
      });
      
      setTimeout(() => {
        if (done) return;
        cleanup();
        const err = { error: "Timeout waiting for ACK" };
        callback && callback(err);
        reject(err);
      }, 15000);
    });
  }

  // Extract message ID and thread ID from MQTT response payload
  function extractIdsFromPayload(payload) {
    let messageID = null;
    let threadID = null;
    
    function walk(n) {
      if (Array.isArray(n)) {
        if (n[0] === 5 && (n[1] === "replaceOptimsiticMessage" || n[1] === "replaceOptimisticMessage")) {
          messageID = String(n[3]);
        }
        if (n[0] === 5 && n[1] === "writeCTAIdToThreadsTable") {
          const a = n[2];
          if (Array.isArray(a) && a[0] === 19) threadID = String(a[1]);
        }
        for (const x of n) walk(x);
      }
    }
    walk(payload?.step);
    return { threadID, messageID };
  }
};


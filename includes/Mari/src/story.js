"use strict";

/**
 * Story API Module
 * Create text stories, react to stories, and reply to stories
 * 
 * @author Priyansh Rajput
 * @github https://github.com/priyanshufsdev
 * @license MIT
 */

var utils = require("../utils");
var log = require("npmlog");

/**
 * Extract Story ID from Facebook story URL
 * @private
 */
function getStoryIDFromURL(url) {
  try {
    var urlParts = url.split('/');
    var storiesIndex = urlParts.indexOf('stories');
    if (storiesIndex !== -1 && urlParts.length > storiesIndex + 2) {
      return urlParts[storiesIndex + 2];
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Core function to send reply or reaction to story
 * @private
 */
function sendStoryReply(defaultFuncs, ctx, storyIdOrUrl, message, isReaction, callback) {
  var allowedReactions = ["❤️", "👍", "🤗", "😆", "😡", "😢", "😮"];

  // Validation
  if (!storyIdOrUrl) {
    return callback({ error: "Story ID or URL is required." });
  }
  if (!message) {
    return callback({ error: "A message or reaction is required." });
  }

  var storyID = getStoryIDFromURL(storyIdOrUrl);
  if (!storyID) storyID = storyIdOrUrl;

  var variables = {
    input: {
      attribution_id_v2: "StoriesCometSuspenseRoot.react,comet.stories.viewer,via_cold_start",
      message: message,
      story_id: storyID,
      story_reply_type: isReaction ? "LIGHT_WEIGHT" : "TEXT",
      actor_id: ctx.userID,
      client_mutation_id: Math.floor(Math.random() * 10 + 1).toString()
    }
  };

  if (isReaction) {
    if (allowedReactions.indexOf(message) === -1) {
      return callback({ error: 'Invalid reaction. Please use one of: ' + allowedReactions.join(' ') });
    }
    variables.input.lightweight_reaction_actions = {
      offsets: [0],
      reaction: message
    };
  }

  var form = {
    av: ctx.userID,
    __user: ctx.userID,
    __a: "1",
    fb_dtsg: ctx.fb_dtsg,
    jazoest: ctx.jazoest,
    fb_api_caller_class: "RelayModern",
    fb_api_req_friendly_name: "useStoriesSendReplyMutation",
    variables: JSON.stringify(variables),
    doc_id: "9697491553691692"
  };

  defaultFuncs
    .post("https://www.facebook.com/api/graphql/", ctx.jar, form, {})
    .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
    .then(function(res) {
      if (res.errors) throw new Error(JSON.stringify(res.errors));
      
      var storyReplyData = res.data?.direct_message_reply;
      if (!storyReplyData) {
        throw new Error("Could not find 'direct_message_reply' in the response data.");
      }
      
      log.info('story', (isReaction ? 'Reacted to' : 'Replied to') + ' story: ' + storyID);
      callback(null, { success: true, result: storyReplyData });
    })
    .catch(function(err) {
      log.error('story', err);
      callback(err);
    });
}

module.exports = function(defaultFuncs, api, ctx) {
  
  return {
    /**
     * Create a new text-based story
     * 
     * @param {string} message - Text content of the story
     * @param {string} fontName - Font to use (headline/classic/casual/fancy)
     * @param {string} backgroundName - Background to use (orange/blue/green/modern)
     * @param {function} callback - Optional callback function
     * @returns {Promise<object>}
     */
    create: function(message, fontName, backgroundName, callback) {
      var resolveFunc = function() {};
      var rejectFunc = function() {};
      var returnPromise = new Promise(function(resolve, reject) {
        resolveFunc = resolve;
        rejectFunc = reject;
      });

      // Handle optional parameters
      if (typeof fontName === 'function') {
        callback = fontName;
        fontName = "classic";
        backgroundName = "blue";
      } else if (typeof backgroundName === 'function') {
        callback = backgroundName;
        backgroundName = "blue";
      }
      
      fontName = fontName || "classic";
      backgroundName = backgroundName || "blue";

      if (!callback) {
        callback = function(err, data) {
          if (err) return rejectFunc(err);
          resolveFunc(data);
        };
      }

      // Validation
      if (!message) {
        return callback({ error: "Message is required to create a story." });
      }

      // Font and background mapping
      var fontMap = {
        headline: "1919119914775364",
        classic: "516266749248495",
        casual: "516266749248495",
        fancy: "1790435664339626"
      };
      
      var bgMap = {
        orange: "2163607613910521",
        blue: "401372137331149",
        green: "367314917184744",
        modern: "554617635055752"
      };

      var fontId = fontMap[fontName.toLowerCase()] || fontMap.classic;
      var bgId = bgMap[backgroundName.toLowerCase()] || bgMap.blue;

      var variables = {
        input: {
          audiences: [{ stories: { self: { target_id: ctx.userID } } }],
          audiences_is_complete: true,
          logging: { composer_session_id: "createStoriesText-" + Date.now() },
          navigation_data: { attribution_id_v2: "StoriesCreateRoot.react,comet.stories.create" },
          source: "WWW",
          message: { ranges: [], text: message },
          text_format_metadata: { inspirations_custom_font_id: fontId },
          text_format_preset_id: bgId,
          tracking: [null],
          actor_id: ctx.userID,
          client_mutation_id: "2"
        }
      };

      var form = {
        __a: "1",
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "StoriesCreateMutation",
        variables: JSON.stringify(variables),
        doc_id: "24226878183562473"
      };

      defaultFuncs
        .post("https://www.facebook.com/api/graphql/", ctx.jar, form, {})
        .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
        .then(function(res) {
          if (res.errors) throw new Error(JSON.stringify(res.errors));

          var storyNode = res.data?.story_create?.viewer?.actor?.story_bucket?.nodes[0]?.first_story_to_show;
          if (!storyNode || !storyNode.id) {
            throw new Error("Could not find the storyCardID in the response.");
          }

          log.info('story.create', 'Created story with ID: ' + storyNode.id);
          callback(null, { success: true, storyID: storyNode.id });
        })
        .catch(function(err) {
          log.error('story.create', err);
          callback(err);
        });

      return returnPromise;
    },

    /**
     * React to a story with an emoji
     * 
     * @param {string} storyIdOrUrl - Story ID or full URL
     * @param {string} reaction - Emoji to react with (❤️, 👍, 🤗, 😆, 😡, 😢, 😮)
     * @param {function} callback - Optional callback function
     * @returns {Promise<object>}
     */
    react: function(storyIdOrUrl, reaction, callback) {
      var resolveFunc = function() {};
      var rejectFunc = function() {};
      var returnPromise = new Promise(function(resolve, reject) {
        resolveFunc = resolve;
        rejectFunc = reject;
      });

      if (!callback) {
        callback = function(err, data) {
          if (err) return rejectFunc(err);
          resolveFunc(data);
        };
      }

      sendStoryReply(defaultFuncs, ctx, storyIdOrUrl, reaction, true, callback);
      return returnPromise;
    },

    /**
     * Send a text message reply to a story
     * 
     * @param {string} storyIdOrUrl - Story ID or full URL
     * @param {string} message - Text message to send
     * @param {function} callback - Optional callback function
     * @returns {Promise<object>}
     */
    msg: function(storyIdOrUrl, message, callback) {
      var resolveFunc = function() {};
      var rejectFunc = function() {};
      var returnPromise = new Promise(function(resolve, reject) {
        resolveFunc = resolve;
        rejectFunc = reject;
      });

      if (!callback) {
        callback = function(err, data) {
          if (err) return rejectFunc(err);
          resolveFunc(data);
        };
      }

      sendStoryReply(defaultFuncs, ctx, storyIdOrUrl, message, false, callback);
      return returnPromise;
    },

  };
};

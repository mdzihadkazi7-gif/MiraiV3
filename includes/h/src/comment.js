"use strict";

/**
 * Comment API Module
 * Create comments on Facebook posts with support for attachments, mentions, stickers, and URLs
 * 
 * @author Priyansh Rajput
 * @github https://github.com/priyanshufsdev
 * @license MIT
 */

var utils = require("../utils");
var log = require("npmlog");

/**
 * Handle upload of attachments (images/videos) for comment
 * @param {object} defaultFuncs - Default functions for API requests
 * @param {object} ctx - Context object
 * @param {object} msg - Message object containing attachments
 * @param {object} form - Form object to populate
 * @returns {Promise<void>}
 */
async function handleUpload(defaultFuncs, ctx, msg, form) {
  if (!msg.attachments || msg.attachments.length === 0) {
    return;
  }

  var uploads = msg.attachments.map(function(item) {
    if (!utils.isReadableStream(item)) {
      throw new Error('Attachments must be a readable stream.');
    }
    
    return defaultFuncs
      .postFormData('https://www.facebook.com/ajax/ufi/upload/', ctx.jar, {
        profile_id: ctx.userID,
        source: 19,
        target_id: ctx.userID,
        file: item
      })
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function(res) {
        if (res.error || !res.payload || !res.payload.fbid) {
          throw res;
        }
        return { media: { id: res.payload.fbid } };
      });
  });

  var results = await Promise.all(uploads);
  results.forEach(function(result) {
    form.input.attachments.push(result);
  });
}

/**
 * Handle URL attachment for comment
 * @param {object} msg - Message object
 * @param {object} form - Form object
 */
function handleURL(msg, form) {
  if (typeof msg.url === 'string') {
    form.input.attachments.push({
      link: {
        external: {
          url: msg.url
        }
      }
    });
  }
}

/**
 * Handle mentions in comment body
 * @param {object} msg - Message object
 * @param {object} form - Form object
 */
function handleMentions(msg, form) {
  if (!msg.mentions) return;

  for (var i = 0; i < msg.mentions.length; i++) {
    var item = msg.mentions[i];
    var tag = item.tag;
    var id = item.id;
    var fromIndex = item.fromIndex;
    
    if (typeof tag !== 'string' || !id) {
      log.warn('comment', 'Mentions must have a string "tag" and an "id".');
      continue;
    }
    
    var offset = msg.body.indexOf(tag, fromIndex || 0);
    if (offset < 0) {
      log.warn('comment', 'Mention for "' + tag + '" not found in message string.');
      continue;
    }
    
    form.input.message.ranges.push({
      entity: { id: id },
      length: tag.length,
      offset: offset
    });
  }
}

/**
 * Handle sticker attachment for comment
 * @param {object} msg - Message object
 * @param {object} form - Form object
 */
function handleSticker(msg, form) {
  if (msg.sticker) {
    form.input.attachments.push({
      media: {
        id: String(msg.sticker)
      }
    });
  }
}

/**
 * Submit final comment form to GraphQL endpoint
 * @param {object} defaultFuncs - Default functions
 * @param {object} ctx - Context object
 * @param {object} form - Fully constructed form object
 * @returns {Promise<object>}
 */
async function createContent(defaultFuncs, ctx, form) {
  var res = await defaultFuncs
    .post('https://www.facebook.com/api/graphql/', ctx.jar, {
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'useCometUFICreateCommentMutation',
      variables: JSON.stringify(form),
      server_timestamps: true,
      doc_id: 6993516810709754
    })
    .then(utils.parseAndCheckLogin(ctx, defaultFuncs));
  
  if (res.errors) {
    throw res;
  }
  
  var commentEdge = res.data.comment_create.feedback_comment_edge;
  return {
    id: commentEdge.node.id,
    url: commentEdge.node.feedback.url,
    count: res.data.comment_create.feedback.total_comment_count
  };
}

module.exports = function(defaultFuncs, api, ctx) {
  /**
   * Create a comment on a Facebook post
   * Can also reply to an existing comment
   * 
   * @param {string|object} msg - Message to post (string or object with body, attachments, mentions, etc.)
   * @param {string} postID - ID of the post to comment on
   * @param {string} replyCommentID - Optional: ID of comment to reply to
   * @param {function} callback - Optional callback function
   * @returns {Promise<object>}
   */
  return function createCommentPost(msg, postID, replyCommentID, callback) {
    var resolveFunc = function() {};
    var rejectFunc = function() {};
    var returnPromise = new Promise(function(resolve, reject) {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    // Handle optional parameters
    if (typeof replyCommentID === 'function') {
      callback = replyCommentID;
      replyCommentID = null;
    }
    
    if (!callback) {
      callback = function(err, data) {
        if (err) return rejectFunc(err);
        resolveFunc(data);
      };
    }

    // Validation
    if (typeof msg !== 'string' && typeof msg !== 'object') {
      var error = 'Message must be a string or an object.';
      log.error('comment', error);
      return callback({ error: error });
    }
    
    if (typeof postID !== 'string') {
      var error2 = 'postID must be a string.';
      log.error('comment', error2);
      return callback({ error: error2 });
    }

    // Prepare message object
    var messageObject = typeof msg === 'string' ? { body: msg } : msg;
    messageObject.mentions = messageObject.mentions || [];
    messageObject.attachments = messageObject.attachments || [];
    
    // Build form
    var form = {
      feedLocation: 'NEWSFEED',
      feedbackSource: 1,
      groupID: null,
      input: {
        client_mutation_id: Math.round(Math.random() * 19).toString(),
        actor_id: ctx.userID,
        attachments: [],
        feedback_id: Buffer.from('feedback:' + postID).toString('base64'),
        message: {
          ranges: [],
          text: messageObject.body || ''
        },
        reply_comment_parent_fbid: replyCommentID || null,
        is_tracking_encrypted: true,
        tracking: [],
        feedback_source: 'NEWS_FEED',
        idempotence_token: 'client:' + utils.getGUID(),
        session_id: utils.getGUID()
      },
      scale: 1,
      useDefaultActor: false
    };

    // Process all handlers and create comment
    handleUpload(defaultFuncs, ctx, messageObject, form)
      .then(function() {
        handleURL(messageObject, form);
        handleMentions(messageObject, form);
        handleSticker(messageObject, form);
        return createContent(defaultFuncs, ctx, form);
      })
      .then(function(info) {
        log.info('comment', 'Comment created successfully: ' + info.id);
        callback(null, info);
      })
      .catch(function(err) {
        log.error('comment', err);
        callback(err);
      });

    return returnPromise;
  };
};

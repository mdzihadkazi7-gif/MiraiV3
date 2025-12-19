"use strict";

var utils = require("../utils");
var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  /**
   * Change thread theme using MQTT (more reliable than HTTP)
   * Made by Choru Official - Ported to fca-updated format
   * 
   * Features:
   * - List all available themes: api.changeThreadTheme("list", threadID)
   * - Set theme by name: api.changeThreadTheme("love", threadID)
   * - Set theme by ID: api.changeThreadTheme("168332145275126", threadID)
   * - Partial name match: api.changeThreadTheme("dark", threadID) -> finds "Dark Mode"
   * 
   * @param {string} themeName - Theme name, theme ID, or "list" to show all themes
   * @param {string} threadID - Thread ID to change theme
   * @param {function} callback - Optional callback(err, result)
   * @returns {Promise} Promise that resolves with theme data or list
   */
  return function changeThreadTheme(themeName, threadID, callback) {
    var resolveFunc = function () {};
    var rejectFunc = function () {};
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

    // Validate parameters
    if (!threadID) {
      return callback({ error: "threadID is required to change theme." });
    }

    if (!themeName) {
      return callback({ error: "themeName (or 'list') is required." });
    }

    // Check MQTT connection (required for theme change)
    if (!ctx.mqttClient || !ctx.mqttClient.connected) {
      return callback({ 
        error: "MQTT not connected. Theme changes require MQTT connection. Make sure bot is fully started with listenMqtt active." 
      });
    }

    /**
     * Fetch all available themes from Facebook GraphQL
     */
    function fetchAllThemes(cb) {
      log.info("changeThreadTheme", "Fetching available themes from Facebook...");
      
      var form = {
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: "MWPThreadThemeQuery_AllThemesQuery",
        variables: JSON.stringify({ version: "default" }),
        server_timestamps: true,
        doc_id: "24474714052117636"
      };

      defaultFuncs
        .post("https://www.facebook.com/api/graphql/", ctx.jar, form, null, {
          "x-fb-friendly-name": "MWPThreadThemeQuery_AllThemesQuery",
          "x-fb-lsd": ctx.lsd || ctx.fb_dtsg,
          "referer": "https://www.facebook.com/messages/t/" + threadID
        })
        .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
        .then(function (resData) {
          if (resData.errors) {
            return cb({ error: "GraphQL error: " + JSON.stringify(resData.errors) });
          }

          if (!resData.data || !resData.data.messenger_thread_themes) {
            return cb({ error: "Could not retrieve themes from Facebook." });
          }

          var themes = resData.data.messenger_thread_themes
            .map(function (themeData) {
              if (!themeData || !themeData.id) return null;

              return {
                id: themeData.id,
                name: themeData.accessibility_label,
                description: themeData.description,
                appColorMode: themeData.app_color_mode,
                fallbackColor: themeData.fallback_color,
                gradientColors: themeData.gradient_colors,
                backgroundImage: themeData.background_asset?.image?.uri,
                iconAsset: themeData.icon_asset?.image?.uri,
                // Color details
                composerBackgroundColor: themeData.composer_background_color,
                composerTintColor: themeData.composer_tint_color,
                titleBarBackgroundColor: themeData.title_bar_background_color,
                titleBarTextColor: themeData.title_bar_text_color,
                hotLikeColor: themeData.hot_like_color,
                inboundMessageGradientColors: themeData.inbound_message_gradient_colors,
                messageTextColor: themeData.message_text_color
              };
            })
            .filter(Boolean);

          log.info("changeThreadTheme", "Successfully fetched " + themes.length + " themes");
          cb(null, themes);
        })
        .catch(function (err) {
          log.error("changeThreadTheme", "Failed to fetch themes:", err);
          cb({ error: "Failed to fetch theme list: " + (err.message || err) });
        });
    }

    /**
     * Set thread theme using MQTT publish
     */
    function setThemeViaMqtt(themeID, actualThemeName, cb) {
      log.info("changeThreadTheme", "Setting theme '" + actualThemeName + "' (ID: " + themeID + ") for thread " + threadID);

      var currentEpochId = parseInt(utils.generateOfflineThreadingID());
      var publishedCount = 0;
      var errors = [];

      // Helper to create and publish MQTT message
      function createAndPublish(label, queueName, payload, done) {
        currentEpochId = parseInt(utils.generateOfflineThreadingID());
        ctx.wsReqNumber += 1;
        ctx.wsTaskNumber += 1;

        var requestId = ctx.wsReqNumber;

        var queryPayload = {
          thread_key: threadID.toString(),
          theme_fbid: themeID.toString(),
          sync_group: 1
        };

        // Merge additional payload
        Object.keys(payload).forEach(function(key) {
          queryPayload[key] = payload[key];
        });

        var query = {
          failure_count: null,
          label: label,
          payload: JSON.stringify(queryPayload),
          queue_name: queueName,
          task_id: ctx.wsTaskNumber
        };

        var context = {
          app_id: ctx.appID || "2220391788200892",
          payload: {
            epoch_id: currentEpochId,
            tasks: [query],
            version_id: "24631415369801570"
          },
          request_id: requestId,
          type: 3
        };

        context.payload = JSON.stringify(context.payload);

        log.info("changeThreadTheme", "Publishing MQTT message: label=" + label + ", queueName=" + queueName);

        ctx.mqttClient.publish("/ls_req", JSON.stringify(context), { qos: 1, retain: false }, function (err) {
          if (err) {
            log.error("changeThreadTheme", "MQTT publish failed for " + queueName + ":", err);
            errors.push("Failed to publish " + queueName + ": " + err.message);
          } else {
            publishedCount++;
            log.info("changeThreadTheme", "Successfully published " + queueName);
          }
          done();
        });
      }

      // Publish all required MQTT messages in parallel
      var pending = 4;
      function checkComplete() {
        pending--;
        if (pending === 0) {
          if (errors.length > 0) {
            return cb({ error: "Some MQTT publishes failed: " + errors.join(", ") });
          }

          var eventData = {
            type: "thread_theme_update",
            threadID: threadID,
            themeID: themeID,
            themeName: actualThemeName,
            senderID: ctx.userID,
            timestamp: Date.now()
          };

          log.info("changeThreadTheme", "✅ Theme changed successfully!");
          cb(null, eventData);
        }
      }

      // Publish 4 different MQTT messages (required by Facebook)
      createAndPublish("1013", "ai_generated_theme", {}, checkComplete);
      createAndPublish("1037", "msgr_custom_thread_theme", {}, checkComplete);
      createAndPublish("1028", "thread_theme_writer", {}, checkComplete);
      createAndPublish("43", "thread_theme", { source: null, payload: null }, checkComplete);
    }

    /**
     * Main logic
     */
    fetchAllThemes(function (err, themes) {
      if (err) {
        return callback(err);
      }

      // If user wants to list themes
      if (themeName.toLowerCase() === "list") {
        log.info("changeThreadTheme", "Returning list of " + themes.length + " available themes");
        return callback(null, themes);
      }

      // Find matching theme
      var normalizedThemeName = themeName.toLowerCase();
      var matchedTheme = null;

      // 1. Try exact ID match
      if (!isNaN(normalizedThemeName)) {
        matchedTheme = themes.find(function (t) {
          return t.id === normalizedThemeName;
        });
      }

      // 2. Try exact name match
      if (!matchedTheme) {
        matchedTheme = themes.find(function (t) {
          return t.name.toLowerCase() === normalizedThemeName;
        });
      }

      // 3. Try partial name match
      if (!matchedTheme) {
        matchedTheme = themes.find(function (t) {
          return t.name.toLowerCase().includes(normalizedThemeName);
        });
      }

      if (!matchedTheme) {
        log.warn("changeThreadTheme", "Theme '" + themeName + "' not found");
        return callback({
          error: "Theme \"" + themeName + "\" not found. Use api.changeThreadTheme('list', threadID) to see available themes."
        });
      }

      // Set the theme
      setThemeViaMqtt(matchedTheme.id, matchedTheme.name, callback);
    });

    return returnPromise;
  };
};

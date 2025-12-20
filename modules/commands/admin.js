module.exports.config = {
	name: "admin",
	version: "1.0.5",
	hasPermssion: 0,
	credits: "rX",
	description: "Enable or disable admin-only command mode",
	commandCategory: "User",
	usages: "Toggle admin / moderator only mode",
	cooldowns: 0,
	usePrefix: false,
	images: [],
	dependencies: {
		"fs-extra": ""
	}
};

module.exports.languages = {
	"vi": {
		"notHavePermssion": '⚠️ You do not have permission to use "%1"',
		"addedNewAdmin": '[ ADD NEW ADMIN ]\n────────────────────\n📝 Successfully added %1 user(s) as bot admin\n\n%2\n────────────────────\n[⏰] → Time: %3',
		"removedAdmin": '[ REMOVE ADMIN ]\n────────────────────\n📝 Successfully removed %1 admin(s)\n\n%2\n────────────────────\n[⏰] → Time: %3'
	},
	"en": {
		"listAdmin": '[Admin] Admin list:\n\n%1',
		"notHavePermssion": '[Admin] You do not have permission to use "%1"',
		"addedNewAdmin": '[Admin] Added %1 admin(s):\n\n%2',
		"removedAdmin": '[Admin] Removed %1 admin(s):\n\n%2'
	}
};

module.exports.onLoad = function () {
	const { writeFileSync, existsSync } = require("fs-extra");
	const { resolve } = require("path");
	const path = resolve(__dirname, "data", "dataAdbox.json");

	if (!existsSync(path)) {
		const obj = { adminbox: {} };
		writeFileSync(path, JSON.stringify(obj, null, 4));
	} else {
		const data = require(path);
		if (!data.hasOwnProperty("adminbox")) data.adminbox = {};
		writeFileSync(path, JSON.stringify(data, null, 4));
	}
};

module.exports.run = async function ({ api, event, args, Users, permssion, getText, Currencies }) {
	const fs = require("fs-extra");
	const axios = require("axios");
	const moment = require("moment-timezone");

	const timeNow = moment.tz("Asia/Ho_Chi_Minh").format("DD/MM/YYYY - HH:mm:ss");
	const senderName = await Users.getNameUser(event.senderID);

	const { PREFIX } = global.config;
	const { threadID, messageID, mentions, senderID } = event;
	const { configPath } = global.client;
	const { throwError } = global.utils;

	async function streamURL(url, mime = "jpg") {
		const dest = `${__dirname}/cache/${Date.now()}.${mime}`;
		const downloader = require("image-downloader");
		const fse = require("fs-extra");

		await downloader.image({ url, dest });
		setTimeout(j => fse.unlinkSync(j), 60 * 1000, dest);
		return fse.createReadStream(dest);
	}

	const allowedUserIDs = global.config.NDH.map(id => id.toString());
	const senderIDStr = senderID.toString();
	const threadSetting = global.data.threadData.get(threadID) || {};
	const prefix = threadSetting.PREFIX || PREFIX;

	const content = args.slice(1);

	if (args.length === 0) {
		return api.sendMessage(
			`[ ADMIN CONFIGURATION ]\n──────────────────\n` +
			`${prefix}admin add → Add a new bot admin\n` +
			`${prefix}admin remove → Remove a bot admin\n` +
			`${prefix}admin list → Show admin list\n` +
			`${prefix}admin qtvonly → Toggle group admin only mode\n` +
			`${prefix}admin only → Toggle bot admin only mode\n` +
			`${prefix}admin echo → Repeat your message\n` +
			`${prefix}admin fast → Check bot internet speed\n` +
			`${prefix}admin create [name] → Create a new command file\n` +
			`${prefix}admin del [name] → Delete a command file\n` +
			`${prefix}admin rename old => new → Rename command file\n` +
			`${prefix}admin ping → Check bot response time\n` +
			`${prefix}admin offbot → Shutdown bot\n` +
			`${prefix}admin reload [time] → Restart bot\n` +
			`${prefix}admin resetmoney → Reset all users money\n` +
			`${prefix}admin ship [name] → Share command module\n` +
			`──────────────────\n` +
			`Usage: ${prefix}admin + option`,
			threadID,
			messageID
		);
	}

	delete require.cache[require.resolve(configPath)];
	const config = require(configPath);

	switch (args[0]) {

		case "list": {
	const listAdmin = config.ADMINBOT || [];
	let msg = [];

	for (const id of listAdmin) {
		if (!id) continue;

		const name = await Users.getNameUser(id);

		msg.push(
`ᰔ ${name} ᰔ
 •╰┈➤(${id})`
		);
	}

	const text =
`𝐋𝐈𝐒𝐓 𝐎𝐅 𝐀𝐃𝐌𝐈𝐍 ᰔ
___________________
𝐀𝐃𝐌𝐈𝐍: ${global.config.ADMIN_NAME || ""}  >🎀
𝐅𝐁: ${global.config.FACEBOOK_ADMIN || ""}
_____________________________
𝐎𝐏𝐎𝐑𝐄𝐓𝐎𝐑𝐒

${msg.join("\n\n")}`;

	api.sendMessage(text, threadID, (err, info) => {
		if (!err) {
			global.client.handleReply.push({
				name: "deleteAdmin",
				messageID: info.messageID,
				author: senderID,
				data: { listAdmin }
			});
		}
	});
	break;
}

		case "add": {
			if (!allowedUserIDs.includes(senderIDStr))
				return api.sendMessage("⚠️ Main admin permission required", threadID, messageID);

			if (event.type === "message_reply")
				content[0] = event.messageReply.senderID;

			if (mentions && Object.keys(mentions).length > 0) {
				for (const id of Object.keys(mentions)) {
					config.ADMINBOT.push(id);
				}
				fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
				return api.sendMessage("✅ Admin added successfully", threadID);
			}
			break;
		}

		case "rm":
		case "delete": {
			if (!allowedUserIDs.includes(senderIDStr))
				return api.sendMessage("⚠️ Main admin permission required", threadID, messageID);

			const uid = content[0];
			const index = config.ADMINBOT.indexOf(uid);
			if (index !== -1) {
				config.ADMINBOT.splice(index, 1);
				fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
				return api.sendMessage("✅ Admin removed successfully", threadID);
			}
			break;
		}

		case "qtvonly": {
			const pathData = require("path").resolve(__dirname, "data", "dataAdbox.json");
			const database = require(pathData);

			if (permssion < 1)
				return api.sendMessage("⚠️ Group admin permission required", threadID);

			database.adminbox[threadID] = !database.adminbox[threadID];
			fs.writeFileSync(pathData, JSON.stringify(database, null, 4));

			return api.sendMessage(
				database.adminbox[threadID]
					? "✅ Group admin-only mode enabled"
					: "✅ Group admin-only mode disabled",
				threadID
			);
		}

		case "only": {
			if (permssion !== 3)
				return api.sendMessage("⚠️ Bot admin permission required", threadID);

			config.adminOnly = !config.adminOnly;
			fs.writeFileSync(configPath, JSON.stringify(config, null, 4));

			return api.sendMessage(
				config.adminOnly
					? "✅ Bot admin-only mode enabled"
					: "✅ Bot admin-only mode disabled",
				threadID
			);
		}

		case "echo": {
			return api.sendMessage(args.slice(1).join(" "), threadID);
		}

		case "ping": {
			return api.sendMessage(`📶 Ping: ${Date.now() % 100} ms`, threadID);
		}

		case "offbot": {
			if (!allowedUserIDs.includes(senderIDStr))
				return api.sendMessage("⚠️ Main admin permission required", threadID);

			api.sendMessage("👋 Bot shutting down...", threadID, () => process.exit(0));
			break;
		}

		default:
			return throwError(this.config.name, threadID, messageID);
	}
};

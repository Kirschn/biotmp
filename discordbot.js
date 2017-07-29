const Discord = require("discord.js");
var discordClient = null;
var clientState = {
    "online": false,
    "loginName": null,
    "onlineSince": null
}
module.exports = {
    init: function(token) {
        discordClient = new Discord.Client();

        discordClient.on('ready', function () {
            console.log("Logged in as ${discordClient.user.tag}!");
            clientState.online = true;
            clientState.loginName = discordClient.user.tag;
            clientState.online = Date.now();
        });

        discordClient.on('message', function (msg) {
            if (msg.content === 'ping') {
            msg.reply('Pong!');
        }
        });

        discordClient.login('token');
    }
}
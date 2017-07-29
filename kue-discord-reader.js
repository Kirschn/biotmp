const Discord = require("discord.js");
var mysql = require('mysql');
var fs = require("fs");
var config = JSON.parse(fs.readFileSync("config.json", "utf8"));
var sqlConnection = mysql.createConnection(config.mysql);
var discordClient = null;
sqlConnection.connect();
var kue = require('kue'),
    queue = kue.createQueue();
var triggerWords = {

};
var clientState = {
    "online": false,
    "loginName": null,
    "onlineSince": null
};
function biotmp(token) {
    discordClient = new Discord.Client();
    discordClient.on('ready', function () {
        console.log("Logged in as " + discordClient.user.tag);
        console.log("https://discordapp.com/oauth2/authorize?client_id=" + config.clientID + "&scope=bot&permissions=0")
        clientState.online = true;
        clientState.loginName = discordClient.user.tag;
        clientState.online = Date.now();
    });

    discordClient.on('message', function (msg) {
        console.log(msg);
        if (triggerWords[msg.channel.guild.id] === undefined && msg.content.indexOf("biotmp ") === 0) {
            // triggered - default
            // add triggerword to msg object for further processing
            msg.triggerWord = "biotmp ";
            //and queue processing
            queue.create('msg_process', msg).priority("low").save();
        } else if (triggerWords[msg.channel.guild.id] !== undefined) {
            if (msg.content.indexOf(triggerWords[msg.channel.guild.id] + " ") === 0) {
                // triggered - custom triggerword
                // add triggerword to msg object for further processing
                msg.triggerWord = triggerWords[msg.channel.guild.id] + " ";
                //and queue processing
                queue.create('msg_process', msg).priority("low").save();

            }
        }

    });

    discordClient.login(token);
}
function updateTriggerWords() {
    sqlConnection.query("SELECT id, server_id, triggerword FROM triggerword", function (err, results) {
       if (err) throw err;
       triggerWords = {};
       results.forEach(function (currentEntry) {
           triggerWords[currentEntry.server_id] = currentEntry.triggerword;
       });
    });
}
setInterval(updateTriggerWords, 1000);
biotmp(config.token);
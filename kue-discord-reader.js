const Discord = require("discord.js");
var mysql = require('mysql');
var fs = require("fs");
var config = JSON.parse(fs.readFileSync("config.json", "utf8"));
var sqlConnection = mysql.createConnection(config.mysql);
var discordClient = null;
sqlConnection.connect();

var kue = require('kue'),
    queue = kue.createQueue({
        prefix: 'q',
        redis: {
            port: 6379,
            host: '127.0.0.1'
        }
    });
var triggerWords = {

};
var clientState = {
    "online": false,
    "loginName": null,
    "onlineSince": null
};
queue.on( 'error', function( err ) {
    console.log( 'Oops... ', err );
});
function biotmp(token) {
    queue.process('message_send', function (job, done) {
        discordClient.send(job.data.channel_id, job.data.content, JSON.parse(job.data.options), function(error, message) {
            if (!error) {
                done();
            } else {
                done(error);
            }
        });
    });
    function queueMSG(msg) {
        console.log(msg);
        var elMSGObj = {
            "message": msg.content,
            "channel": {
                "type": msg.channel.type,
                "id": msg.channel.id,
                "name": msg.channel.name
            },
            "server": {
                "id": msg.channel.guild.id,
                "name": msg.channel.guild.name
            },
            "author": msg.author,
            "tts": msg.tts,
            "system": msg.system,
            "nonce": msg.nonce,
            "mentions": {
                "everyone": msg.mentions.everyone,
                "users": JSON.stringify(msg.mentions.users),
                "roles": JSON.stringify(msg.mentions.roles)

            }
        };
        elMSGObj.author.lastMessage = undefined;
        for (var i in elMSGObj.mentions.users) {
            elMSGObj.mentions.users[i].lastMessage = undefined;
        }
        var job = queue.create('cmd_process', {
            "title": "Discord Message Processing",
            "message-obj": JSON.stringify(elMSGObj)

        }).priority("low").save( function(err){
            if( !err ) console.log( job.id );
        });
    }
    discordClient = new Discord.Client();
    discordClient.on('ready', function () {
        console.log("Logged in as " + discordClient.user.tag);
        console.log("https://discordapp.com/oauth2/authorize?client_id=" + config.clientID + "&scope=bot&permissions=0")
        clientState.online = true;
        clientState.loginName = discordClient.user.tag;
        clientState.online = Date.now();
    });

    discordClient.on('message', function (msg) {
        if (triggerWords[msg.channel.guild.id] === undefined && msg.content.indexOf("biotmp ") === 0) {
            // triggered - default
            // add triggerword to msg object for further processing
            console.log("Triggered");
            msg.triggerWord = "biotmp ";
            //and queue processing
            queueMSG(msg);
        } else if (triggerWords[msg.channel.guild.id] !== undefined) {
            if (msg.content.indexOf(triggerWords[msg.channel.guild.id] + " ") === 0) {
                // triggered - custom triggerword
                // add triggerword to msg object for further processing
                msg.triggerWord = triggerWords[msg.channel.guild.id] + " ";
                //and queue processing
                queueMSG(msg);

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
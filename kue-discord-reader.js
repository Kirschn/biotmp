const Discord = require("discord.js");
var mysql = require('mysql');
var fs = require("fs");
var config = JSON.parse(fs.readFileSync("config.json", "utf8"));
var sqlConnection = mysql.createConnection(config.mysql);
var discordClient = null;
sqlConnection.connect();
function censor(censor) {
    var i = 0;

    return function(key, value) {
        if(i !== 0 && typeof(censor) === 'object' && typeof(value) == 'object' && censor == value)
            return '[Circular]';

        if(i >= 29) // seems to be a harded maximum of 30 serialized objects?
            return '[Unknown]';

        ++i; // so we know we aren't using the original object anymore

        return value;
    }
}

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
    function queueMSG(msg) {
        var job = queue.create('msg_process', {
            "title": "Discord Message Processing",
            "content": JSON.stringify({
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
                "mentions": JSON.stringify(msg.mentions, censor(msg.mentions))
            })


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